import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { Workspaces, HttpError } from './service.mjs';

const assets = new Map([
  ['/sprt/training', ['public/training.html', 'text/html; charset=utf-8']],
  ['/sprt/admin.js', ['public/admin.js', 'text/javascript; charset=utf-8']],
  ['/sprt/training-client.js', ['public/training-client.js', 'text/javascript; charset=utf-8']],
]);
export async function authenticate(req, backend, fetcher = fetch) {
  if (!req.headers.cookie && !req.headers.authorization) throw new HttpError(401, 'Войдите в SPRT API');
  let response;
  try {
    response = await fetcher(backend, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json',
        ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
      body: JSON.stringify({ query: 'query { me { uid } }' }),
    });
  } catch { throw new HttpError(503, 'Сервис авторизации временно недоступен'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors || !body.data?.me?.uid) throw new HttpError(401, 'Войдите в SPRT API');
  return body.data.me.uid;
}
export function createServer({ service, backend, origin, fetcher = fetch }) {
  return http.createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        return send(200, await readFile(new URL(file, import.meta.url)), type);
      }
      if (!['/sprt/me', '/sprt/events', '/sprt/report'].includes(url.pathname)) throw new HttpError(404, 'Не найдено');
      // Same-origin custom header prevents cross-site forms from writing events.
      if (req.headers['x-sprt-request'] !== '1' || (req.headers.origin && req.headers.origin !== origin)) throw new HttpError(403, 'Запрос с другого сайта запрещён');
      const expected = url.pathname === '/sprt/events' ? 'POST' : 'GET';
      if (req.method !== expected) throw new HttpError(405, 'Метод не поддерживается');
      const uid = await authenticate(req, backend, fetcher);
      if (url.pathname === '/sprt/me') return send(200, await service.me(uid));
      if (url.pathname === '/sprt/report') return send(200, await service.report(uid, url.searchParams.get('uid')));
      if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Нужен JSON');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString('utf8');
        if (Buffer.byteLength(raw) > 4096) throw new HttpError(413, 'Слишком большой запрос');
      }
      let input;
      try { input = JSON.parse(raw); } catch { throw new HttpError(400, 'Некорректный JSON'); }
      return send(200, await service.record(uid, input));
    } catch (error) {
      if (!error.status) console.error('SPRT request failed:', error.code || error.name);
      return send(error.status || 500, { error: error.status ? error.message : 'Не удалось выполнить запрос' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
  await pool.query(await readFile(new URL('schema.sql', import.meta.url), 'utf8'));
  const service = new Workspaces(pool, {
    admins: (process.env.SPRT_TRAINING_ADMINS || 'm.demetiev@sprt-service.ru').split(','),
    collection: JSON.parse(await readFile(new URL('data/collection.json', import.meta.url), 'utf8')),
    environment: JSON.parse(await readFile(new URL('data/environment.json', import.meta.url), 'utf8')),
  });
  await service.reconcile();
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await service.reconcile(); } catch (e) { console.error('SPRT reconcile failed:', e.code || e.message); }
    finally { running = false; }
  }, 30000);
  const server = createServer({ service,
    backend: process.env.HOPPSCOTCH_GQL || 'http://hoppscotch-hoppscotch-1/backend/graphql',
    origin: process.env.PUBLIC_ORIGIN || 'https://sprtapi.sprt-service.ru' });
  server.listen(Number(process.env.PORT || 8082), '0.0.0.0');
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
    clearInterval(timer);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}

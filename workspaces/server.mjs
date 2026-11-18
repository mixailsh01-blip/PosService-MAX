import http from 'node:http';
import { readFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { TrainingStore } from './training-store.mjs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { Workspaces, HttpError, VERSION } from './service.mjs';
import { Diagnostics } from './diagnostics.mjs';

const assets = new Map([
  ['/sprt/training', ['public/training.html', 'text/html; charset=utf-8']],
  ['/sprt/admin.js', ['public/admin.js', 'text/javascript; charset=utf-8']],
  ['/sprt/training-client.js', ['public/training-client.js', 'text/javascript; charset=utf-8']],
  ['/sprt/settings', ['public/settings.html', 'text/html; charset=utf-8']],
  ['/sprt/debug.js', ['public/debug.js', 'text/javascript; charset=utf-8']],
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
  const diagnostics = new Diagnostics();
  return http.createServer(async (req, res) => {
    const started = performance.now(), requestId = randomUUID();
    let uid = null, path = 'other';
    res.on('finish', () => diagnostics.add({ requestId, path, uid,
      method: req.method, status: res.statusCode, duration: performance.now() - started }));
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-SPRT-Request-Id': requestId });
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      path = url.pathname;
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true, version: VERSION });
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        return send(200, await readFile(new URL(file, import.meta.url)), type);
      }
      if (!['/sprt/me', '/sprt/events', '/sprt/report', '/sprt/recover', '/sprt/debug'].includes(url.pathname)) throw new HttpError(404, 'Не найдено');
      // Same-origin custom header prevents cross-site forms from writing events.
      if (req.headers['x-sprt-request'] !== '1' || (req.headers.origin && req.headers.origin !== origin)) throw new HttpError(403, 'Запрос с другого сайта запрещён');
      const expected = ['/sprt/events','/sprt/recover'].includes(url.pathname) ? 'POST' : 'GET';
      if (req.method !== expected) throw new HttpError(405, 'Метод не поддерживается');
      uid = await authenticate(req, backend, fetcher);
      if (url.pathname === '/sprt/me') return send(200, await service.me(uid));
      if (url.pathname === '/sprt/report') return send(200, await service.report(uid, url.searchParams.get('uid')));
      if (url.pathname === '/sprt/debug') {
        const debug = await service.debug(uid, url.searchParams.get('uid'));
        return send(200, { ...debug, requests: diagnostics.read(uid, debug.admin) });
      }
      if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Нужен JSON');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString('utf8');
        if (Buffer.byteLength(raw) > 4096) throw new HttpError(413, 'Слишком большой запрос');
      }
      let input;
      try { input = JSON.parse(raw); } catch { throw new HttpError(400, 'Некорректный JSON'); }
      return send(200, url.pathname === '/sprt/recover' ? await service.recover(uid, input) : await service.record(uid, input));
    } catch (error) {
      if (!error.status) console.error('SPRT request failed:', error.code || error.name);
      return send(error.status || 500, { error: error.status ? error.message : 'Не удалось выполнить запрос' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
  await pool.query(await readFile(new URL('schema.sql', import.meta.url), 'utf8'));
  const training = new TrainingStore(process.env.TRAINING_SQLITE);
  const service = new Workspaces(pool, {
    training,
    admins: (process.env.SPRT_TRAINING_ADMINS || 'm.demetiev@sprt-service.ru').split(','),
    collection: JSON.parse(await readFile(new URL('data/collection.json', import.meta.url), 'utf8')),
    environment: JSON.parse(await readFile(new URL('data/environment.json', import.meta.url), 'utf8')),
  });
  await service.reconcile();
  const recoveryFile = await readFile(new URL('data/recovery.json', import.meta.url), 'utf8').catch((e) => { if (e.code === 'ENOENT') return '[]'; throw e; });
  for (const snapshot of JSON.parse(recoveryFile)) {
    await service.recover(snapshot.uid, snapshot, 'backup');
  }
  const backupDir = join(dirname(process.env.TRAINING_SQLITE), 'backups');
  async function saveBackup() {
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await training.backup(join(backupDir, new Date().toISOString().replaceAll(':','-') + '.sqlite'));
    const files = (await readdir(backupDir)).filter((f) => /^\d{4}-.*\.sqlite$/.test(f)).sort();
    for (const file of files.slice(0, -14)) await unlink(join(backupDir, file));
  }
  await saveBackup();
  const backupTimer = setInterval(() => saveBackup().catch((e) => console.error('SQLite backup failed:', e.code || e.name)), 24*60*60*1000);
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
    clearInterval(backupTimer);
    server.close(() => pool.end().then(() => { training.close(); process.exit(0); }));
  });
}

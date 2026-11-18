import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, authenticate } from '../server.mjs';

test('authentication rejects anonymous and GraphQL errors; identity comes from Hoppscotch', async () => {
  await assert.rejects(authenticate({ headers: {} }, 'http://backend'), (e) => e.status === 401);
  await assert.rejects(authenticate({ headers: { cookie: 'access_token=bad' } }, 'http://backend', async () => ({ ok: true, json: async () => ({ errors: [{}] }) })), (e) => e.status === 401);
  const uid = await authenticate({ headers: { cookie: 'access_token=valid' } }, 'http://backend', async (url, opts) => {
    assert.equal(opts.headers.Cookie, 'access_token=valid');
    assert.equal(opts.body, JSON.stringify({ query: 'query { me { uid } }' }));
    return { ok: true, json: async () => ({ data: { me: { uid: 'real-user' } } }) };
  }); assert.equal(uid, 'real-user');
});

test('HTTP denies cross-site writes and binds events to authenticated user', async (t) => {
  const calls = [];
  const server = createServer({ origin: 'https://portal.example', backend: 'http://backend',
    service: { record: async (uid, event) => { calls.push([uid, event]); return { ok: true }; }, me: async (uid) => ({ uid }) },
    fetcher: async () => ({ ok: true, json: async () => ({ data: { me: { uid: 'alice' } } }) }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/sprt/me')).status, 403);
  const headers = { Cookie: 'access_token=valid', 'X-SPRT-Request': '1', 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/sprt/events', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/sprt/events', { method: 'POST', headers, body: '{bad' })).status, 400);
  assert.equal((await fetch(base + '/sprt/events', { method: 'POST', headers, body: JSON.stringify({ uid: 'bob', kind: 'attempt' }) })).status, 200);
  assert.equal(calls[0][0], 'alice'); assert.equal(calls.length, 1);
  assert.equal((await fetch(base + '/sprt/report', { method: 'POST', headers, body: '{}' })).status, 405);
});

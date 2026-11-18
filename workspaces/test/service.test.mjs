import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Workspaces, LIBRARY, LESSONS } from '../service.mjs';

// The relevant tables use the same column names, types and required fields as
// Hoppscotch 55908a76's Prisma schema. PGlite executes real PostgreSQL SQL.
const fixture = `
CREATE TYPE "TeamAccessRole" AS ENUM ('OWNER','EDITOR','VIEWER');
CREATE TABLE "User"(uid text PRIMARY KEY,email text UNIQUE,"displayName" text);
CREATE TABLE "Team"(id text PRIMARY KEY,name text NOT NULL);
CREATE TABLE "TeamMember"(id text PRIMARY KEY,role "TeamAccessRole" NOT NULL,"userUid" text NOT NULL,"teamID" text REFERENCES "Team"(id),UNIQUE("teamID","userUid"));
CREATE TABLE "TeamCollection"(id text PRIMARY KEY,"parentID" text REFERENCES "TeamCollection"(id),"teamID" text REFERENCES "Team"(id),title text,"orderIndex" int,data jsonb,"updatedOn" timestamptz);
CREATE TABLE "TeamRequest"(id text PRIMARY KEY,"collectionID" text REFERENCES "TeamCollection"(id),"teamID" text REFERENCES "Team"(id),title text,request jsonb,"orderIndex" int,"updatedOn" timestamptz);
CREATE TABLE "TeamEnvironment"(id text PRIMARY KEY,"teamID" text REFERENCES "Team"(id),name text,variables jsonb);
CREATE TABLE "UserEnvironment"(id text PRIMARY KEY,"userUid" text REFERENCES "User"(uid),name text,variables jsonb,"isGlobal" boolean NOT NULL);
CREATE TABLE "UserSettings"(id text PRIMARY KEY,"userUid" text UNIQUE REFERENCES "User"(uid),properties jsonb,"updatedOn" timestamptz);
INSERT INTO "User" VALUES ('admin','m.demetiev@sprt-service.ru','Admin'),('alice','alice@sprt-service.ru','Alice'),('bob','bob@sprt-service.ru','Bob');
`;
async function setup(t) {
  const pg = new PGlite();
  await pg.exec(fixture);
  await pg.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  // Advisory locks are unnecessary in a single-session in-process test database.
  const query = (sql, values) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({ rows: [] }) : pg.query(sql, values);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const service = new Workspaces(pool, { admins: ['m.demetiev@sprt-service.ru'],
    collection: { name: 'iiko Cloud API (СПРТ)', folders: [{ name: 'Начало', requests: [{ name: 'Организации', method: 'POST' }] }] },
    environment: { name: 'iiko Cloud API', variables: [{ key: 'apiLogin', currentValue: '', secret: true }] } });
  t.after(() => pg.close());
  return { pg, service };
}

test('provisions all existing users; memberships are private; library viewers; repeat is idempotent', async (t) => {
  const { pg, service } = await setup(t);
  assert.equal(await service.reconcile(), 3);
  const before = await pg.query('SELECT count(*)::int AS n FROM "Team"');
  await service.reconcile();
  assert.deepEqual(await pg.query('SELECT count(*)::int AS n FROM "Team"'), before);
  assert.equal(before.rows[0].n, 7);
  const alice = await service.me('alice'), bob = await service.me('bob');
  assert.notEqual(alice.work_team, bob.work_team);
  assert.equal(alice.admin, false);
  const members = await pg.query('SELECT "userUid",role FROM "TeamMember" WHERE "teamID"=$1 ORDER BY "userUid"', [alice.training_team]);
  assert.deepEqual(members.rows, [{ userUid: 'admin', role: 'OWNER' }, { userUid: 'alice', role: 'EDITOR' }]);
  const library = await pg.query('SELECT role FROM "TeamMember" WHERE "teamID"=$1 AND "userUid"=$2', [LIBRARY, 'alice']);
  assert.equal(library.rows[0].role, 'VIEWER');
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM "TeamEnvironment" WHERE "teamID"=$1', [LIBRARY])).rows[0].n, 0);
});

test('adopts legacy workspaces and preserves requests, API keys and unrelated teams', async (t) => {
  const { pg, service } = await setup(t);
  await pg.exec(`INSERT INTO "Team" VALUES ('old','SPRT-Service · alice'),('learn-old','Обучение · alice'),('other','Общие командные');
    INSERT INTO "TeamMember" VALUES ('m1','EDITOR','alice','old'),('m2','OWNER','admin','learn-old'),('m3','OWNER','admin','other');
    INSERT INTO "TeamEnvironment" VALUES ('env','old','iiko Cloud API','[{"key":"apiLogin","currentValue":"private-key"}]');
    INSERT INTO "TeamCollection"(id,"teamID",title,"orderIndex") VALUES ('custom','old','My custom request folder',1);`);
  await service.reconcile(); await service.reconcile();
  assert.equal((await service.me('alice')).work_team, 'old');
  assert.equal((await service.me('alice')).training_team, 'learn-old');
  assert.equal((await pg.query('SELECT title FROM "TeamCollection" WHERE id=$1', ['custom'])).rows[0].title, 'My custom request folder');
  const env = await pg.query('SELECT variables FROM "UserEnvironment" WHERE "userUid"=$1', ['alice']);
  assert.equal(env.rows[0].variables[0].currentValue, 'private-key');
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM "TeamMember" WHERE "teamID"=$1', ['other'])).rows[0].n, 1);
});

test('new signup receives spaces on the next reconcile; prefix collisions do not expose training', async (t) => {
  const { pg, service } = await setup(t);
  await service.reconcile();
  await pg.query('INSERT INTO "User" VALUES ($1,$2,$3)', ['new', 'alice@another.example', 'New Alice']);
  await service.reconcile();
  assert.notEqual((await service.me('new')).training_team, (await service.me('alice')).training_team);
  assert.equal((await service.me('new')).progress.l1, false);
});

test('legacy progress is imported once, with unknown dates; unrelated settings preserved', async (t) => {
  const { pg, service } = await setup(t);
  await pg.query('INSERT INTO "UserSettings" VALUES ($1,$2,$3,now())', ['settings', 'alice', JSON.stringify({ BG_COLOR: 'light', SPRT_LEARN: { l1: true, r1: true } })]);
  await service.reconcile();
  const alice = await service.me('alice'); assert.equal(alice.progress.l1, true); assert.equal(alice.attempt, 2);
  const legacy = (await service.report('admin')).employees.find((u) => u.uid === 'alice');
  assert.equal(legacy.legacy, true); assert.equal(legacy.completed_at, null);
  await service.record('alice', { id: randomUUID(), kind: 'lesson', lesson: 'l2', passed: true, attempt: 2 });
  const settings = (await pg.query('SELECT properties FROM "UserSettings" WHERE "userUid"=$1', ['alice'])).rows[0].properties;
  assert.equal(settings.BG_COLOR, 'light'); assert.equal(settings.SPRT_LEARN.l2, true);
  await service.reconcile(); assert.equal((await service.me('alice')).progress.l2, true);
});

test('progress is sequential; events are idempotent; reset keeps history and completion dates are real', async (t) => {
  const { service } = await setup(t); await service.reconcile();
  await assert.rejects(service.record('alice', { id: randomUUID(), kind: 'lesson', lesson: 'l6', passed: true, attempt: 1 }), (e) => e.status === 409);
  for (const lesson of LESSONS) {
    const event = { id: randomUUID(), kind: 'lesson', lesson, passed: true, attempt: 1 };
    await service.record('alice', event); await service.record('alice', event);
  }
  let detail = await service.report('admin', 'alice');
  assert.equal(detail.events.length, 6); assert.ok(detail.employee.completed_at);
  const reset = { id: randomUUID(), kind: 'reset', attempt: 1 };
  await service.record('alice', reset); await service.record('alice', reset);
  detail = await service.report('admin', 'alice');
  assert.equal(detail.events.length, 7); assert.equal(detail.employee.attempt, 2); assert.equal(detail.employee.completed_at, null);
  assert.equal(detail.employee.progress.l1, false);
  await assert.rejects(service.record('alice', { id: randomUUID(), kind: 'lesson', lesson: 'l1', passed: true, attempt: 1 }), (e) => e.status === 409);
});

test('ordinary employees cannot inspect reports or promote themselves', async (t) => {
  const { service } = await setup(t); await service.reconcile();
  await assert.rejects(service.report('alice'), (e) => e.status === 403);
  await assert.rejects(service.report('alice', 'bob'), (e) => e.status === 403);
  await assert.rejects(service.report('unknown'), (e) => e.status === 401);
  await service.record('alice', { id: randomUUID(), kind: 'attempt', lesson: 'l1', passed: false, attempt: 1, uid: 'bob', admin: true });
  assert.equal((await service.report('admin', 'alice')).events.length, 1);
  assert.equal((await service.report('admin', 'bob')).events.length, 0);
});

test('missing configured admin aborts without creating any spaces', async (t) => {
  const { pg, service } = await setup(t);
  service.admins = ['absent@example.com'];
  await assert.rejects(service.reconcile(), /No registered/);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM "Team"')).rows[0].n, 0);
});

test('a new request does not invent a completion date for an already completed legacy course', async (t) => {
  const { pg, service } = await setup(t);
  await pg.query('INSERT INTO "UserSettings" VALUES ($1,$2,$3,now())', ['settings', 'alice', JSON.stringify({ SPRT_LEARN: Object.fromEntries(LESSONS.map((id) => [id, true])) })]);
  await service.reconcile();
  await service.record('alice', { id: randomUUID(), kind: 'attempt', lesson: 'l1', passed: true, attempt: 1 });
  const detail = await service.report('admin', 'alice');
  assert.equal(detail.employee.completed_at, null); assert.equal(detail.employee.legacy, true);
});

test('migration merges browser progress before server zeros, keeps unknown completion date and does not duplicate recovery', async (t) => {
  const { service } = await setup(t); await service.reconcile();
  const snapshot = { progress: Object.fromEntries(LESSONS.map((key) => [key, true])), attempt: 2 };
  const restored = await service.recover('alice', snapshot);
  assert.equal(restored.restored, true); assert.equal(restored.progress.l6, true); assert.equal(restored.attempt, 2);
  await service.recover('alice', snapshot);
  const detail = await service.report('admin', 'alice');
  assert.equal(detail.events.length, 1); assert.equal(detail.events[0].kind, 'recovery');
  assert.equal(detail.employee.completed_at, null);
});

test('empty browser does not prevent recovering a populated cache; explicit reset blocks stale browser and backup', async (t) => {
  const { service } = await setup(t); await service.reconcile();
  await service.recover('alice', { progress: {}, attempt: 1 });
  assert.equal((await service.recover('alice', { progress: { l1: true }, attempt: 1 })).restored, true);
  await service.record('alice', { id: randomUUID(), kind: 'reset', attempt: 1 });
  const stale = { progress: { l1: true, l2: true }, attempt: 1 };
  assert.equal((await service.recover('alice', stale)).progress.l1, false);
  assert.equal((await service.recover('alice', stale, 'backup')).progress.l1, false);
});

test('diagnostics reveal only training metadata and reject another employee', async (t) => {
  const { pg, service } = await setup(t);
  await pg.query('INSERT INTO "UserSettings" VALUES ($1,$2,$3,now())', ['settings', 'alice', JSON.stringify({ API_KEY: 'do-not-export', SPRT_LEARN: { l1: true } })]);
  await service.reconcile();
  await assert.rejects(service.debug('alice', 'bob'), (e) => e.status === 403);
  const debug = await service.debug('alice');
  assert.equal(debug.settingsProgress.l1, true); assert.equal(JSON.stringify(debug).includes('do-not-export'), false);
  assert.equal((await service.debug('admin', 'alice')).account.uid, 'alice');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TrainingStore } from '../training-store.mjs';

test('file restart and online backup preserve committed WAL events, identity and reset history', async (t) => {
  const dir = await mkdtemp(join(tmpdir(),'sprt-sqlite-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const path = join(dir,'training.sqlite'), snapshot = join(dir,'backup.sqlite');
  let store = new TrainingStore(path);
  store.importLegacy([],[],[{uid:'alice'},{uid:'bob'}]);
  const instance = store.instance();
  const lesson = {id:randomUUID(),kind:'lesson',lesson:'l1',passed:true,attempt:1};
  store.record('alice',lesson);
  const second = new TrainingStore(path);
  second.record('alice',lesson); // A second connection sees the deduplication record.
  assert.equal(second.events('alice').length,1);
  second.close();
  await store.backup(snapshot);
  store.record('alice',{id:randomUUID(),kind:'reset',attempt:1});
  store.close();
  store = new TrainingStore(path);
  assert.equal(store.instance(),instance);
  assert.equal(store.get('alice').attempt,2);
  assert.equal(store.events('alice').length,2);
  assert.equal(store.recover('alice',{progress:{l1:true},attempt:1}).restored,false);
  assert.throws(() => store.record('bob',lesson),(e) => e.status===409);
  assert.equal(store.get('bob').progress.l1,false);
  store.close();
  const restored = new TrainingStore(snapshot);
  assert.equal(restored.instance(),instance);
  assert.equal(restored.get('alice').progress.l1,true);
  assert.equal(restored.get('alice').attempt,1);
  restored.close();
  assert.equal((await stat(path)).mode & 0o777,0o600);
});

test('migration is atomic on failure and does not overwrite an existing SQLite database', () => {
  const store = new TrainingStore(':memory:');
  try {
    assert.throws(() => store.importLegacy([],[],[{uid:'alice'},{uid:'alice'}]));
    assert.equal(store.instance(),null);
    assert.equal(store.get('alice'),null);
    store.importLegacy([],[],[{uid:'alice',properties:{SPRT_LEARN:{l1:true}}}]);
    const identity = store.instance();
    store.importLegacy([],[],[{uid:'alice'}]);
    assert.equal(store.instance(),identity);
    assert.equal(store.get('alice').progress.l1,true);
    assert.throws(() => store.transaction(() => { store.ensure('bob'); throw new Error('interrupted'); }),/interrupted/);
    assert.equal(store.get('bob'),null);
  } finally { store.close(); }
});

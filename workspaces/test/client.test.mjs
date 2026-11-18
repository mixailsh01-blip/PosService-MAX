import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('client serializes reset and later events; transient retries reuse their event ID', async () => {
  const source = await readFile(new URL('../public/training-client.js', import.meta.url), 'utf8');
  const calls = []; let transient = true; let attempt = 1;
  const status = { textContent: '', setAttribute() {} };
  const window = { addEventListener() {} };
  vm.runInNewContext(source, { window, crypto: { randomUUID }, document: { getElementById: () => status },
    setTimeout: (fn) => fn(), fetch: async (url, opts) => {
      if (url.endsWith('/me')) return { ok: true, json: async () => ({ attempt, progress: {} }) };
      const event = JSON.parse(opts.body); calls.push(event);
      if (transient) { transient = false; throw new Error('Network'); }
      assert.equal(event.attempt, attempt);
      if (event.kind === 'reset') attempt++;
      return { ok: true, json: async () => ({ attempt, progress: {} }) };
    } });
  await window.SPRTTraining.init();
  const first = window.SPRTTraining.record('attempt', 'l1', false);
  const second = window.SPRTTraining.record('reset');
  const third = window.SPRTTraining.record('lesson', 'l1', true);
  await Promise.all([first, second, third]);
  assert.equal(calls.length, 4); assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[3].attempt, 2);
  assert.equal(status.textContent, 'Прогресс сохранён на сервере');
  assert.ok(calls.every((event) => !('body' in event) && !('headers' in event)));
});

test('initial migration sends the original browser flags and backs them up before adopting server progress', async () => {
  const source = await readFile(new URL('../public/training-client.js', import.meta.url), 'utf8');
  const window = { addEventListener() {} }, stored = new Map();
  const snapshot = { progress: { l1: true, l2: true }, attempt: 1 };
  const calls = [];
  vm.runInNewContext(source, { window, crypto: { randomUUID },
    localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    document: { getElementById: () => null }, setTimeout: (fn) => fn(),
    fetch: async (path, opts) => {
      calls.push(path);
      if (path.endsWith('/me')) return { ok: true, json: async () => ({ uid: 'alice', attempt: 1, progress: { l1: false, l2: false } }) };
      assert.deepEqual(JSON.parse(opts.body), snapshot);
      assert.deepEqual(JSON.parse(stored.get('sprt_learn_backup:alice')), snapshot);
      return { ok: true, json: async () => ({ ...snapshot, restored: true }) };
    } });
  const result = await window.SPRTTraining.init(snapshot);
  assert.equal(result.progress.l2, true); assert.equal(calls.length, 2);
});

test('trainer waits for server acknowledgement and never uses the PostgreSQL bridge setter', async () => {
  const source = await readFile(new URL('../../learn-app/app.js', import.meta.url), 'utf8');
  for (const accepted of [true,false]) {
    let click, release, bridgeWrites = 0, cache = new Map();
    const app = { innerHTML:'', addEventListener: (_, fn) => { click = fn; } };
    const fields = { 'f-method':{value:'POST'},'f-url':{value:'https://example.test'},'f-headers':{value:''},'f-body':{value:'{}'} };
    const bridge = { getUser: () => ({email:'alice@example.test'}),getProgress:()=>({}),setProgress:()=>{bridgeWrites++;} };
    const window = { buildTasks: () => [{id:'l1',title:'Token',text:''},{id:'l2',title:'Organizations',text:''}],scrollTo() {} };
    window.SPRTTraining = {
      init: async () => ({uid:'alice',progress:{l1:false,l2:false},attempt:1}), renderStatus() {},
      record: async (kind) => {
        if (kind === 'attempt') await new Promise((resolve) => { release=resolve; });
        return accepted ? {uid:'alice',progress:{l1:kind==='lesson',l2:false},attempt:1} : null;
      },
    };
    vm.runInNewContext(source,{window,parent:{__sprtLearn:bridge},document:{getElementById:(id)=>id==='app'?app:fields[id]},
      localStorage:{getItem:()=>null,setItem:(key,value)=>cache.set(key,value)},
      SIM:{init(){},send:()=>({status:200,task:'l1',body:{}})},setTimeout,clearTimeout,fetch:()=>{throw new Error('unexpected fetch');}});
    await new Promise((resolve)=>setImmediate(resolve));
    const saving=click({target:{closest:()=>({dataset:{send:'1'}})}});
    assert.match(app.innerHTML,/Выполнено 0 из 2/);
    release(); await saving;
    assert.match(app.innerHTML,accepted ? /Выполнено 1 из 2/ : /Выполнено 0 из 2/);
    assert.equal(bridgeWrites,0);
    assert.equal(JSON.parse(cache.get('sprt_learn_progress:alice')).l1,accepted);
  }
});

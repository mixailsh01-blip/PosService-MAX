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

test('examples unlock from server completion, fill the selected lesson and disappear after reset', async () => {
  const source = await readFile(new URL('../../learn-app/app.js', import.meta.url), 'utf8');
  for (const mode of ['complete', 'partial', 'stale-cache', 'admin', 'finish']) {
    const tasks = Array.from({length:6}, (_,i) => ({id:'l'+(i+1),title:'Task '+i,text:''}));
    const progress = Object.fromEntries(tasks.map((t,i) => [t.id, mode === 'complete' || mode === 'finish' && i < 5]));
    let click, scripts = [];
    const app = {innerHTML:'',addEventListener:(_,fn)=>{click=fn;}};
    const example = {method:'POST',url:'https://example.test/status',headers:'Content-Type: application/json',body:'{"example":true}'};
    const window = {buildTasks:()=>tasks,buildExamples:()=>Object.fromEntries(tasks.map(t=>[t.id,example])),scrollTo(){}};
    const state = {uid:'alice',admin:mode==='admin',progress,attempt:1};
    window.SPRTTraining = {init:async()=>state,renderStatus(){},record:async(kind)=>{
      if (kind==='lesson') state.progress.l6=true;
      if (kind==='reset') {state.progress={};state.attempt++;}
      return state;
    }};
    const fields = {'f-method':{value:'POST'},'f-url':{value:'https://example.test'},'f-headers':{value:''},'f-body':{value:'{}'}};
    const bridge = {getUser:()=>({email:'alice@example.test'}),getProgress:()=>mode==='stale-cache'?Object.fromEntries(tasks.map(t=>[t.id,true])):{}};
    vm.runInNewContext(source, {window,parent:{__sprtLearn:bridge},document:{
      getElementById:id=>id==='app'?app:fields[id],createElement:()=>({}),head:{appendChild:sc=>scripts.push(sc)},
    },localStorage:{getItem:()=>null,setItem(){}},SIM:{init(){},reset(){},send:()=>({status:200,task:'l6',body:{}})},setTimeout,clearTimeout});
    await new Promise(resolve=>setImmediate(resolve));
    const clickButton=dataset=>click({target:{closest:()=>({dataset})}});
    if (mode==='finish') {assert.equal(scripts.length,0);await clickButton({send:'1'});}
    const allowed=['complete','admin','finish'].includes(mode);
    assert.equal(scripts.length,allowed?1:0,mode);
    if (!allowed) {
      await clickButton({example:'1'});
      assert.doesNotMatch(app.innerHTML,/data-example/);
      continue;
    }
    scripts[0].onload();
    assert.match(app.innerHTML,/data-example/);
    for (let i=0;i<6;i++) {
      await clickButton({i:String(i)});
      await clickButton({example:'1'});
      assert.match(app.innerHTML,/https:\/\/example.test\/status/);
      assert.match(app.innerHTML,/&quot;example&quot;:true/);
    }
    await clickButton({resetall:'1'});await clickButton({resetall:'1'});
    if (mode==='admin') assert.match(app.innerHTML,/data-example/);
    else {
      assert.doesNotMatch(app.innerHTML,/data-example/);
      await clickButton({example:'1'});
      assert.doesNotMatch(app.innerHTML,/https:\/\/example.test\/status/);
    }
  }
});

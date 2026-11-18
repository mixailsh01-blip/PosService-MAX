import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { join } from 'node:path';
const root = process.env.HOPPSCOTCH_SOURCE || '/tmp/sprt-upstream';
async function source(path) { return readFile(join(root,'packages',path),'utf8'); }
function evaluate(ts, globals, exports) {
  const code = stripTypeScriptTypes(ts,{mode:'transform'})
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/^export /gm,'');
  return vm.runInNewContext(`(function(){${code};return {${exports.join(',')}}})()`,globals);
}
const vue={reactive:(v)=>v,markRaw:(v)=>v,computed:(fn)=>({get value(){return fn();}}),watchEffect:()=>{}};

test('proxy-only ignores stale selections, removes alternate modes, routes public targets through proxy and preserves only the fixed iiko gateway',async()=>{
 const {KernelInterceptorService: Service}=evaluate(await source('hoppscotch-common/src/services/kernel-interceptor.service.ts'),{
  ...vue,URL,Service:class{},window:{location:{origin:'https://sprtapi.sprt-service.ru'}},console,
 },['KernelInterceptorService']);
 const service=new Service(); service.enforceProxyOnly();
 const calls=[];
 for(const id of ['browser','agent','extension','native','proxy'])service.register({id,selectable:{type:'selectable'},execute:(req)=>{calls.push({id,req});return id;}});
 assert.deepEqual(Array.from(service.available.value,(v)=>v.id),['proxy']);
 for(const stale of ['browser','agent','extension','native','',null]){
  service.setActive(stale);assert.equal(service.getCurrentId(),'proxy');
  assert.equal(service.execute({url:'https://example.test/api',method:'POST'}),'proxy');
 }
 assert.equal(service.execute({url:'https://api-ru.iiko.services/api/1/organizations',method:'POST'}),'browser');
 assert.equal(calls.at(-1).req.url,'https://sprtapi.sprt-service.ru/iiko-api/api/1/organizations');
 for(const path of ['/api/reporting/v1/olap/columns/get','/api/v2/access_token','/api/1/organizations?includeDisabled=true']) {
  assert.equal(service.execute({url:'https://api-ru.iiko.services'+path,method:'POST'}),'browser');
  assert.equal(calls.at(-1).req.url,'https://sprtapi.sprt-service.ru/iiko-api'+path);
  assert.equal(service.execute({url:'https://sprtapi.sprt-service.ru/iiko-api'+path,method:'POST'}),'browser');
 }
 assert.equal(service.execute({url:'https://sprtapi.sprt-service.ru/backend/graphql',method:'POST'}),'proxy');
 assert.equal(service.execute({url:'https://api-ru.iiko.services.evil.test/api/1/organizations',method:'POST'}),'proxy');
 const missing=new Service();missing.enforceProxyOnly();
 assert.throws(()=>missing.execute({url:'https://example.test',method:'GET'}),/Proxy interceptor is unavailable/);
 const main=await source('hoppscotch-selfhost-web/src/main.ts');
 assert.match(main,/defaultInterceptor: "proxy"/);
 assert.doesNotMatch(main,/AgentKernelInterceptorService|ExtensionKernelInterceptorService/);
});

test('SQLite gate supersedes both stale completed and stale empty caches, and never writes PostgreSQL settings',async()=>{
 const ts=await source('hoppscotch-common/src/helpers/sprt-learn.ts');
 assert.doesNotMatch(ts,/applySetting/);
 for(const passed of [true,false]){
  const stored=new Map([['sprt_learn_progress:alice',JSON.stringify({l1:!passed,l2:!passed,l3:!passed,l4:!passed,l5:!passed,l6:!passed})]]);
  const progress=Object.fromEntries(['l1','l2','l3','l4','l5','l6'].map(k=>[k,passed]));
  const platform={auth:{getCurrentUser:()=>({uid:'alice'}),getCurrentUserStream:()=>null}};
  const api=evaluate(ts,{...vue,ref:(value)=>({value}),platform,useReadonlyStream:()=>({value:{uid:'alice'}}),
   localStorage:{getItem:(k)=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},AbortSignal,
   fetch:async(path)=>({ok:true,json:async()=>path==='/sprt/me'?{uid:'alice',progress,attempt:1}:{progress,attempt:1}}),
  },['loadLearnProgress','useLearnPassed','acceptLearnServerProgress']);
  assert.equal(api.useLearnPassed().value,false);
  await api.loadLearnProgress('alice');
  assert.equal(api.useLearnPassed().value,passed);
  assert.equal(JSON.parse(stored.get('sprt_learn_progress:alice')).l6,passed);
  assert.ok(stored.has('sprt_learn_backup:alice'));
 }
});

test('failed SQLite gate fetch preserves the recovery cache and does not grant access',async()=>{
 const stored=new Map([['sprt_learn_progress:alice','{"l1":true,"l2":true,"l3":true,"l4":true,"l5":true,"l6":true}']]);
 const original=stored.get('sprt_learn_progress:alice');
 const platform={auth:{getCurrentUser:()=>({uid:'alice'}),getCurrentUserStream:()=>null}};
 const api=evaluate(await source('hoppscotch-common/src/helpers/sprt-learn.ts'),{...vue,ref:(value)=>({value}),platform,
  useReadonlyStream:()=>({value:{uid:'alice'}}),localStorage:{getItem:(k)=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  AbortSignal,fetch:async()=>{throw new Error('offline');},
 },['loadLearnProgress','useLearnPassed']);
 await api.loadLearnProgress('alice');
 assert.equal(api.useLearnPassed().value,false);
 assert.equal(stored.get('sprt_learn_progress:alice'),original);
});

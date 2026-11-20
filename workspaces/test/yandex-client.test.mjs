import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=(await readFile(new URL('../../yandex-app/src/core/n8nClient.js',import.meta.url),'utf8'))
 .replace(/^import .*from .*;$/gm,'').replace(/^export /gm,'');
function setup(replies,initial={}) {
 const calls=[];let saved=initial;
 const api=vm.runInNewContext(`(()=>{${source};return {n8nAuth,n8nDevRequest,normalizeBaseUrl,cleanLoginValue};})()`,{
  URL,window:{},location:{protocol:'https:',origin:'https://sprtapi.sprt-service.ru'},
  loadAuth:()=>saved,saveAuth:(value)=>{saved=value;},
  fetch:async(url,options)=>{
   calls.push({url,body:JSON.parse(options.body)});
   const response=replies.shift();
   if(response instanceof Error)throw response;
   return {status:response.status,ok:response.status>=200&&response.status<300,text:async()=>response.text};
  },
 });
 return {api,calls,saved:()=>saved};
}
const credentials={baseUrl:'https://api-ru.iiko.services/integrations/ya/',clientId:'test-id',clientSecret:'test-secret'};
test('Yandex login explains empty 405 and HTML/non-JSON responses without exposing credentials',async()=>{
 for(const reply of [{status:405,text:''},{status:200,text:'<!doctype html><html>SPA</html>'},{status:502,text:'Bad gateway'}]){
  const {api,saved}=setup([reply]);
  await assert.rejects(api.n8nAuth(credentials),(e)=>e.message.includes('HTTP '+reply.status)&&e.message.includes('/yandex/devOps')&&!e.message.includes(credentials.clientSecret));
  assert.deepEqual(saved(),{});
 }
});
test('Yandex login normalizes Host and saves credentials only after a real access_token',async()=>{
 const {api,calls,saved}=setup([{status:200,text:'{"access_token":"token"}'}]);
 assert.equal(await api.n8nAuth(credentials),'token');
 assert.equal(calls[0].url,'https://sprtapi.sprt-service.ru/yandex/devOps');
 assert.equal(calls[0].body.baseUrl,'https://api-ru.iiko.services/integrations/ya');
 assert.equal(calls[0].body.client_secret,'test-secret');
 assert.equal(saved().accessToken,'token');
 const missing=setup([{status:200,text:'{}'}]);
 await assert.rejects(missing.api.n8nAuth(credentials),/access_token/);
 assert.deepEqual(missing.saved(),{});
});
test('Yandex login validates URL/credentials before sending and preserves structured API errors',async()=>{
 const {api,calls}=setup([]);
 for(const baseUrl of ['', 'not a URL','http://tenant.iikoweb.ru/api','https://user:pass@tenant.iikoweb.ru/api','https://tenant.iikoweb.ru/api?foo=bar'])
  await assert.rejects(api.n8nAuth({...credentials,baseUrl}));
 await assert.rejects(api.n8nAuth({...credentials,clientSecret:''}));
 assert.equal(calls.length,0);
 const denied=setup([{status:200,text:'{"ok":false,"error":{"type":"AUTH_FAILED","message":"Неверный Client ID"}}'}]);
 await assert.rejects(denied.api.n8nAuth(credentials),(e)=>e.error.type==='AUTH_FAILED'&&e.error.message==='Неверный Client ID');
});
test('Yandex refresh failure keeps existing credentials available for retry',async()=>{
 const old={...credentials,accessToken:'old'};
 const {api,saved}=setup([{status:200,text:'{"ok":false,"error":{"type":"AUTH_EXPIRED"}}'},{status:503,text:'unavailable'}],old);
 await assert.rejects(api.n8nDevRequest({method:'GET',url:'https://example.test/restaurants'}),/HTTP 503/);
 assert.equal(saved(),old);
});

test('Yandex auth removes pasted whitespace and invisible formatting before sending or saving credentials',async()=>{
 const {api,calls,saved}=setup([{status:200,text:'{"access_token":"token"}'}]);
 await api.n8nAuth({baseUrl:' \thttps://api-ru.iiko.\nservices/integrations/ya\u00a0',clientId:' test-\r\nid\u200b ',clientSecret:'\ufeff test-\tsecret\u2060\n'});
 assert.equal(calls[0].body.baseUrl,'https://api-ru.iiko.services/integrations/ya');
 assert.equal(calls[0].body.client_id,'test-id');
 assert.equal(calls[0].body.client_secret,'test-secret');
 assert.equal(saved().clientId,'test-id');
 assert.equal(saved().clientSecret,'test-secret');
});

test('Yandex form cleans cached values, typing and paste immediately and sends the cleaned values',async()=>{
 const bootstrap=await readFile(new URL('../../yandex-app/src/app/bootstrap.js',import.meta.url),'utf8');
 const authScreen=bootstrap.slice(bootstrap.indexOf('function authScreen()'),bootstrap.indexOf('async function restaurantsScreen()'));
 const fields=Object.fromEntries(['baseUrl','clientId','clientSecret','go','err'].map(id=>[id,{
  value:id==='baseUrl'?'https://api-ru.iiko.services/integrations/ya':'',selectionStart:0,selectionEnd:0,events:{},
  addEventListener(name,fn){this.events[name]=fn;},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},
 }]));
 const {api}=setup([]);let sent;
 vm.runInNewContext(`${authScreen};authScreen();`,{document:{getElementById:id=>fields[id]},render(){},wireBackButton(){},
  loadAuth:()=>({clientId:' cached \n id ',clientSecret:' old\tsecret '}),cleanLoginValue:api.cleanLoginValue,
  window:{appState:{},n8nAuth:async(value)=>{sent=value;}},setScreen(){},
 });
 assert.equal(fields.clientSecret.value,'oldsecret');
 const secret=fields.clientSecret;secret.value='ABCD';secret.setSelectionRange(1,3);
 let prevented=false;
 secret.events.paste({preventDefault(){prevented=true;},clipboardData:{getData:()=> ' \r\n xy\t z\u200b '}});
 assert.equal(prevented,true);assert.equal(secret.value,'AxyzD');assert.equal(secret.selectionStart,4);
 fields.clientId.value=' new \n id ';fields.clientId.events.input();
 assert.equal(fields.clientId.value,'newid');
 await fields.go.onclick();
 assert.equal(sent.clientId,'newid');assert.equal(sent.clientSecret,'AxyzD');
});

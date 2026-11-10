// Клиент к прокси. Раньше адрес вёл на n8n-вебхук, теперь — на свой сервис (yandex-proxy).
// Контракт тот же, меняется только PROXY_URL и добавлена проверка, что токен реально получен.
const PROXY_URL = 'https://91-210-170-56.sslip.io/yandex/devOps';
import {saveAuth,loadAuth,clearAuth} from './storage.js';

export async function n8nAuth({baseUrl,clientId,clientSecret}){
 const r=await fetch(PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({type:'auth',baseUrl,client_id:clientId,client_secret:clientSecret})});
 const j=await r.json();
 if(!j.access_token) throw j; // {ok:false,error:{type,status,message}} — покажется на экране входа
 saveAuth({baseUrl,clientId,clientSecret,accessToken:j.access_token});
 return j.access_token;
}

async function devFetch(payload){
 const r=await fetch(PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 return r.json();
}

export async function n8nDevRequest({method,url,headers={},body}){
 let auth=loadAuth();
 if(!auth.accessToken){await n8nAuth(auth);auth=loadAuth();}

 let res=await devFetch({type:'dev',method,url,headers:{...headers,Authorization:`Bearer ${auth.accessToken}`},body});

 if(res?.ok===false && res?.error?.type==='AUTH_EXPIRED'){
   clearAuth();
   await n8nAuth(auth);
   const fresh=loadAuth();
   res=await devFetch({type:'dev',method,url,headers:{...headers,Authorization:`Bearer ${fresh.accessToken}`},body});
 }

 if(res?.ok===false) throw res;
 return res;
}

// expose for non-module callers (idempotent)
try {
  window.n8nAuth ||= n8nAuth;
  window.n8nDevRequest ||= n8nDevRequest;
} catch (_) {}

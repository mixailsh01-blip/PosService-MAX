// Same-origin gateway; override only for a separately configured deployment.
const PROXY_URL = window.SPRT_YANDEX_PROXY || (location.protocol === 'https:'
  ? `${location.origin}/yandex/devOps`
  : `http://${location.hostname}:8080/yandex/devOps`);
import {saveAuth,loadAuth} from './storage.js';

export function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw new Error('В Base URL укажите полный адрес Host из настроек интеграции Яндекс Еды в iikoWeb.'); }
  if (!['https:', 'http:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'https:'))
    throw new Error('Base URL должен начинаться с https://.');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Base URL должен содержать только адрес Host, без логина, пароля и параметров URL.');
  return url.href.replace(/\/+$/, '');
}

async function proxyRequest(payload) {
  let response;
  try {
    response = await fetch(PROXY_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  } catch {
    throw new Error('Не удалось связаться с прокси Яндекс Еды. Проверьте подключение и доступность сервера SPRT API.');
  }
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch {
    throw new Error(`Прокси Яндекс Еды вернул HTTP ${response.status} ${text.trim() ? 'вместо JSON' : 'с пустым ответом'}. Требуется проверить подключение /yandex/devOps на сервере SPRT API.`);
  }
  if (!result || typeof result !== 'object') throw new Error('Прокси Яндекс Еды вернул ответ неизвестного формата.');
  if (!response.ok && !result.error) throw new Error(`Прокси Яндекс Еды: HTTP ${response.status}.`);
  return result;
}

export async function n8nAuth({baseUrl,clientId,clientSecret}) {
  baseUrl = normalizeBaseUrl(baseUrl);
  if (!String(clientId || '').trim() || !String(clientSecret || '').trim()) throw new Error('Заполните Client ID и Client Secret интеграции.');
  const result = await proxyRequest({type:'auth',baseUrl,client_id:clientId,client_secret:clientSecret});
  if (typeof result.access_token !== 'string' || !result.access_token.trim()) {
    if (result.error) throw result;
    throw new Error('Прокси не вернул access_token. Проверьте Host и данные подключения в настройках интеграции iikoWeb.');
  }
  saveAuth({baseUrl,clientId,clientSecret,accessToken:result.access_token});
  return result.access_token;
}

export async function n8nDevRequest({method,url,headers={},body}) {
  let auth=loadAuth();
  if (!auth.accessToken) { await n8nAuth(auth); auth=loadAuth(); }
  let result=await proxyRequest({type:'dev',method,url,headers:{...headers,Authorization:`Bearer ${auth.accessToken}`},body});
  if (result?.ok===false && result?.error?.type==='AUTH_EXPIRED') {
    await n8nAuth(auth);
    const fresh=loadAuth();
    result=await proxyRequest({type:'dev',method,url,headers:{...headers,Authorization:`Bearer ${fresh.accessToken}`},body});
  }
  if (result?.ok===false) throw result;
  return result;
}

try {
  window.n8nAuth ||= n8nAuth;
  window.n8nDevRequest ||= n8nDevRequest;
} catch (_) {}

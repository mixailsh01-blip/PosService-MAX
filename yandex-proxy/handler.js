// Прокси для API iiko-интеграции Яндекс Еды: замена n8n-воркфлоу «Яндекс» (вебхук yandex/devOps).
// Чистая функция handle(body) -> { status, json }. Не зависит от HTTP-сервера, поэтому
// её можно вызвать и из server.js, и из облачной функции (Yandex Cloud Functions и т.п.).
//
// Контракт тот же, что у n8n-вебхука:
//   { type: "auth", baseUrl, client_id, client_secret }          -> { access_token }
//   { type: "dev", method, url, headers, body }                  -> ответ API как есть
// Ошибки приходят в виде { ok: false, error: { type, status, message } }.
// Истёкший токен: error.type === "AUTH_EXPIRED" (теперь для любого метода, не только GET).

import dns from "node:dns/promises"
import net from "node:net"

// Настройки читаются при каждом вызове, чтобы их можно было менять без перезапуска тестов.
const cfg = () => ({
  allowedHosts: (process.env.ALLOWED_HOSTS || "*.iikoweb.ru").split(",").map((s) => s.trim()).filter(Boolean),
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 30000),
  // только для тестов: разрешить http и локальные адреса
  insecure: process.env.ALLOW_INSECURE_TARGETS === "1",
})

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])

const fail = (type, message, status = 0, http = 200) => ({
  status: http,
  json: { ok: false, error: { type, status, message: String(message).slice(0, 1000) } },
})

const hostAllowed = (host, patterns) =>
  patterns.some((p) => p === "*" || (p.startsWith("*.") ? host.endsWith(p.slice(1)) : host === p))

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase()
    if (x === "::1" || x === "::") return true
    if (x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) return true
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return isPrivateIp(m[1])
  }
  return false
}

// Проверка адреса, на который мы собираемся пойти: только https, только разрешённые хосты,
// только публичные IP. Без этого прокси можно было бы использовать для обращения к внутренней сети.
async function checkTarget(urlStr) {
  const c = cfg()
  let u
  try { u = new URL(urlStr) } catch { throw new Error("Некорректный URL: " + urlStr) }
  if (!c.insecure && u.protocol !== "https:") throw new Error("Разрешён только https")
  if (c.insecure && u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Разрешён только http/https")
  if (!hostAllowed(u.hostname, c.allowedHosts)) throw new Error("Хост не разрешён: " + u.hostname)
  if (!c.insecure) {
    const host = u.hostname.replace(/^\[|\]$/g, "")
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true })
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Адрес недоступен: " + u.hostname)
  }
  return u
}

const hasHeader = (h, name) => Object.keys(h).some((k) => k.toLowerCase() === name)

async function callUpstream({ method, url, headers, body }) {
  const c = cfg()
  const h = {}
  for (const [k, v] of Object.entries(headers || {})) h[k] = String(v)
  const init = { method, headers: h, redirect: "manual", signal: AbortSignal.timeout(c.timeoutMs) }
  if (method !== "GET" && body !== undefined && body !== null) {
    init.body = typeof body === "string" ? body : JSON.stringify(body)
    if (!hasHeader(h, "content-type")) h["Content-Type"] = "application/json"
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let data
  if (!text) data = {}
  else { try { data = JSON.parse(text) } catch { data = { data: text } } }
  return { ok: res.ok, status: res.status, data, text }
}

async function auth(body) {
  const { baseUrl, client_id, client_secret } = body
  if (!baseUrl || !client_id || !client_secret) return fail("BAD_REQUEST", "Нужны baseUrl, client_id и client_secret", 0, 400)
  const url = String(baseUrl).replace(/\/+$/, "") + "/security/oauth/token"
  try {
    await checkTarget(url)
    const form = new URLSearchParams({ client_id, client_secret, grant_type: "client_credentials", scope: "read" })
    const r = await callUpstream({
      method: "POST", url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    if (!r.ok || !r.data || !r.data.access_token) {
      return fail("AUTH_FAILED", `Не удалось получить токен: ${r.status} ${r.text}`, r.status)
    }
    return { status: 200, json: { access_token: r.data.access_token } }
  } catch (e) {
    return fail("AUTH_FAILED", e.message)
  }
}

async function dev(body) {
  const method = String(body.method || "GET").toUpperCase()
  if (!METHODS.has(method)) return fail("BAD_REQUEST", "Неподдерживаемый метод: " + method, 0, 400)
  if (!body.url) return fail("BAD_REQUEST", "Нужен url", 0, 400)
  try {
    await checkTarget(body.url)
    const r = await callUpstream({ method, url: body.url, headers: body.headers, body: body.body })
    if (r.ok) return { status: 200, json: r.data }
    if (r.status === 401 || /expired/i.test(r.text)) {
      return fail("AUTH_EXPIRED", "Access token has expired", 401)
    }
    return fail("UPSTREAM_ERROR", `${r.status} - ${r.text}`, r.status)
  } catch (e) {
    return fail("PROXY_ERROR", e.name === "TimeoutError" ? "Таймаут ответа от API" : e.message)
  }
}

export async function handle(body) {
  if (!body || typeof body !== "object") return fail("BAD_REQUEST", "Тело запроса должно быть JSON-объектом", 0, 400)
  if (body.type === "auth") return auth(body)
  if (body.type === "dev") return dev(body)
  return fail("BAD_REQUEST", "Неизвестный type: " + body.type, 0, 400)
}

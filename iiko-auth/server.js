// СПРТ • выдача токена iiko Cloud API: сотрудник присылает только apiKey,
// appId и clientSecret приложения хранятся здесь (переменные окружения) и в браузер не попадают.
// POST /token {"apiKey": "..."}  ->  ответ iiko как есть.   GET /health.
import http from "node:http"

const PORT = Number(process.env.PORT || 8081)
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean)
const IIKO_BASE = (process.env.IIKO_BASE || "https://api-ru.iiko.services").replace(/\/+$/, "")
const APP_ID = process.env.IIKO_APP_ID || ""
const CLIENT_SECRET = process.env.IIKO_CLIENT_SECRET || ""
const MAX_BODY = 2 * 1024 * 1024

function corsHeaders(origin) {
  const h = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
  if (ORIGINS.includes("*")) h["Access-Control-Allow-Origin"] = "*"
  else if (origin && ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin
  return h
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (c) => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error("too large")); req.destroy() } else chunks.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

export const server = http.createServer(async (req, res) => {
  const cors = corsHeaders(req.headers.origin)
  const send = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...cors })
    res.end(JSON.stringify(obj))
  }
  const rawPath = (req.url || "/").split("?")[0]
  // На сервере Traefik публикует сервис под тем же доменом с префиксом
  // /iiko-auth; локально сервис доступен напрямую на :8081.
  const path = rawPath.replace(/^\/iiko-auth(?=\/|$)/, "") || "/"

  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end() }
  if (req.method === "GET" && path === "/health") return send(200, { ok: true })

  // Проксируем остальные методы iiko через тот же домен. Hoppscotch в режиме
  // Browser иначе блокируется CORS ещё до получения ответа от iiko.
  if (rawPath.startsWith("/iiko-api/")) {
    if (req.method !== "POST" && req.method !== "GET")
      return send(405, { error: "METHOD_NOT_ALLOWED", errorDescription: "Method not allowed" })
    const upstreamPath = rawPath.slice("/iiko-api".length)
    if (!/^\/api\/\d+\//.test(upstreamPath))
      return send(404, { error: "NOT_FOUND", errorDescription: "Not found" })
    let body
    try { body = req.method === "GET" ? undefined : await readBody(req) }
    catch { return send(413, { error: "TOO_LARGE", errorDescription: "Слишком большое тело запроса" }) }
    const headers = { "Content-Type": req.headers["content-type"] || "application/json" }
    if (typeof req.headers.authorization === "string") headers.Authorization = req.headers.authorization
    try {
      const r = await fetch(IIKO_BASE + upstreamPath, {
        method: req.method,
        headers,
        body,
        signal: AbortSignal.timeout(60000),
      })
      const response = Buffer.from(await r.arrayBuffer())
      res.writeHead(r.status, {
        "Content-Type": r.headers.get("content-type") || "application/json; charset=utf-8",
        ...cors,
      })
      return res.end(response)
    } catch (e) {
      return send(502, { error: "UPSTREAM", errorDescription: "iiko недоступен: " + (e && e.message) })
    }
  }

  if (req.method !== "POST" || path !== "/token") return send(404, { error: "NOT_FOUND", errorDescription: "Not found" })
  if (!CLIENT_SECRET) return send(503, { error: "NOT_CONFIGURED", errorDescription: "На сервере не задан IIKO_CLIENT_SECRET" })

  let b
  try { b = JSON.parse(await readBody(req)) } catch { return send(400, { error: "BAD_REQUEST", errorDescription: "Некорректный JSON" }) }
  const apiKey = b && typeof b.apiKey === "string" ? b.apiKey.trim() : ""
  if (!apiKey) return send(400, { error: "BAD_REQUEST", errorDescription: "Нужно поле apiKey" })

  const payload = { apiKey, clientSecret: CLIENT_SECRET }
  if (APP_ID) payload.appId = APP_ID
  try {
    const r = await fetch(IIKO_BASE + "/api/v2/access_token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) })
    const text = await r.text()
    console.log(`${new Date().toISOString()} token -> ${r.status}`) // ключи и секреты в лог не пишем
    res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8", ...cors })
    res.end(text)
  } catch (e) {
    send(502, { error: "UPSTREAM", errorDescription: "iiko недоступен: " + (e && e.message) })
  }
})

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.listen(PORT, () => console.log(`iiko-auth слушает порт ${PORT}`))
}

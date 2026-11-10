// HTTP-обёртка над handle(): POST /yandex/devOps (и POST /), GET /health.
// Запуск: node server.js   Настройки — переменные окружения (см. README).
import http from "node:http"
import { handle } from "./handler.js"

const PORT = Number(process.env.PORT || 8080)
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean)
const MAX_BODY = 1024 * 1024

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
  const path = (req.url || "/").split("?")[0]

  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end() }
  if (req.method === "GET" && path === "/health") return send(200, { ok: true })
  if (req.method !== "POST" || !["/", "/yandex/devOps"].includes(path)) return send(404, { ok: false, error: { type: "NOT_FOUND", message: "Not found" } })

  let body
  try { body = JSON.parse(await readBody(req)) } catch { return send(400, { ok: false, error: { type: "BAD_REQUEST", message: "Некорректный JSON" } }) }

  const t0 = Date.now()
  const r = await handle(body)
  // в лог — только тип и цель запроса, без токенов и секретов
  let target = ""
  try { const u = new URL(body.url || body.baseUrl); target = u.host + u.pathname } catch { /* нет url */ }
  console.log(`${new Date().toISOString()} ${body.type} ${body.method || ""} ${target} -> ${r.json?.error?.type || "ok"} ${Date.now() - t0}ms`)
  send(r.status, r.json)
})

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.listen(PORT, () => console.log(`yandex-proxy слушает порт ${PORT}`))
}

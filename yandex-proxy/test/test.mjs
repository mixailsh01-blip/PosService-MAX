// Тесты на макете iiko-API: node test/test.mjs
import http from "node:http"

process.env.ALLOW_INSECURE_TARGETS = "1"
process.env.ALLOWED_HOSTS = "*"
process.env.UPSTREAM_TIMEOUT_MS = "1500"
process.env.ALLOWED_ORIGINS = "https://app.example"
const { handle } = await import("../handler.js")
const { server } = await import("../server.js")

let fails = 0
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++ }

// ---- макет API ----
const seen = []
const mock = http.createServer((req, res) => {
  let b = ""
  req.on("data", (c) => (b += c))
  req.on("end", () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: b })
    const send = (st, o, raw) => { res.writeHead(st, { "Content-Type": "application/json" }); res.end(raw ?? JSON.stringify(o)) }
    if (req.url === "/security/oauth/token") {
      const p = new URLSearchParams(b)
      return p.get("client_secret") === "good" && p.get("grant_type") === "client_credentials" && p.get("scope") === "read"
        ? send(200, { access_token: "tok-1" }) : send(401, { error: "invalid_client" })
    }
    if (req.headers.authorization !== "Bearer tok-1") return send(401, { error: { message: "Access token has been expired" } })
    if (req.url === "/restaurants") return send(200, { places: [{ id: "r1" }] })
    if (req.url === "/text") { res.writeHead(200); return res.end("просто текст") }
    if (req.url === "/empty") { res.writeHead(204); return res.end() }
    if (req.url === "/order" && req.method === "POST") return send(200, { id: "ord-1", got: JSON.parse(b) })
    if (req.url === "/bad") return send(400, { message: "Неверный заказ" })
    if (req.url === "/slow") return setTimeout(() => send(200, {}), 4000)
    send(404, { message: "no" })
  })
})
await new Promise((r) => mock.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${mock.address().port}`
const dev = (o) => handle({ type: "dev", headers: { Authorization: "Bearer tok-1" }, ...o })

// ---- auth ----
let r = await handle({ type: "auth", baseUrl: base + "/", client_id: "id", client_secret: "good" })
ok(r.json.access_token === "tok-1", "auth: токен получен (форма x-www-form-urlencoded, слэш в конце baseUrl убран)")
r = await handle({ type: "auth", baseUrl: base, client_id: "id", client_secret: "bad" })
ok(r.json.ok === false && r.json.error.type === "AUTH_FAILED" && r.json.error.status === 401, "auth: неверный секрет -> AUTH_FAILED")
r = await handle({ type: "auth", baseUrl: base })
ok(r.status === 400 && r.json.error.type === "BAD_REQUEST", "auth: нет client_id/secret -> 400")

// ---- dev ----
r = await dev({ method: "GET", url: base + "/restaurants" })
ok(r.json.places?.[0].id === "r1", "GET: ответ API возвращается как есть")
ok(seen.at(-1).headers.authorization === "Bearer tok-1", "GET: заголовки переданы")
r = await dev({ method: "GET", url: base + "/restaurants", headers: { Authorization: "Bearer tok-1", Timeout: 2 } })
ok(r.json.places && seen.at(-1).headers.timeout === "2", "GET: числовые заголовки приводятся к строке")
r = await dev({ method: "POST", url: base + "/order", body: { items: [1, 2] } })
ok(r.json.id === "ord-1" && r.json.got.items.length === 2, "POST: тело ушло как JSON")
ok(seen.at(-1).headers["content-type"] === "application/json", "POST: Content-Type добавлен")
r = await dev({ method: "GET", url: base + "/text" })
ok(r.json.data === "просто текст", "не-JSON ответ заворачивается в {data}")
r = await dev({ method: "GET", url: base + "/empty" })
ok(JSON.stringify(r.json) === "{}", "пустой ответ -> {}")
r = await handle({ type: "dev", method: "GET", url: base + "/restaurants", headers: { Authorization: "Bearer old" } })
ok(r.json.ok === false && r.json.error.type === "AUTH_EXPIRED" && r.json.error.status === 401, "GET: истёкший токен -> AUTH_EXPIRED")
r = await handle({ type: "dev", method: "POST", url: base + "/order", body: {}, headers: { Authorization: "Bearer old" } })
ok(r.json.error?.type === "AUTH_EXPIRED", "POST: истёкший токен тоже -> AUTH_EXPIRED")
r = await dev({ method: "POST", url: base + "/bad", body: {} })
ok(r.json.ok === false && r.json.error.type === "UPSTREAM_ERROR" && r.json.error.status === 400 && r.json.error.message.includes("Неверный заказ"), "ошибка API -> UPSTREAM_ERROR с текстом")
r = await dev({ method: "GET", url: base + "/slow" })
ok(r.json.error?.type === "PROXY_ERROR" && /Таймаут/.test(r.json.error.message), "таймаут -> PROXY_ERROR")
r = await dev({ method: "TRACE", url: base + "/x" })
ok(r.status === 400, "неподдерживаемый метод -> 400")
r = await handle({ type: "zzz" })
ok(r.status === 400, "неизвестный type -> 400")

// ---- защита (боевой режим) ----
process.env.ALLOW_INSECURE_TARGETS = "0"
process.env.ALLOWED_HOSTS = "*.iikoweb.ru"
for (const [u, why] of [
  ["http://demo.iikoweb.ru/x", "http запрещён"],
  ["https://evil.example/x", "чужой хост запрещён"],
  ["https://iikoweb.ru.evil.example/x", "обход через суффикс запрещён"],
  ["https://127.0.0.1/x", "локальный IP запрещён"],
]) {
  r = await handle({ type: "dev", method: "GET", url: u, headers: {} })
  ok(r.json.ok === false && r.json.error.type === "PROXY_ERROR", "защита: " + why)
}
process.env.ALLOWED_HOSTS = "*"
for (const ip of ["https://10.0.0.5/x", "https://169.254.169.254/x", "https://[::1]/x", "https://192.168.1.1/x"]) {
  r = await handle({ type: "dev", method: "GET", url: ip, headers: {} })
  ok(r.json.error?.type === "PROXY_ERROR", "защита: приватный адрес " + ip)
}
process.env.ALLOW_INSECURE_TARGETS = "1"

// ---- HTTP-слой и CORS ----
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const sbase = `http://127.0.0.1:${server.address().port}`
let h = await fetch(sbase + "/yandex/devOps", { method: "OPTIONS", headers: { Origin: "https://app.example" } })
ok(h.status === 204 && h.headers.get("access-control-allow-origin") === "https://app.example", "CORS: preflight для разрешённого origin")
h = await fetch(sbase + "/yandex/devOps", { method: "OPTIONS", headers: { Origin: "https://evil.example" } })
ok(!h.headers.get("access-control-allow-origin"), "CORS: чужой origin не получает заголовок")
h = await fetch(sbase + "/yandex/devOps", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example" }, body: JSON.stringify({ type: "auth", baseUrl: base, client_id: "i", client_secret: "good" }) })
ok((await h.json()).access_token === "tok-1", "HTTP: auth через сервер")
h = await fetch(sbase + "/yandex/devOps", { method: "POST", body: "{не json" })
ok(h.status === 400, "HTTP: битый JSON -> 400")
h = await fetch(sbase + "/health")
ok((await h.json()).ok === true, "HTTP: /health")
h = await fetch(sbase + "/other", { method: "POST", body: "{}" })
ok(h.status === 404, "HTTP: чужой путь -> 404")

server.close(); mock.close()
console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
process.exit(fails ? 1 : 0)

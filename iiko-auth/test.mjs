import assert from "node:assert/strict"

process.env.IIKO_APP_ID = "server-app"
process.env.IIKO_CLIENT_SECRET = "server-secret"
process.env.ALLOWED_ORIGINS = "https://sprtapi.sprt-service.ru"

const calls = []
const nativeFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response(JSON.stringify({ token: "ok", url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

const { server } = await import("./server.js")
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const base = `http://127.0.0.1:${server.address().port}`

try {
  const tokenResponse = await nativeFetch(base + "/iiko-auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://sprtapi.sprt-service.ru" },
    body: JSON.stringify({ apiKey: "employee-key" }),
  })
  assert.equal(tokenResponse.status, 200)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    apiKey: "employee-key",
    clientSecret: "server-secret",
    appId: "server-app",
  })

  const apiResponse = await nativeFetch(base + "/iiko-api/api/1/organizations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer employee-token",
      Origin: "https://sprtapi.sprt-service.ru",
    },
    body: "{}",
  })
  assert.equal(apiResponse.status, 200)
  assert.equal(calls[1].url, "https://api-ru.iiko.services/api/1/organizations")
  assert.equal(calls[1].options.headers.Authorization, "Bearer employee-token")
  console.log("OK: токен и API идут через серверный прокси")
} finally {
  server.close()
}

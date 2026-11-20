import assert from "node:assert/strict"

process.env.IIKO_APP_ID = "server-app"
process.env.IIKO_CLIENT_SECRET = "server-secret"
process.env.ALLOWED_ORIGINS = "https://sprtapi.sprt-service.ru"

const calls = []
let upstreamStatus = 200
const nativeFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response(JSON.stringify({ token: "ok", url }), {
    status: upstreamStatus,
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
  for (const path of [
    "/api/reporting/v1/olap/columns/get",
    "/api/v2/access_token",
    "/api/1/terminal_groups?includeDisabled=true",
  ]) {
    const response = await nativeFetch(base + "/iiko-api" + path, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer employee-token" },
      body: JSON.stringify({ reportType: "SALES" }),
    })
    assert.equal(response.status, 200)
    assert.equal(calls.at(-1).url, "https://api-ru.iiko.services" + path)
    assert.equal(calls.at(-1).options.headers.Authorization, "Bearer employee-token")
    assert.equal(calls.at(-1).options.body, '{"reportType":"SALES"}')
  }
  for (const status of [401,403,404]) {
    upstreamStatus = status
    const response = await nativeFetch(base + "/iiko-api/api/reporting/v1/olap/columns/get", { method: "POST", body: '{}' })
    assert.equal(response.status,status)
  }
  upstreamStatus = 200
  const before = calls.length
  const invalid = await nativeFetch(base + "/iiko-api/admin/settings", { method: "POST", body: "{}" })
  assert.equal(invalid.status,404)
  assert.equal(calls.length,before)
  console.log("OK: token, numbered API, reporting API and query strings use the fixed iiko upstream")
} finally {
  server.close()
}

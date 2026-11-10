import fs from "fs"
const dir = new URL("../", import.meta.url).pathname
const pre = fs.readFileSync(dir + "pre-request.js", "utf8")
const post = fs.readFileSync(dir + "post-request.js", "utf8")
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// ---- макет iiko API ----
let calls = []
const routes = {
  "/api/1/access_token": (b) => (b.apiLogin === "good" ? { token: "TOK-" + calls.length } : { __status: 401, errorDescription: "bad login" }),
  "/api/v2/access_token": (b) => (b.apiKey === "good" && b.clientSecret === "sec" ? { token: "TOK2-" + calls.length } : { __status: 401, errorDescription: "bad key/secret" }),
  "/api/1/organizations": () => ({ organizations: [{ id: "org-1", name: "Кафе 1" }, { id: "org-2", name: "Кафе 2" }] }),
  "/api/1/terminal_groups": () => ({ terminalGroups: [{ organizationId: "org-1", items: [{ id: "tg-1", name: "Касса" }] }] }),
  "/api/1/nomenclature": () => ({ products: [{ id: "p0", type: "Modifier" }, { id: "p1", name: "Борщ", type: "Dish", sizePrices: [{ price: { currentPrice: 350, isIncludedInMenu: true } }] }] }),
  "/api/1/payment_types": () => ({ paymentTypes: [{ id: "pt-card", paymentTypeKind: "Card" }, { id: "pt-cash", paymentTypeKind: "Cash" }] }),
  "/api/1/deliveries/order_types": () => ({ orderTypes: [{ items: [{ id: "ot-c", orderServiceType: "DeliveryByCourier" }, { id: "ot-p", orderServiceType: "DeliveryPickUp" }] }] }),
  "/api/1/employees/couriers": () => ({ employees: [{ items: [{ id: "emp-1" }] }] }),
  "/api/2/menu": () => ({ externalMenus: [{ id: "menu-1" }], priceCategories: [{ id: "pc-1" }] }),
  "/api/1/reserve/available_restaurant_sections": () => ({ restaurantSections: [{ id: "sec-1", tables: [{ id: "tbl-1" }] }] }),
}
globalThis.fetch = async (u, o) => {
  const path = u.replace("https://api-ru.iiko.services", "")
  const body = o.body ? JSON.parse(o.body) : {}
  calls.push({ path, auth: o.headers.Authorization, body })
  const h = routes[path]
  if (!h) return { ok: false, status: 404, json: async () => ({}) }
  const data = h(body)
  const st = data.__status || 200
  return { ok: st < 300, status: st, json: async () => data }
}
globalThis.console.log = (...a) => (globalThis.__logs ||= []).push(a.join(" "))

function makeCtx(env, url, bodyText, response) {
  globalThis.pw = {
    env: {
      get: (k) => env[k],
      set: (k, v) => { env[k] = v },
    },
    response,
    test: (n, fn) => { try { fn(); (globalThis.__tests ||= []).push("PASS " + n) } catch (e) { (globalThis.__tests ||= []).push("FAIL " + n) } },
    expect: (v) => ({
      toBeLevel2xx: () => { if (!(v >= 200 && v < 300)) throw new Error("x") },
      toBe: (x) => { if (v !== x) throw new Error("x") },
    }),
  }
  globalThis.hopp = { request: { url, body: { contentType: "application/json", body: bodyText } } }
}
const run = (src) => new AsyncFunction(src)()

let fails = 0
const ok = (c, m) => { console.error((c ? "ok   " : "FAIL ") + m); if (!c) fails++ }

// 1. нет apiLogin -> понятная ошибка
{
  const env = { baseUrl: "https://api-ru.iiko.services" }
  makeCtx(env, "<<baseUrl>>/api/1/organizations", "{}")
  let err = ""
  try { await run(pre) } catch (e) { err = e.message }
  ok(err.includes("apiLogin"), "без apiLogin — понятная ошибка: " + err.slice(0, 40))
}
// 2. запрос с organizationId и terminalGroupId: токен + организация + терминал за один проход
{
  calls = []
  const env = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good" }
  makeCtx(env, "<<baseUrl>>/api/1/order/create", '{"organizationId":"<<organizationId>>","terminalGroupId":"<<terminalGroupId>>"}')
  await run(pre)
  ok(env.token?.startsWith("TOK"), "токен получен автоматически")
  ok(env.organizationId === "org-1" && env.organizationName === "Кафе 1", "организация подставлена")
  ok(env.organizationsList.includes("2) Кафе 2"), "список организаций сохранён")
  ok(env.terminalGroupId === "tg-1", "терминал подставлен")
  ok(calls.map((c) => c.path).join() === "/api/1/access_token,/api/1/organizations,/api/1/terminal_groups", "порядок вызовов: " + calls.map((c) => c.path).join())
  ok(calls[1].auth === "Bearer " + env.token, "Authorization передан")
  ok(/^\d{4}-\d\d-\d\d 00:00:00\.000$/.test(env.todayStart) && /23:59:59\.999$/.test(env.todayEnd), "даты: " + env.todayStart + " … " + env.todayEnd)
  ok(/^[0-9a-f-]{36}$/.test(env.guid) && env.orderNumber.startsWith("SPRT-"), "guid/номер заказа")
}
// 3. повторный запрос: ничего лишнего не вызывается
{
  calls = []
  const env = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good", token: "T", tokenTime: Date.now(), organizationId: "org-1", terminalGroupId: "tg-1" }
  makeCtx(env, "<<baseUrl>>/api/1/order/create", '{"organizationId":"<<organizationId>>"}')
  await run(pre)
  ok(calls.length === 0, "второй запрос без сетевых вызовов")
}
// 4. просроченный токен обновляется
{
  calls = []
  const env = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good", token: "OLD", tokenTime: Date.now() - 55 * 60000, organizationId: "org-1" }
  makeCtx(env, "<<baseUrl>>/api/1/stop_lists", '{"organizationIds":["<<organizationId>>"]}')
  await run(pre)
  ok(env.token !== "OLD" && calls.length === 1, "просроченный токен обновлён")
}
// 5. продукты/оплата/тип заказа/курьер/меню/стол
{
  calls = []
  const env = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good" }
  const body = '{"a":"<<productId>>","b":<<productPrice>>,"c":"<<paymentTypeId>>","d":"<<paymentTypeKind>>","e":"<<orderTypeId>>","f":"<<employeeId>>","g":"<<externalMenuId>>","h":"<<tableId>>"}'
  makeCtx(env, "<<baseUrl>>/api/1/deliveries/create", body)
  await run(pre)
  ok(env.productId === "p1" && env.productPrice === "350" && env.productName === "Борщ", "товар и цена")
  ok(env.paymentTypeId === "pt-cash" && env.paymentTypeKind === "Cash", "оплата наличными")
  ok(env.orderTypeId === "ot-p", "тип заказа — самовывоз")
  ok(env.employeeId === "emp-1" && env.externalMenuId === "menu-1" && env.priceCategoryId === "pc-1", "курьер и меню")
  ok(env.tableId === "tbl-1" && env.restaurantSectionId === "sec-1" && env.terminalGroupId === "tg-1", "стол и зона")
}
// 6. сам запрос токена пропускается
{
  calls = []
  const env = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good" }
  makeCtx(env, "<<baseUrl>>/api/1/access_token", '{"apiLogin":"<<apiLogin>>"}')
  await run(pre)
  ok(calls.length === 0, "запрос токена не вызывает авто-логика")
}
// 6b. новая схема: clientSecret -> /api/v2/access_token, appId передаётся, если задан
{
  calls = []
  const env = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good", clientSecret: "sec", appId: "app-1" }
  makeCtx(env, "<<baseUrl>>/api/1/stop_lists", "{}")
  await run(pre)
  ok(calls[0].path === "/api/v2/access_token" && calls[0].body.apiKey === "good" && calls[0].body.appId === "app-1", "v2: токен по apiKey+clientSecret+appId")
  ok(String(env.token).startsWith("TOK2-"), "v2: токен сохранён")
  calls = []
  const env2 = { baseUrl: "https://api-ru.iiko.services", apiLogin: "good", clientSecret: "sec" }
  makeCtx(env2, "<<baseUrl>>/api/1/stop_lists", "{}")
  await run(pre)
  ok(calls[0].path === "/api/v2/access_token" && !("appId" in calls[0].body), "v2: без appId поле не отправляется")
}
// 7. post-request
{
  const env = {}
  globalThis.__tests = []
  makeCtx(env, "<<baseUrl>>/api/1/deliveries/create", "{}", { status: 200, body: { correlationId: "corr-1", orderInfo: { id: "ord-1" } } })
  await run(post)
  ok(env.orderId === "ord-1" && env.correlationId === "corr-1", "post: orderId и correlationId сохранены")
  ok(__tests[0] === "PASS HTTP 200" && __tests.length === 1, "post: тест статуса: " + __tests.join("|"))

  globalThis.__tests = []
  makeCtx(env, "<<baseUrl>>/api/1/stop_lists", "{}", { status: 400, body: { errorDescription: "Organization not found", error: "BadRequest" } })
  await run(post)
  ok(__tests.some((t) => t.startsWith("FAIL HTTP 400")) && __tests.some((t) => t.includes("Organization not found")), "post: ошибка iiko видна в тестах")

  makeCtx(env, "<<baseUrl>>/api/1/stop_lists", "{}", { status: 401, body: {} })
  env.token = "X"; await run(post)
  ok(env.token === "" && env.tokenTime === "0", "post: 401 сбрасывает токен")

  const e2 = {}
  makeCtx(e2, "<<baseUrl>>/api/1/deliveries/by_delivery_date_and_status", "{}", { status: 200, body: { ordersByOrganizations: [{ orders: [{ id: "o9" }] }] } })
  await run(post)
  ok(e2.orderId === "o9", "post: orderId из списка заказов")
  makeCtx(e2, "<<baseUrl>>/api/1/loyalty/iiko/customer/info", "{}", { status: 200, body: { id: "cust-1" } })
  await run(post)
  ok(e2.customerId === "cust-1", "post: customerId")
}
console.error(fails ? fails + " ПРОВАЛОВ" : "ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
process.exit(fails ? 1 : 0)

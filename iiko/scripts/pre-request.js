// СПРТ • автоматизация iiko Cloud API (v3).
// Выполняется перед каждым запросом коллекции: сама получает токен и подставляет ID.
// Вручную нужно вписать apiLogin (API-ключ из iikoWeb) и clientSecret (из портала разработчика iiko) в окружении «iiko Cloud API».
const get = (k) => {
  const v = pw.env.get(k)
  return v === undefined || v === null ? "" : String(v)
}
const set = (k, v) => pw.env.set(k, v === undefined || v === null ? "" : String(v))

const base = (get("baseUrl") || "https://api-ru.iiko.services").replace(/\/+$/, "")
const url = String(hopp.request.url || "")
const reqBody = hopp.request.body
const raw = url + " " + (reqBody && typeof reqBody.body === "string" ? reqBody.body : "")
const used = (name) => raw.includes("<<" + name + ">>")
const isAuthCall = /\/access_token(\?|$)/.test(url)

// ---- динамические значения: даты, GUID, номер заказа ----
const pad = (n, l = 2) => String(n).padStart(l, "0")
const fmt = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
const now = new Date()
const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
const guid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
set("todayStart", fmt(dayStart))
set("todayEnd", fmt(dayEnd))
set("weekAgoStart", fmt(new Date(dayStart.getTime() - 7 * 86400000)))
set("now", fmt(now))
set("nowPlus1h", fmt(new Date(now.getTime() + 3600000)))
set("guid", guid())
set("orderNumber", "SPRT-" + Math.floor(now.getTime() / 1000))

// ---- обращение к API ----
async function call(path, body, auth = true) {
  const headers = { "Content-Type": "application/json" }
  if (auth) headers.Authorization = "Bearer " + get("token")
  const res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body || {}) })
  let data = null
  try { data = await res.json() } catch (_) { /* пустой ответ */ }
  if (!res.ok) {
    const why = (data && (data.errorDescription || data.message || data.error)) || ""
    throw new Error(`iiko ${path}: ${res.status} ${why}`)
  }
  return data
}

if (!isAuthCall) {
  // 1. токен (живёт ~1 час, обновляем за 10 минут до конца)
  const age = Date.now() - Number(get("tokenTime") || 0)
  if (!get("token") || age > 50 * 60 * 1000) {
    const login = get("apiLogin")
    const secret = get("clientSecret")
    if (!login) {
      throw new Error("СПРТ: впишите apiLogin (API-ключ из iikoWeb) в окружении «iiko Cloud API» (значок окружений справа вверху).")
    }
    let t
    if (secret) {
      // новая схема iiko: /api/v2/access_token (API-ключ + Client Secret, appId — если выдан)
      const body = { apiKey: login, clientSecret: secret }
      if (get("appId")) body.appId = get("appId")
      t = await call("/api/v2/access_token", body, false)
    } else {
      try {
        t = await call("/api/1/access_token", { apiLogin: login }, false)
      } catch (e) {
        if (/v2|does not support/i.test(String(e && e.message))) {
          throw new Error("СПРТ: этот ключ работает только по новой схеме iiko. Впишите clientSecret (и appId, если он у вас есть) в окружении «iiko Cloud API». Секрет выдаётся в портале разработчика: public-api.iikoweb.ru/portal.")
        }
        throw e
      }
    }
    if (t && !t.token) t.token = t.accessToken || t.access_token
    set("token", t.token)
    set("tokenTime", Date.now())
  }

  // 2. организация — если запрос на неё ссылается, а она ещё не выбрана
  const needs = (k) => used(k) && !get(k)
  const dependent = ["terminalGroupId", "productId", "productPrice", "paymentTypeId", "paymentTypeKind", "orderTypeId", "employeeId", "externalMenuId", "tableId"]
  if ((needs("organizationId") || dependent.some(needs)) && !get("organizationId")) {
    const r = await call("/api/1/organizations", { returnAdditionalInfo: false, includeDisabled: false })
    const orgs = (r && r.organizations) || []
    if (!orgs.length) throw new Error("СПРТ: для этого apiLogin нет доступных организаций")
    set("organizationId", orgs[0].id)
    set("organizationName", orgs[0].name)
    set("organizationsList", orgs.map((o, i) => `${i + 1}) ${o.name} — ${o.id}`).join("\n"))
  }

  // 3. остальные справочные ID — по необходимости (ошибка здесь не должна ломать запрос)
  const org = get("organizationId")
  const lazy = async (keys, fn) => {
    if (!keys.some(needs)) return
    try { await fn() } catch (e) { console.log("СПРТ: не удалось подставить " + keys.join("/") + ": " + e.message) }
  }
  await lazy(["terminalGroupId"], async () => {
    const r = await call("/api/1/terminal_groups", { organizationIds: [org], includeDisabled: false })
    const t = r && r.terminalGroups && r.terminalGroups[0] && r.terminalGroups[0].items && r.terminalGroups[0].items[0]
    if (t) { set("terminalGroupId", t.id); set("terminalGroupName", t.name) }
  })
  await lazy(["productId", "productPrice"], async () => {
    const r = await call("/api/1/nomenclature", { organizationId: org })
    const p = (r.products || []).find((x) => x.type === "Dish" && !x.isDeleted && x.sizePrices && x.sizePrices[0] && x.sizePrices[0].price && x.sizePrices[0].price.isIncludedInMenu)
      || (r.products || []).find((x) => x.type === "Dish" && !x.isDeleted)
    if (p) {
      set("productId", p.id); set("productName", p.name)
      const price = p.sizePrices && p.sizePrices[0] && p.sizePrices[0].price && p.sizePrices[0].price.currentPrice
      set("productPrice", price || 0)
    }
  })
  await lazy(["paymentTypeId", "paymentTypeKind"], async () => {
    const r = await call("/api/1/payment_types", { organizationIds: [org] })
    const p = (r.paymentTypes || []).find((x) => x.paymentTypeKind === "Cash") || (r.paymentTypes || [])[0]
    if (p) { set("paymentTypeId", p.id); set("paymentTypeKind", p.paymentTypeKind) }
  })
  await lazy(["orderTypeId"], async () => {
    const r = await call("/api/1/deliveries/order_types", { organizationIds: [org] })
    const items = (r.orderTypes && r.orderTypes[0] && r.orderTypes[0].items) || []
    const t = items.find((x) => x.orderServiceType === "DeliveryPickUp") || items[0]
    if (t) set("orderTypeId", t.id)
  })
  await lazy(["employeeId"], async () => {
    const r = await call("/api/1/employees/couriers", { organizationIds: [org] })
    const e = r.employees && r.employees[0] && r.employees[0].items && r.employees[0].items[0]
    if (e) set("employeeId", e.id)
  })
  await lazy(["externalMenuId"], async () => {
    const r = await call("/api/2/menu", {})
    const m = r.externalMenus && r.externalMenus[0]
    if (m) set("externalMenuId", m.id)
    const pc = r.priceCategories && r.priceCategories[0]
    if (pc) set("priceCategoryId", pc.id)
  })
  await lazy(["tableId"], async () => {
    if (!get("terminalGroupId")) {
      const g = await call("/api/1/terminal_groups", { organizationIds: [org], includeDisabled: false })
      const t = g.terminalGroups && g.terminalGroups[0] && g.terminalGroups[0].items && g.terminalGroups[0].items[0]
      if (t) set("terminalGroupId", t.id)
    }
    const r = await call("/api/1/reserve/available_restaurant_sections", { terminalGroupIds: [get("terminalGroupId")] })
    const s = r.restaurantSections && r.restaurantSections[0]
    const tb = s && s.tables && s.tables[0]
    if (s) set("restaurantSectionId", s.id)
    if (tb) set("tableId", tb.id)
  })
}

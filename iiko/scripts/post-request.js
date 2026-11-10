// СПРТ • автоматизация iiko Cloud API (после каждого запроса коллекции):
// запоминает ID из ответов, показывает ошибки iiko в тестах и сбрасывает просроченный токен.
const m = String(hopp.request.url || "").match(/\/api\/\d\/[^?\s#]*/)
const p = m ? m[0].replace(/\/+$/, "") : ""
const status = pw.response.status
const b = pw.response.body && typeof pw.response.body === "object" ? pw.response.body : {}

const put = (k, v) => { if (v !== undefined && v !== null && v !== "") pw.env.set(k, String(v)) }
const fill = (k, v) => { const cur = pw.env.get(k); if (!cur && v !== undefined && v !== null && v !== "") pw.env.set(k, String(v)) }
const first = (a) => (Array.isArray(a) ? a[0] : undefined)

// ---- проверки: HTTP-статус и ошибка iiko ----
pw.test("HTTP " + status, () => { pw.expect(status).toBeLevel2xx() })
if (b.errorDescription || b.error) {
  const text = "Ошибка iiko: " + (b.errorDescription || b.error)
  pw.test(text, () => { pw.expect(b.errorDescription || b.error).toBe("") })
}
if (status === 401) {
  // токен просрочен или неверный: следующий запрос получит новый сам
  pw.env.set("token", "")
  pw.env.set("tokenTime", "0")
}

// ---- запоминаем ID для следующих запросов ----
if (/\/access_token$/.test(p)) {
  put("token", b.token); put("tokenTime", Date.now())
} else if (/\/api\/1\/organizations$/.test(p)) {
  const o = first(b.organizations)
  if (o) { fill("organizationId", o.id); fill("organizationName", o.name) }
  put("organizationsList", (b.organizations || []).map((x, i) => `${i + 1}) ${x.name} — ${x.id}`).join("\n"))
} else if (/\/terminal_groups$/.test(p)) {
  const g = first(b.terminalGroups)
  const t = g && first(g.items)
  if (t) { fill("terminalGroupId", t.id); fill("terminalGroupName", t.name) }
} else if (/\/(deliveries|order)\/create$/.test(p)) {
  if (b.orderInfo) put("orderId", b.orderInfo.id)
  put("correlationId", b.correlationId)
} else if (/\/(deliveries\/(by_|drafts\/by_)|order\/by_)/.test(p)) {
  const g = first(b.ordersByOrganizations)
  const o = g && first(g.orders)
  if (o) fill("orderId", o.id)
} else if (/\/employees\/couriers$/.test(p)) {
  const g = first(b.employees)
  const e = g && first(g.items)
  if (e) fill("employeeId", e.id)
} else if (/\/loyalty\/iiko\/customer\/(info|create_or_update)$/.test(p)) {
  put("customerId", b.id)
} else if (/\/api\/2\/menu$/.test(p)) {
  const mm = first(b.externalMenus)
  if (mm) fill("externalMenuId", mm.id)
  const pc = first(b.priceCategories)
  if (pc) fill("priceCategoryId", pc.id)
} else if (/\/payment_types$/.test(p)) {
  const t = first(b.paymentTypes)
  if (t) { fill("paymentTypeId", t.id); fill("paymentTypeKind", t.paymentTypeKind) }
} else if (/\/api\/1\/nomenclature$/.test(p)) {
  const d = (b.products || []).find((x) => x.type === "Dish" && !x.isDeleted)
  if (d) { fill("productId", d.id); fill("productName", d.name) }
} else if (/\/reserve\/available_restaurant_sections$/.test(p)) {
  const s = first(b.restaurantSections)
  if (s) { fill("restaurantSectionId", s.id); const t = first(s.tables); if (t) fill("tableId", t.id) }
} else if (/\/cities$/.test(p)) {
  const g = first(b.cities)
  const c = g && first(g.items)
  if (c) fill("cityId", c.id)
}

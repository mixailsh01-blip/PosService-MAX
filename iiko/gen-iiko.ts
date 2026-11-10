// Generates a Hoppscotch collection + environment for the iiko Cloud API
// from the (openapi-typescript) types file. Usage: tsx gen-iiko.ts <index.d.ts> <outDir>
import ts from "typescript"
import fs from "fs"
import path from "path"
import { HoppCollection, getDefaultRESTRequest, makeCollection } from "./data-src/index"

const [, , dts, outDir] = process.argv
const program = ts.createProgram([dts], { skipLibCheck: true, noEmit: true })
const checker = program.getTypeChecker()
const sf = program.getSourceFile(dts)!
const iface = (name: string) => {
  let r: ts.InterfaceDeclaration | undefined
  sf.forEachChild((n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === name) r = n })
  return r!
}

const jsdoc = (s: ts.Symbol) => {
  const text = ts.displayPartsToString(s.getDocumentationComment(checker)).trim()
  const tags = Object.fromEntries(s.getJsDocTags(checker).map((t) => [t.name, ts.displayPartsToString(t.text)]))
  return { text, tags }
}
const strip = (t: ts.Type) => t.isUnion() ? t.types.filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) : [t]

// Подстановки переменных окружения по имени поля (см. scripts/pre-request.js)
const HINTS: Record<string, string> = {
  organizationId: "<<organizationId>>", organizationIds: "<<organizationId>>",
  terminalGroupId: "<<terminalGroupId>>", terminalGroupIds: "<<terminalGroupId>>",
  orderId: "<<orderId>>", orderIds: "<<orderId>>",
  employeeId: "<<employeeId>>", courierIds: "<<employeeId>>", customerId: "<<customerId>>",
  correlationId: "<<correlationId>>", tableIds: "<<tableId>>", restaurantSectionIds: "<<restaurantSectionId>>",
  externalMenuId: "<<externalMenuId>>", priceCategoryId: "<<priceCategoryId>>", cityId: "<<cityId>>",
  productId: "<<productId>>", paymentTypeId: "<<paymentTypeId>>", paymentTypeKind: "<<paymentTypeKind>>",
  deliveryDateFrom: "<<todayStart>>", deliveryDateTo: "<<todayEnd>>", dateFrom: "<<todayStart>>", dateTo: "<<todayEnd>>",
  deliveryDate: "<<now>>", newCompleteBefore: "<<nowPlus1h>>", estimatedStartTime: "<<nowPlus1h>>", completeBefore: "<<nowPlus1h>>",
  phone: "+79990000000", externalNumber: "<<orderNumber>>",
}
const ENUM_PICK: Record<string, string> = { deliveryStatus: "OnWay", orderServiceType: "DeliveryByClient" }
const ALL_ENUM_ARRAYS = new Set(["statuses"])
function sample(t: ts.Type, depth = 0, seen: Set<ts.Type> = new Set(), hint = ""): any {
  const parts = strip(t)
  if (!parts.length) return null
  if (parts.length > 1) {
    if (parts.every((p) => p.isStringLiteral())) return hint || (parts[0] as ts.StringLiteralType).value
    if (parts.every((p) => p.flags & ts.TypeFlags.BooleanLiteral)) return true
    const obj = parts.find((p) => p.flags & ts.TypeFlags.Object)
    return sample(obj ?? parts[0], depth, seen, hint)
  }
  const p = parts[0]
  if (p.isStringLiteral()) return p.value
  if (p.isNumberLiteral()) return p.value
  if (p.flags & ts.TypeFlags.StringLike) return hint || ""
  if (p.flags & ts.TypeFlags.NumberLike) return 0
  if (p.flags & ts.TypeFlags.BooleanLike) return false
  if (checker.isArrayType(p)) {
    if (depth > 5) return []
    const el = checker.getTypeArguments(p as ts.TypeReference)[0]
    if (hint === "__ALL__") {
      const lits = strip(el).filter((x) => x.isStringLiteral()).map((x) => (x as ts.StringLiteralType).value)
      if (lits.length) return lits
    }
    return [sample(el, depth + 1, seen, hint)]
  }
  if (p.flags & ts.TypeFlags.Object) {
    if (seen.has(p) || depth > 5) return {}
    const s2 = new Set(seen); s2.add(p)
    const out: any = {}
    for (const prop of checker.getPropertiesOfType(p)) {
      const optional = !!(prop.flags & ts.SymbolFlags.Optional)
      const { tags } = jsdoc(prop)
      const pt = checker.getTypeOfSymbolAtLocation(prop, sf)
      // optional fields are skipped (a minimal valid body), except structures near the top (e.g. `order`)
      const isStruct = strip(pt).some((x) => (x.flags & ts.TypeFlags.Object) !== 0)
      const h = ALL_ENUM_ARRAYS.has(prop.name) ? "__ALL__" : HINTS[prop.name]
      if (optional && !h && !ENUM_PICK[prop.name] && !(isStruct && depth <= 1)) continue
      if (ENUM_PICK[prop.name]) { out[prop.name] = ENUM_PICK[prop.name]; continue }
      out[prop.name] = h && h !== "__ALL__" && !isStruct && !(strip(pt).some((x) => checker.isArrayType(x)))
        ? h
        : tags.example !== undefined && tags.example !== "" && !h
        ? parseExample(tags.example, pt)
        : sample(pt, depth + 1, s2, h ?? "")
    }
    return out
  }
  return null
}
function parseExample(ex: string, t: ts.Type) {
  const x = ex.trim()
  if (strip(t).some((p) => p.flags & ts.TypeFlags.NumberLike)) return Number.isNaN(Number(x)) ? 0 : Number(x)
  if (strip(t).some((p) => p.flags & ts.TypeFlags.BooleanLike)) return x === "true"
  return x
}
function optionalNames(t: ts.Type): string[] {
  const p = strip(t)[0]
  if (!p || !(p.flags & ts.TypeFlags.Object)) return []
  return checker.getPropertiesOfType(p).filter((q) => q.flags & ts.SymbolFlags.Optional).map((q) => q.name)
}

const SECTIONS: Record<string, string> = {
  access_token: "Авторизация", organizations: "Организации", nomenclature: "Номенклатура и меню", menu: "Номенклатура и меню",
  stop_lists: "Стоп-листы", terminal_groups: "Терминалы", deliveries: "Доставка", order: "Заказы в зале", reserve: "Резервы и столы",
  payment_types: "Справочники", order_types: "Справочники", discounts: "Скидки и акции", loyalty: "Лояльность (iikoCard)",
  employees: "Сотрудники и курьеры", webhooks: "Вебхуки", notifications: "Уведомления", commands: "Статусы команд",
  cities: "Адреса и регионы", regions: "Адреса и регионы", streets: "Адреса и регионы", delivery_restrictions: "Ограничения доставки",
  tips_types: "Справочники", removal_types: "Справочники", marketing_sources: "Справочники", cancel_causes: "Справочники",
  combo: "Комбо", customers: "Клиенты", operations: "Статусы команд",
}
const sectionOf = (p: string) => {
  const seg = p.split("/").filter(Boolean).slice(2)[0] ?? "other"
  return SECTIONS[seg] ?? "Прочее: " + seg
}

const pathsT = checker.getTypeAtLocation(iface("paths"))
type Ep = { path: string; method: string; summary: string; body: any; optional: string[] }
const eps: Ep[] = []
for (const pp of checker.getPropertiesOfType(pathsT)) {
  const pt = checker.getTypeOfSymbolAtLocation(pp, sf)
  for (const m of checker.getPropertiesOfType(pt)) {
    const method = m.name.toUpperCase()
    if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) continue
    const op = checker.getTypeOfSymbolAtLocation(m, sf)
    const rb = op.getProperty("requestBody")
    let body: any = undefined, optional: string[] = []
    if (rb) {
      const rbt = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(rb, sf))
      const content = rbt.getProperty("content")
      const json = content && checker.getTypeOfSymbolAtLocation(content, sf).getProperty("application/json")
      if (json) {
        const jt = checker.getTypeOfSymbolAtLocation(json, sf)
        body = sample(jt); optional = optionalNames(jt)
      }
    }
    eps.push({ path: pp.name, method, summary: jsdoc(m).text || pp.name, body, optional })
  }
}

// ---- build collection
const readScript = (f: string) => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "scripts", f), "utf8")

// Русские названия методов (ключ: путь)
const NAMES: Record<string, string> = {
  "/api/1/regions": "Регионы", "/api/1/cities": "Города", "/api/1/streets/by_city": "Улицы города",
  "/api/1/webhooks/settings": "Вебхуки: получить настройки", "/api/1/webhooks/update_settings": "Вебхуки: изменить настройки",
  "/api/1/deliveries/create": "Создать заказ доставки (создаёт заказ!)",
  "/api/1/deliveries/update_order_problem": "Отметить проблему в заказе",
  "/api/1/deliveries/update_order_payments": "Обновить оплаты заказа",
  "/api/1/deliveries/update_order_delivery_status": "Изменить статус доставки",
  "/api/1/deliveries/update_order_courier": "Назначить курьера",
  "/api/1/deliveries/add_items": "Добавить позиции в заказ",
  "/api/1/deliveries/close": "Закрыть заказ доставки",
  "/api/1/deliveries/cancel": "Отменить заказ доставки",
  "/api/1/deliveries/change_complete_before": "Изменить время доставки",
  "/api/1/deliveries/change_delivery_point": "Изменить адрес доставки",
  "/api/1/deliveries/change_service_type": "Изменить тип доставки",
  "/api/1/deliveries/change_payments": "Заменить оплаты заказа",
  "/api/1/deliveries/change_comment": "Изменить комментарий к заказу",
  "/api/1/deliveries/print_delivery_bill": "Напечатать счёт доставки",
  "/api/1/deliveries/confirm": "Подтвердить заказ",
  "/api/1/deliveries/cancel_confirmation": "Отменить подтверждение заказа",
  "/api/1/deliveries/change_operator": "Назначить оператора",
  "/api/1/deliveries/by_id": "Заказы по ID",
  "/api/1/deliveries/by_delivery_date_and_status": "Заказы по датам и статусам",
  "/api/1/deliveries/by_revision": "Заказы, изменённые с ревизии",
  "/api/1/deliveries/by_delivery_date_and_phone": "Заказы по телефону клиента",
  "/api/1/deliveries/by_delivery_date_and_source_key_and_filter": "Поиск заказов с фильтрами",
  "/api/1/deliveries/check_create": "Проверить заказ без создания (check_create)",
  "/api/1/deliveries/order_types": "Типы заказов",
  "/api/1/deliveries/drafts/by_id": "Черновик заказа по ID",
  "/api/1/deliveries/drafts/by_filter": "Черновики заказов по фильтру",
  "/api/1/deliveries/drafts/save": "Сохранить черновик заказа",
  "/api/1/deliveries/drafts/commit": "Отправить черновик на кассу",
  "/api/1/deliveries/drafts/delete": "Удалить черновик",
  "/api/1/order/create": "Создать заказ в зале (создаёт заказ!)",
  "/api/1/order/by_id": "Заказы в зале по ID", "/api/1/order/by_table": "Заказы по столам",
  "/api/1/order/update_payments": "Обновить оплаты", "/api/1/order/add_items": "Добавить позиции в заказ",
  "/api/1/order/close": "Закрыть заказ", "/api/1/order/change_payments": "Заменить оплаты",
  "/api/1/order/init_by_table": "Подтянуть заказы кассы по столам", "/api/1/order/init_by_posOrder": "Подтянуть заказы кассы по ID кассы",
  "/api/1/order/add_customer": "Добавить гостя в заказ",
  "/api/1/combo": "Список комбо", "/api/1/combo/calculate": "Рассчитать цену комбо",
  "/api/1/loyalty/iiko/customer/info": "Найти клиента (iikoCard)",
  "/api/1/loyalty/iiko/calculate": "Рассчитать скидки по чеку",
  "/api/1/loyalty/iiko/manual_condition": "Ручные условия акций",
  "/api/1/loyalty/iiko/customer_category": "Категории клиентов",
  "/api/1/loyalty/iiko/customer/create_or_update": "Создать или обновить клиента",
  "/api/1/loyalty/iiko/customer_category/add": "Добавить клиенту категорию",
  "/api/1/loyalty/iiko/customer_category/remove": "Убрать у клиента категорию",
  "/api/1/loyalty/iiko/message/send_sms": "Отправить SMS клиенту",
  "/api/1/loyalty/iiko/message/send_email": "Отправить e-mail клиенту",
  "/api/1/loyalty/iiko/program": "Программы лояльности",
  "/api/1/loyalty/iiko/customer/program/add": "Подключить клиента к программе",
  "/api/1/loyalty/iiko/customer/card/add": "Привязать карту к клиенту",
  "/api/1/loyalty/iiko/customer/card/remove": "Отвязать карту от клиента",
  "/api/1/loyalty/iiko/customer/wallet/hold": "Заморозить сумму на кошельке",
  "/api/1/loyalty/iiko/customer/wallet/cancel_hold": "Отменить заморозку суммы",
  "/api/1/loyalty/iiko/customer/wallet/topup": "Пополнить кошелёк",
  "/api/1/loyalty/iiko/customer/wallet/chargeoff": "Списать с кошелька",
  "/api/1/loyalty/iiko/coupons/info": "Информация о купоне",
  "/api/1/loyalty/iiko/coupons/series": "Серии купонов",
  "/api/1/loyalty/iiko/coupons/by_series": "Неактивированные купоны серии",
  "/api/1/nomenclature": "Номенклатура (меню, товары, группы)",
  "/api/2/menu": "Внешние меню и ценовые категории",
  "/api/2/menu/by_id": "Внешнее меню по ID (товары с ценами)",
  "/api/1/delivery_restrictions": "Ограничения доставки",
  "/api/1/delivery_restrictions/update": "Изменить ограничения доставки",
  "/api/1/delivery_restrictions/allowed": "Подходящие терминалы для адреса",
  "/api/2/delivery_restrictions": "Ограничения доставки (v2)",
  "/api/2/delivery_restrictions/allowed": "Подходящие терминалы для адреса (v2)",
  "/api/1/organizations": "Организации",
  "/api/1/reserve/available_organizations": "Организации, где доступны резервы",
  "/api/1/reserve/available_terminal_groups": "Терминалы, где доступны резервы",
  "/api/1/reserve/available_restaurant_sections": "Залы и столы для резервов",
  "/api/1/reserve/restaurant_sections_workload": "Загрузка залов (резервы и банкеты)",
  "/api/1/reserve/create": "Создать резерв или банкет",
  "/api/1/reserve/status_by_id": "Статусы резервов по ID",
  "/api/1/discounts": "Скидки и надбавки",
  "/api/1/employees/couriers/locations/by_time_offset": "История координат курьеров",
  "/api/1/employees/couriers": "Курьеры",
  "/api/1/employees/couriers/by_role": "Курьеры с проверкой роли",
  "/api/1/employees/couriers/active_location/by_terminal": "Активные курьеры терминала",
  "/api/1/employees/couriers/active_location": "Активные курьеры",
  "/api/1/employees/info": "Информация о сотруднике",
  "/api/1/employees/shift/clockin": "Открыть смену сотрудника",
  "/api/1/employees/shift/clockout": "Закрыть смену сотрудника",
  "/api/1/employees/shift/is_open": "Открыта ли смена сотрудника",
  "/api/1/cancel_causes": "Причины отмены", "/api/1/payment_types": "Типы оплат",
  "/api/1/removal_types": "Причины удаления", "/api/1/tips_types": "Типы чаевых",
  "/api/1/marketing_sources": "Источники заказов",
  "/api/1/commands/status": "Статус команды (по correlationId)",
  "/api/1/stop_lists": "Стоп-листы",
  "/api/1/terminal_groups": "Группы терминалов",
  "/api/1/terminal_groups/is_alive": "Терминал на связи?",
  "/api/1/terminal_groups/awake": "Разбудить терминалы",
  "/api/1/notifications/send": "Отправить уведомление на кассу",
}

// Готовые тела для основных методов (вместо автогенерации по спецификации)
const customer = { type: "one-time", name: "Тест СПРТ" }
const itemProduct = { type: "Product", productId: "<<productId>>", amount: 1, price: "__PRICE__" }
const cashPayment = { paymentTypeKind: "<<paymentTypeKind>>", sum: "__PRICE__", paymentTypeId: "<<paymentTypeId>>", isProcessedExternally: false }
const CURATED: Record<string, { body?: any; info: string }> = {
  "/api/1/deliveries/check_create": {
    info: "Проверяет, примет ли iiko такой заказ, но заказ НЕ создаёт. Безопасно для проб. Самовывоз (DeliveryByClient), одна позиция и оплата наличными: товар, оплата и организация подставляются сами.",
    body: {
      organizationId: "<<organizationId>>", terminalGroupId: "<<terminalGroupId>>",
      createOrderSettings: { transportToFrontTimeout: 60 },
      order: { externalNumber: "<<orderNumber>>", completeBefore: "<<nowPlus1h>>", phone: "+79990000000", orderServiceType: "DeliveryByClient",
        comment: "Проверка из СПРТ API", customer, guests: { count: 1, splitBetweenPersons: false }, items: [itemProduct], payments: [cashPayment] },
    },
  },
  "/api/1/deliveries/create": {
    info: "СОЗДАЁТ РЕАЛЬНЫЙ ЗАКАЗ на кассе организации. Для проб используйте «Проверить заказ без создания». Самовывоз, одна позиция, оплата наличными; id заказа и correlationId сохранятся в окружении (orderId, correlationId), дальше можно сразу вызывать «Заказы по ID» и «Статус команды».",
    body: {
      organizationId: "<<organizationId>>", terminalGroupId: "<<terminalGroupId>>",
      createOrderSettings: { transportToFrontTimeout: 60 },
      order: { externalNumber: "<<orderNumber>>", completeBefore: "<<nowPlus1h>>", phone: "+79990000000", orderServiceType: "DeliveryByClient",
        comment: "Тестовый заказ СПРТ", customer, guests: { count: 1, splitBetweenPersons: false }, items: [itemProduct], payments: [cashPayment] },
    },
  },
  "/api/1/order/create": {
    info: "СОЗДАЁТ РЕАЛЬНЫЙ ЗАКАЗ за столом. Стол, терминал, товар и организация подставляются сами. id заказа и correlationId сохранятся в окружении.",
    body: {
      organizationId: "<<organizationId>>", terminalGroupId: "<<terminalGroupId>>",
      order: { tableIds: ["<<tableId>>"], customer, guests: { count: 1, splitBetweenPersons: false }, items: [{ type: "Product", productId: "<<productId>>", amount: 1 }] },
      createOrderSettings: { transportToFrontTimeout: 60 },
    },
  },
  "/api/1/deliveries/by_id": { info: "Заказы по ID. orderId берётся из окружения (после создания заказа или любого списка заказов).", body: { organizationId: "<<organizationId>>", orderIds: ["<<orderId>>"] } },
  "/api/1/deliveries/by_delivery_date_and_status": {
    info: "Заказы за сегодня по всем статусам. Подставьте свои даты (формат yyyy-MM-dd HH:mm:ss.fff) или оставьте <<todayStart>> / <<todayEnd>> / <<weekAgoStart>>. Первый найденный заказ запомнится как orderId.",
    body: { organizationIds: ["<<organizationId>>"], deliveryDateFrom: "<<todayStart>>", deliveryDateTo: "<<todayEnd>>",
      statuses: ["Unconfirmed", "WaitCooking", "ReadyForCooking", "CookingStarted", "CookingCompleted", "Waiting", "OnWay", "Delivered", "Closed", "Cancelled"] },
  },
  "/api/1/loyalty/iiko/customer/info": { info: "Поиск клиента iikoCard. type: phone | cardNumber | cardTrack | email | id. Найденный клиент запомнится как customerId.", body: { phone: "+79990000000", type: "phone", organizationId: "<<organizationId>>" } },
  "/api/1/loyalty/iiko/customer/create_or_update": { info: "Создаёт клиента или обновляет по телефону. id клиента запомнится как customerId.", body: { phone: "+79990000000", name: "Тест СПРТ", birthday: "2000-01-01 00:00:00.000", organizationId: "<<organizationId>>" } },
  "/api/1/loyalty/iiko/message/send_sms": { info: "Отправляет SMS клиенту (платная услуга iiko).", body: { phone: "+79990000000", text: "Тест СПРТ", organizationId: "<<organizationId>>" } },
  "/api/1/commands/status": { info: "Статус асинхронной команды iiko (создание заказа и т. п.). correlationId берётся из последнего созданного заказа.", body: { organizationId: "<<organizationId>>", correlationId: "<<correlationId>>" } },
  "/api/1/nomenclature": { info: "Всё меню организации: группы, товары, размеры, цены. Ответ большой; первый товар запомнится как productId.", body: { organizationId: "<<organizationId>>", startRevision: 0 } },
  "/api/1/terminal_groups": { info: "Группы терминалов организации. Первый терминал запомнится как terminalGroupId.", body: { organizationIds: ["<<organizationId>>"], includeDisabled: false } },
  "/api/1/organizations": { info: "Организации, доступные вашему apiLogin. Первая запомнится как organizationId, список сохранится в organizationsList (если организаций несколько, впишите нужный organizationId в окружении).", body: { returnAdditionalInfo: false, includeDisabled: false } },
}

const eps2 = eps.filter((e) => e.path !== "/api/1/access_token")
const PRICE = "__PRICE__"
const fixPrice = (s: string) => s.replace(new RegExp(`"${PRICE}"`, "g"), "<<productPrice>>")
const newReq = (name: string, method: string, endpoint: string, body: any, description: string) => {
  const r = getDefaultRESTRequest()
  r.name = name
  r.method = method
  r.endpoint = endpoint
  r.auth = { authType: "inherit", authActive: true } as any
  r.headers = [{ key: "Content-Type", value: "application/json", active: true, description: "" }] as any
  if (body !== undefined) r.body = { contentType: "application/json", body: fixPrice(JSON.stringify(body, null, 2)) } as any
  r.description = description
  return r
}
const used = (body: any) => {
  const set = new Set<string>()
  JSON.stringify(body ?? {}).replace(/<<(\w+)>>/g, (_, k) => (set.add(k), ""))
  return [...set].filter((k) => !["baseUrl"].includes(k))
}
const describe = (e: Ep, body: any, ru: string) => {
  const cur = CURATED[e.path]
  const vars = used(body)
  const lines = [cur?.info ?? ru, "", `${e.method} ${e.path}`]
  if (vars.length) lines.push("", "Подставляется само из окружения: " + vars.join(", "))
  if (e.optional.length) lines.push("", "Необязательные поля (можно добавить в тело): " + e.optional.join(", "))
  lines.push("", "Описание в спецификации: " + e.summary.replace(/\s+/g, " ").trim())
  return lines.join("\n")
}

// Доводка автогенерированных тел: позиции, оплаты, лишние пустые блоки
const DROP_KEYS = new Set(["combos", "tips", "discountsInfo", "loyaltyInfo"])
function tidy(x: any, key = ""): any {
  if (Array.isArray(x)) return x.map((i) => tidy(i, key))
  if (x && typeof x === "object") {
    const o: any = {}
    for (const [k, v] of Object.entries(x)) {
      if (DROP_KEYS.has(k)) continue
      o[k] = tidy(v, k)
    }
    if ("amount" in o && o.type === "" && !("productId" in o) && !("sourceId" in o)) { o.type = "Product"; o.productId = "<<productId>>"; o.amount = 1 }
    if ("paymentTypeId" in o && "sum" in o) { o.paymentTypeKind = "<<paymentTypeKind>>"; o.paymentTypeId = "<<paymentTypeId>>"; o.sum = PRICE }
    if (key === "" && "id" in o && o.id === "" && Object.keys(o).includes("organizationId")) o.id = "<<employeeId>>"
    return o
  }
  return x
}

const folders = new Map<string, any[]>()
const byPath = new Map<string, any>()
for (const e of eps2) {
  const ru = NAMES[e.path] ?? e.summary.replace(/\.$/, "")
  const name = e.method === "GET" ? ru + " (GET)" : ru
  const cur = CURATED[e.path]
  const body = cur ? cur.body : tidy(e.body)
  const r = newReq(name, e.method, "<<baseUrl>>" + e.path, e.method === "GET" ? undefined : body, describe(e, body, ru))
  // GET /organizations дублирует POST — оставляем оба
  const key = sectionOf(e.path)
  folders.set(key, [...(folders.get(key) ?? []), r])
  if (e.method === "POST") byPath.set(e.path, { e, body })
}

const mk = (name: string, requests: any[], extra: any = {}) => makeCollection({
  name, folders: [], requests, auth: { authType: "inherit", authActive: true }, headers: [], variables: [],
  description: null, preRequestScript: "", testScript: "", ...extra } as any)

// Токен: теперь получается автоматически, но запрос оставлен для проверки apiLogin
const authReq = (() => {
  const r = getDefaultRESTRequest()
  r.name = "Получить токен вручную (обычно не нужно)"
  r.method = "POST"
  r.endpoint = "<<baseUrl>>/api/1/access_token"
  r.auth = { authType: "none", authActive: true } as any
  r.headers = [{ key: "Content-Type", value: "application/json", active: true, description: "" }] as any
  r.body = { contentType: "application/json", body: JSON.stringify({ apiLogin: "<<apiLogin>>" }, null, 2) } as any
  r.description = "Токен получается и обновляется автоматически перед любым запросом коллекции, нужен только заполненный apiLogin в окружении. Этот запрос полезен, чтобы проверить, что apiLogin рабочий."
  return r
})()

// Быстрый старт: самые частые запросы в порядке использования
const QUICK: string[] = [
  "/api/1/organizations", "/api/1/terminal_groups", "/api/1/nomenclature", "/api/1/stop_lists", "/api/1/payment_types",
  "/api/1/deliveries/order_types", "/api/1/deliveries/by_delivery_date_and_status", "/api/1/deliveries/check_create",
  "/api/1/commands/status", "/api/1/terminal_groups/is_alive",
]
const quickReqs = QUICK.map((p) => {
  const x = byPath.get(p)!
  const ru = NAMES[p] ?? x.e.summary
  return newReq(ru, "POST", "<<baseUrl>>" + p, x.body, describe(x.e, x.body, ru))
})

const entries = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))
const sections = entries.map(([n, reqs]) => mk(n, reqs))
const quick = mk("⚡ Быстрый старт", quickReqs)
const authFolder = mk("Авторизация", [authReq])
const root = mk("iiko Cloud API (СПРТ)", [], {
  folders: [quick, authFolder, ...sections],
  auth: { authType: "bearer", authActive: true, token: "<<token>>" },
  preRequestScript: readScript("pre-request.js"),
  testScript: readScript("post-request.js"),
  description: [
    "Коллекция методов iiko Cloud API (api-ru.iiko.services) с автоматизацией для СПРТ.",
    "",
    "Что нужно сделать один раз: выбрать окружение «iiko Cloud API» (справа вверху) и вписать в нём apiLogin.",
    "",
    "Дальше всё само:",
    "• токен получается и обновляется перед каждым запросом;",
    "• organizationId, terminalGroupId, productId, paymentTypeId, tableId и другие ID подставляются в тело запроса автоматически;",
    "• orderId, correlationId, customerId запоминаются из ответов, и следующие запросы используют их;",
    "• даты можно писать как <<todayStart>>, <<todayEnd>>, <<weekAgoStart>>, <<now>>, <<nowPlus1h>>; <<guid>> и <<orderNumber>> дают новый GUID и номер заказа;",
    "• ошибка iiko (errorDescription) показывается во вкладке «Тесты»; просроченный токен обновляется сам.",
    "",
    "Начните с папки «⚡ Быстрый старт». Методы, помеченные «(создаёт заказ!)», создают реальные заказы на кассе.",
    "",
    "Справка по методам: https://api-ru.iiko.services/docs",
  ].join("\n"),
})
const parsed = HoppCollection.safeParse(root)
if (parsed.type !== "ok") { console.error("INVALID", JSON.stringify(parsed).slice(0, 500)); process.exit(1) }

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, "iiko-cloud-api.collection.json"), JSON.stringify(root, null, 2))
const v = (key: string, initial = "", secret = false) => ({ key, initialValue: initial, currentValue: initial, secret })
const env = {
  v: 2, id: "iiko-cloud-api", name: "iiko Cloud API",
  variables: [
    v("baseUrl", "https://api-ru.iiko.services"),
    v("apiLogin", "", true), // единственное, что нужно заполнить вручную
    v("token", "", true), v("tokenTime"),
    v("organizationId"), v("organizationName"), v("organizationsList"),
    v("terminalGroupId"), v("terminalGroupName"),
    v("orderId"), v("correlationId"), v("customerId"), v("employeeId"),
    v("tableId"), v("restaurantSectionId"), v("externalMenuId"), v("priceCategoryId"), v("cityId"),
    v("productId"), v("productName"), v("productPrice"), v("paymentTypeId"), v("paymentTypeKind"), v("orderTypeId"),
    v("todayStart"), v("todayEnd"), v("weekAgoStart"), v("now"), v("nowPlus1h"), v("guid"), v("orderNumber"),
  ],
}
fs.writeFileSync(path.join(outDir, "iiko-cloud-api.environment.json"), JSON.stringify(env, null, 2))
console.log("endpoints:", eps.length, "folders:", entries.map(([n, r]) => `${n}(${r.length})`).join(", "))

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

function sample(t: ts.Type, depth = 0, seen: Set<ts.Type> = new Set(), hint = ""): any {
  const parts = strip(t)
  if (!parts.length) return null
  if (parts.length > 1) {
    if (parts.every((p) => p.isStringLiteral())) return (parts[0] as ts.StringLiteralType).value
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
    return [sample(el, depth + 1, seen)]
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
      if (optional && !tags.example && !(isStruct && depth <= 1)) continue
      out[prop.name] = tags.example !== undefined && tags.example !== ""
        ? parseExample(tags.example, pt)
        : sample(pt, depth + 1, s2)
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
const authReq = (() => {
  const r = getDefaultRESTRequest()
  r.name = "Получить токен (access_token)"
  r.method = "POST"
  r.endpoint = "<<baseUrl>>/api/1/access_token"
  r.auth = { authType: "none", authActive: true } as any
  r.headers = [{ key: "Content-Type", value: "application/json", active: true, description: "" }] as any
  r.body = { contentType: "application/json", body: JSON.stringify({ apiLogin: "<<apiLogin>>" }, null, 2) } as any
  r.testScript = `// Сохраняем токен в окружение: он подставится во все запросы коллекции
pw.env.set("token", pw.response.body.token)
pw.test("Токен получен", () => { pw.expect(pw.response.body.token).toBeType("string") })`
  r.description = "Сначала выберите окружение «iiko Cloud API» и впишите свой apiLogin. Токен живёт около часа."
  return r
})()

const folders = new Map<string, any[]>()
for (const e of eps) {
  if (e.path === "/api/1/access_token") continue
  const r = getDefaultRESTRequest()
  r.name = e.summary.replace(/\.$/, "")
  r.method = e.method
  r.endpoint = "<<baseUrl>>" + e.path
  r.auth = { authType: "inherit", authActive: true } as any
  r.headers = [{ key: "Content-Type", value: "application/json", active: true, description: "" }] as any
  if (e.body !== undefined) {
    r.body = { contentType: "application/json", body: JSON.stringify(e.body, null, 2) } as any
  }
  r.description = `${e.method} ${e.path}` + (e.optional.length ? `\n\nНеобязательные поля: ${e.optional.join(", ")}` : "")
  const key = sectionOf(e.path)
  folders.set(key, [...(folders.get(key) ?? []), r])
}
const mk = (name: string, requests: any[], extra: any = {}) => makeCollection({
  name, folders: [], requests, auth: { authType: "inherit", authActive: true }, headers: [], variables: [],
  description: null, preRequestScript: "", testScript: "", ...extra } as any)

const authFolder = mk("Авторизация", [authReq])
const entries = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))
const sections = entries.map(([n, reqs]) => mk(n, reqs))
const root = mk("iiko Cloud API (СПРТ)", [], {
  folders: [authFolder, ...sections],
  auth: { authType: "bearer", authActive: true, token: "<<token>>" },
  description: "Коллекция методов iiko Cloud API (api-ru.iiko.services). Выберите окружение «iiko Cloud API», впишите apiLogin и выполните «Получить токен»: он подставится во все остальные запросы.",
})
const parsed = HoppCollection.safeParse(root)
if (parsed.type !== "ok") { console.error("INVALID", JSON.stringify(parsed).slice(0, 500)); process.exit(1) }

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, "iiko-cloud-api.collection.json"), JSON.stringify(root, null, 2))
const env = {
  v: 2, id: "iiko-cloud-api", name: "iiko Cloud API",
  variables: [
    { key: "baseUrl", initialValue: "https://api-ru.iiko.services", currentValue: "https://api-ru.iiko.services", secret: false },
    { key: "apiLogin", initialValue: "", currentValue: "", secret: true },
    { key: "token", initialValue: "", currentValue: "", secret: true },
    { key: "organizationId", initialValue: "", currentValue: "", secret: false },
    { key: "terminalGroupId", initialValue: "", currentValue: "", secret: false },
  ],
}
fs.writeFileSync(path.join(outDir, "iiko-cloud-api.environment.json"), JSON.stringify(env, null, 2))
console.log("endpoints:", eps.length, "folders:", entries.map(([n, r]) => `${n}(${r.length})`).join(", "))

// Готовые решения заданий. Подгружается только для автора тренажёра (см. ADMIN в app.js),
// остальным сотрудникам кнопка «Показать пример» не показывается.
window.buildExamples = function () {
  var E = SIM.env, B = SIM.BASE;
  var CT = "Content-Type: application/json", AUTH = CT + "\nAuthorization: Bearer " + E.token;
  var j = function (o) { return JSON.stringify(o, null, 2); };
  var order = { phone: E.phone, items: E.need.map(function (n) { return { type: "Product", productId: n.product.id, amount: n.amount }; }) };
  if (E.extraKind === "comment") order.comment = E.extraValue; else order.customer = { name: E.extraValue };
  return {
    l1: { method: "POST", url: B + "/api/v2/access_token", headers: CT, body: j({ apiKey: E.apiKey, clientSecret: E.clientSecret }) },
    l2: { method: "POST", url: B + "/api/1/organizations", headers: AUTH, body: "{}" },
    l3: { method: "POST", url: B + "/api/1/terminal_groups", headers: AUTH, body: j({ organizationIds: [E.org.id] }) },
    l4: { method: "POST", url: B + "/api/1/nomenclature", headers: AUTH, body: j({ organizationId: E.org.id }) },
    l5: { method: "POST", url: B + "/api/1/deliveries/create", headers: AUTH, body: j({ organizationId: E.org.id, terminalGroupId: E.tg.id, order: order }) },
    l6: { method: "POST", url: B + "/api/1/commands/status", headers: AUTH, body: j({ organizationId: E.org.id, correlationId: SIM.lastCorrelationId() || "сначала выполните задание 5" }) }
  };
};

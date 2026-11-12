// Учебный «сервер iiko»: отвечает так же, как iiko Cloud API, но данные вымышленные.
// Данные персональные: всё (ключи, организации, меню, условия заказа) строится из seed сотрудника,
// поэтому у каждого свои значения, а у одного и того же человека они всегда одинаковые.
(function () {
  var BASE = "https://api-ru.iiko.services";

  // ---------- детерминированный генератор по seed ----------
  function hashSeed(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }
  function rng(seed) {
    var a = hashSeed(seed);
    return function () {
      a[0] >>>= 0; a[1] >>>= 0; a[2] >>>= 0; a[3] >>>= 0;
      var t = (a[0] + a[1]) | 0; a[0] = a[1] ^ (a[1] >>> 9); a[1] = (a[2] + (a[2] << 3)) | 0;
      a[2] = (a[2] << 21) | (a[2] >>> 11); a[3] = (a[3] + 1) | 0; t = (t + a[3]) | 0; a[2] = (a[2] + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  var ORG_NAMES = ["Burger Lab", "Pizza Roma", "Суши Волна", "Кофейня «Утро»", "Шаурма Хаус", "Гриль & Пиво", "Хинкальная «Тбилиси»", "Блинная «Масленица»", "Рамен-бар «Токио»"];
  var TG_NAMES = ["Касса Центр", "Касса Север", "Касса Юг", "Касса Восток", "Касса Запад"];
  var STREETS = ["ул. Ленинградская", "ул. Молодогвардейская", "пр. Ленина", "ул. Победы", "ул. Советской Армии", "ул. Гагарина", "пр. Кирова"];
  var PRODUCT_POOL = [
    ["Бургер Классик", 350], ["Чизбургер", 390], ["Картофель фри", 150], ["Наггетсы 6 шт.", 220], ["Лимонад Лайм", 120],
    ["Кола 0,5", 110], ["Салат Цезарь", 290], ["Пицца Маргарита", 450], ["Ролл Филадельфия", 480], ["Суп дня", 260],
    ["Капучино", 180], ["Чизкейк", 240], ["Шаурма классическая", 320], ["Морс клюквенный", 130], ["Паста Карбонара", 410]
  ];

  function build(seedStr, label) {
    var R = rng("sprt-learn|" + seedStr);
    var ri = function (n) { return Math.floor(R() * n); };
    var hex = function (n) { var s = ""; while (s.length < n) s += ri(16).toString(16); return s; };
    var uuid = function () { return hex(8) + "-" + hex(4) + "-4" + hex(3) + "-8" + hex(3) + "-" + hex(12); };
    var shuffle = function (arr) { arr = arr.slice(); for (var i = arr.length - 1; i > 0; i--) { var j = ri(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
    var b36 = function (n) { var s = "", c = "abcdefghijklmnopqrstuvwxyz0123456789"; while (s.length < n) s += c[ri(c.length)]; return s; };

    var E = { label: label || "" };
    E.apiKey = hex(8) + hex(8) + hex(8);
    E.clientSecret = b36(32);
    E.token = "eyJhbGciOiJIUzI1NiJ9." + b36(36) + "." + b36(10);

    // организации: одна «ваша» + две чужие, порядок в ответе перемешан
    var names = shuffle(ORG_NAMES).slice(0, 3);
    var orgs = names.map(function (n, i) { return { id: uuid(), name: n, code: "ORG-" + (100 + ri(900)), mine: i === 0 }; });
    E.org = orgs[0];
    E.orgs = shuffle(orgs);

    // терминальные группы: у каждой организации по две, у вашей нужна конкретная
    var tgNames = shuffle(TG_NAMES);
    E.groups = {};
    orgs.forEach(function (o, k) {
      E.groups[o.id] = [0, 1].map(function (j) {
        return { id: uuid(), organizationId: o.id, name: tgNames[(k * 2 + j) % tgNames.length], address: "г. Самара, " + STREETS[ri(STREETS.length)] + ", " + (1 + ri(150)) };
      });
    });
    E.tg = E.groups[E.org.id][ri(2)];

    // меню вашей организации
    E.products = shuffle(PRODUCT_POOL).slice(0, 7).map(function (p, i) {
      return { id: uuid(), name: p[0], code: "P-" + (100 + i * 7 + ri(6)), price: p[1] };
    });
    var req = shuffle(E.products).slice(0, 2);
    E.need = [
      { product: req[0], amount: 1 + ri(3) },
      { product: req[1], amount: 1 + ri(3) }
    ];
    E.phone = "+79" + (100000000 + ri(899999999)).toString().slice(0, 9);
    E.code = String(1000 + ri(9000));
    E.extraKind = ri(2) === 0 ? "comment" : "customer";
    E.extraValue = E.extraKind === "comment" ? "Обучение SPRT " + E.code : "Тест " + E.code;
    E.polls = 2 + ri(2); // сколько раз нужно спросить статус, пока придёт Success
    return E;
  }

  var E = null, SK = "sprt_learn_sim";
  function load() { try { return JSON.parse(localStorage.getItem(SK) || "{}"); } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(SK, JSON.stringify(s)); } catch (e) {} }
  function uid() { return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); }

  function err(status, error, description, hint) {
    return { status: status, hint: hint || "", body: { correlationId: uid(), errorDescription: description, error: error } };
  }
  function ok(task, body) { body = body || {}; body.correlationId = body.correlationId || uid(); return { status: 200, body: body, task: task }; }

  function digits(s) { return String(s || "").replace(/\D/g, ""); }

  // req: {method, url, headers: "Имя: значение" по строкам, body: строка}
  function send(req) {
    var method = String(req.method || "").toUpperCase();
    var url = String(req.url || "").trim();
    if (!url) return err(400, "BadRequest", "URL не указан", "Впишите адрес запроса: адрес сервера плюс путь метода.");
    if (url.indexOf(BASE) !== 0)
      return err(400, "BadRequest", "Неверный адрес сервера", "Адрес должен начинаться с " + BASE + ". Дальше идёт путь метода, например /api/1/organizations.");
    var path = url.slice(BASE.length).split("?")[0].replace(/\/+$/, "");

    var headers = {};
    String(req.headers || "").split(/\r?\n/).forEach(function (l) {
      var i = l.indexOf(":"); if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    });
    var raw = String(req.body || "").trim(), body = {}, badJson = null;
    if (raw) { try { body = JSON.parse(raw); } catch (e) { badJson = e.message; } }
    if (body === null || typeof body !== "object" || Array.isArray(body)) { if (badJson === null) badJson = "ожидался объект { … }"; body = {}; }

    var known = ["/api/v2/access_token", "/api/1/access_token", "/api/1/organizations", "/api/1/terminal_groups", "/api/1/nomenclature", "/api/1/deliveries/create", "/api/1/commands/status"];
    if (known.indexOf(path) < 0)
      return err(404, "NotFound", "Метод не найден: " + path, "Проверьте путь метода. Он указан в описании задания.");
    if (method !== "POST")
      return err(405, "MethodNotAllowed", "Метод HTTP " + method + " не поддерживается", "Все методы iiko Cloud API в этих заданиях вызываются как POST.");
    if (!/application\/json/i.test(headers["content-type"] || ""))
      return err(415, "UnsupportedMediaType", "Не указан Content-Type: application/json", "Добавьте заголовок Content-Type: application/json: так сервер понимает, что тело это JSON.");
    if (badJson !== null)
      return err(400, "BadRequest", "Тело запроса не является корректным JSON: " + badJson, "Проверьте скобки, запятые и двойные кавычки (одинарные кавычки в JSON недопустимы).");

    if (path === "/api/1/access_token")
      return err(403, "Forbidden", "Please use /api/v2/access_token", "Старый метод /api/1/access_token (с apiLogin) больше не работает. Нужен /api/v2/access_token с ключом и Client Secret.");

    if (path === "/api/v2/access_token") {
      if (body.apiKey !== E.apiKey || body.clientSecret !== E.clientSecret)
        return err(401, "AuthorizationError", "Неверный apiKey или clientSecret", "В теле нужны два поля: apiKey и clientSecret. Ваши значения указаны в задании, копируйте их без пробелов.");
      return ok("l1", { token: E.token });
    }

    // дальше нужен токен
    if (headers["authorization"] !== "Bearer " + E.token)
      return err(401, "AuthorizationError", "Authorization is has been denied for this request.", "Добавьте заголовок Authorization: Bearer <токен> (слово Bearer, пробел и ваш токен из задания 1).");

    var isMine = function (id) { return id === E.org.id; };
    var orgById = function (id) { return E.orgs.filter(function (o) { return o.id === id; })[0]; };

    if (path === "/api/1/organizations")
      return ok("l2", { organizations: E.orgs.map(function (o) { return { responseType: "Simple", id: o.id, name: o.name, code: o.code, country: "Russia" }; }) });

    if (path === "/api/1/terminal_groups") {
      var ids = body.organizationIds;
      if (!Array.isArray(ids) || !ids.length)
        return err(400, "BadRequest", "Поле organizationIds обязательно", 'В теле нужен массив: {"organizationIds": ["id организации"]}.');
      var unknown = ids.filter(function (x) { return !orgById(x); });
      if (unknown.length) return err(400, "BadRequest", "Организация не найдена: " + unknown[0], "Скопируйте id организации из ответа на запрос организаций точно, без лишних пробелов.");
      var groups = ids.map(function (id) { return { organizationId: id, items: E.groups[id] }; });
      var r3 = ok(ids.indexOf(E.org.id) >= 0 ? "l3" : null, { terminalGroups: groups, terminalGroupsInSleep: [] });
      if (ids.indexOf(E.org.id) < 0) r3.hint = "Запрос выполнен, но не для вашей организации «" + E.org.name + "». Нужен её id.";
      return r3;
    }

    if (path === "/api/1/nomenclature") {
      if (!body.organizationId) return err(400, "BadRequest", "Поле organizationId обязательно", 'Тело: {"organizationId": "id организации"}.');
      if (!orgById(body.organizationId)) return err(400, "BadRequest", "Организация не найдена", "Скопируйте id организации из ответа на запрос организаций.");
      if (!isMine(body.organizationId)) { var rn = ok(null, { groups: [], productCategories: [], products: [], sizes: [], revision: 1 }); rn.hint = "У этой организации пустое меню. Вам нужна «" + E.org.name + "»."; return rn; }
      return ok("l4", { groups: [{ id: uid(), name: "Основное меню" }], productCategories: [{ id: uid(), name: "Блюда" }],
        products: E.products.map(function (p) { return { id: p.id, name: p.name, code: p.code, type: "Dish", sizePrices: [{ sizeId: null, price: { currentPrice: p.price, isIncludedInMenu: true } }] }; }), sizes: [], revision: 12345 });
    }

    if (path === "/api/1/deliveries/create") {
      if (!orgById(body.organizationId)) return err(400, "BadRequest", "organizationId не указан или неверен", "Нужен id вашей организации (задание 2).");
      if (!isMine(body.organizationId)) return err(400, "BadRequest", "Нет доступа к организации", "Заказ создаётся в вашей организации «" + E.org.name + "».");
      var tgAll = E.groups[E.org.id].filter(function (g) { return g.id === body.terminalGroupId; })[0];
      if (!tgAll) return err(400, "BadRequest", "terminalGroupId не указан или неверен", "Нужен id терминальной группы из задания 3.");
      var o = body.order;
      if (!o || typeof o !== "object") return err(400, "BadRequest", "Не передан объект order", "Нужен объект order с телефоном и позициями.");
      if (!o.phone || !/^\+?\d{10,15}$/.test(String(o.phone).replace(/[\s()-]/g, ""))) return err(400, "BadRequest", "Телефон указан неверно", "В order.phone нужен номер из цифр.");
      if (!Array.isArray(o.items) || !o.items.length) return err(400, "BadRequest", "В заказе нет позиций", "order.items должен быть массивом позиций.");
      var got = {};
      for (var i = 0; i < o.items.length; i++) {
        var it = o.items[i] || {};
        var prod = E.products.filter(function (p) { return p.id === it.productId; })[0];
        if (!prod) return err(400, "BadRequest", "Товар не найден: " + it.productId, "productId берите из ответа «Номенклатура» (задание 4).");
        if (!(Number(it.amount) > 0)) return err(400, "BadRequest", "Количество должно быть больше нуля", "У позиции нужно поле amount больше нуля.");
        if (it.type !== "Product") return err(400, "BadRequest", 'Не указан type "Product"', 'У каждой позиции нужно поле "type" со значением "Product".');
        got[prod.id] = (got[prod.id] || 0) + Number(it.amount);
      }
      // заказ технически верный; сверяем с условиями вашего задания
      var problems = [];
      if (tgAll.id !== E.tg.id) problems.push("касса");
      if (digits(o.phone) !== digits(E.phone)) problems.push("телефон");
      var itemsOk = Object.keys(got).length === E.need.length && E.need.every(function (n) { return got[n.product.id] === n.amount; });
      if (!itemsOk) problems.push("состав заказа (товары и количество)");
      var extraOk = E.extraKind === "comment" ? o.comment === E.extraValue : !!(o.customer && o.customer.name === E.extraValue);
      if (!extraOk) problems.push(E.extraKind === "comment" ? "комментарий" : "имя клиента");
      var sum = Object.keys(got).reduce(function (a, id) { return a + got[id] * E.products.filter(function (p) { return p.id === id; })[0].price; }, 0);
      var corr = uid();
      var resp = { correlationId: corr, orderInfo: { id: uid(), organizationId: E.org.id, timestamp: Date.now(), creationStatus: "InProgress", isDeleted: false } };
      if (problems.length) {
        var r5 = ok(null, resp);
        r5.hint = "Сервер принял заказ, но он не совпадает с заданием. Сверьте: " + problems.join(", ") + ".";
        return r5;
      }
      var st = load(); st.correlationId = corr; st.polls = 0; st.sum = sum; save(st);
      return ok("l5", resp);
    }

    if (path === "/api/1/commands/status") {
      var s = load();
      if (!isMine(body.organizationId)) return err(400, "BadRequest", "organizationId не указан или неверен", "Нужен id вашей организации.");
      if (typeof body.correlationId === "string" && /[<>]/.test(body.correlationId))
        return err(400, "BadRequest", "Команда с таким correlationId не найдена", "В значении остались угловые скобки < >. Оставьте внутри кавычек только сам id.");
      if (!s.correlationId)
        return err(400, "BadRequest", "Команда с таким correlationId не найдена", "Сначала выполните задание 5 (создайте заказ), в ответе придёт correlationId.");
      if (!body.correlationId || body.correlationId !== s.correlationId)
        return err(400, "BadRequest", "Команда с таким correlationId не найдена", "Возьмите correlationId из ответа на создание заказа (задание 5), последнего созданного.");
      s.polls = (s.polls || 0) + 1; save(s);
      if (s.polls < E.polls) {
        var r = ok(null, { state: "InProgress", exception: null });
        r.hint = "Команда ещё выполняется. Так и должно быть: повторите запрос через пару секунд.";
        return r;
      }
      return ok("l6", { state: "Success", exception: null });
    }
    return err(404, "NotFound", "Метод не найден", "");
  }

  window.SIM = {
    BASE: BASE,
    send: send,
    get env() { return E; },
    init: function (seed, label) { E = build(String(seed).toLowerCase(), label); SK = "sprt_learn_sim:" + String(seed).toLowerCase(); return E; },
    lastCorrelationId: function () { return load().correlationId || ""; },
    reset: function () { try { localStorage.removeItem(SK); } catch (e) {} }
  };
})();

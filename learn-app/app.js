(function () {
  var app = document.getElementById("app"), T = [];

  // Связь с SPRT API (родительское окно). Если страницу открыли отдельно, прогресс хранится локально.
  var bridge = null;
  try { if (parent !== window && parent.__sprtLearn) bridge = parent.__sprtLearn; } catch (e) {}
  var LS = "sprt_learn_progress";
  var local = (function () { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } })();
  var serverState = null, busy = false;
  function progress() { return serverState ? local : (bridge ? (bridge.getProgress() || {}) : local); }
  function adopt(server) {
    serverState = server;
    local = Object.assign({}, server.progress);
    for (var r = 1; r < server.attempt; r++) local['r' + r] = true;
    // Cache for the existing frontend access gate. SQLite remains authoritative.
    // Do not call the old bridge setter: it writes training into PostgreSQL.
    try { localStorage.setItem(LS + ':' + server.uid, JSON.stringify(local)); } catch (_) {}
    if (bridge && bridge.acceptServerProgress) bridge.acceptServerProgress(server.uid, local);
  }
  async function save(kind, lesson, passed) {
    if (!serverState || !window.SPRTTraining) return null;
    var result = await window.SPRTTraining.record(kind, lesson, passed);
    if (result) adopt(result);
    return result;
  }
  function go(path) { if (bridge && bridge.go) bridge.go(path); }

  // Кто работает: берём почту из входа в SPRT API, от неё зависят все персональные данные.
  function whoAmI(cb) {
    var done = false;
    function fin(u) { if (!done) { done = true; cb(u); } }
    try { if (bridge && bridge.getUser) { var bu = bridge.getUser(); if (bu && bu.email) return fin(bu); } } catch (e) {}
    var timer = setTimeout(function () { fin(null); }, 4000);
    try {
      fetch("/backend/graphql", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "query{me{uid email displayName}}" }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { clearTimeout(timer); var m = j && j.data && j.data.me; fin(m && m.email ? { email: m.email, name: m.displayName || "" } : null); })
        .catch(function () { clearTimeout(timer); fin(null); });
    } catch (e) { clearTimeout(timer); fin(null); }
  }
  function guestSeed() {
    try { var g = localStorage.getItem("sprt_learn_guest"); if (!g) { g = "guest-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("sprt_learn_guest", g); } return g; } catch (e) { return "guest-0"; }
  }

  var STATUS = { 200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 415: "Unsupported Media Type" };
  var METHODS = ["POST", "GET", "PUT", "DELETE", "PATCH"];
  var ADMINS = ["m.dementiev@sprt-service.ru", "m.demetiev@sprt-service.ru"]; // только у этих адресов есть кнопка «Показать пример»
  var EX = null;
  var isTrainingAdmin = false;
  var cur = 0, mem = {}, who = "", confirmReset = false, baseSeed = "", baseLabel = "";
  // номер попытки хранится в прогрессе как ключи r1, r2…: после сброса задания генерируются заново
  function attempt() { var p = progress(), n = 0; Object.keys(p).forEach(function (k) { if (/^r\d+$/.test(k) && p[k]) n++; }); return n; }
  function start() {
    var a = attempt();
    SIM.init(a ? baseSeed + "|" + a : baseSeed, baseLabel);
    T = window.buildTasks();
    cur = 0; var p = progress(); for (var i = 0; i < T.length; i++) if (!p[T[i].id]) { cur = i; return; } cur = T.length - 1;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function st(t) { return mem[t.id] || (mem[t.id] = { method: "", url: "", headers: "", body: "", resp: null, verdict: null }); }
  function unlocked(i) { return i === 0 || !!progress()[T[i - 1].id] || !!progress()[T[i].id]; }
  function count() { var p = progress(); return T.filter(function (t) { return p[t.id]; }).length; }

  function render() {
    var p = progress(), n = count(), t = T[cur], s = st(t), done = !!p[t.id];
    var h = '<p><a href="/sprt/settings?learn-app=1" target="_top">Настройки и диагностика</a>' + (isTrainingAdmin ? ' · <a href="/sprt/training?learn-app=1" target="_top">Обучение сотрудников →</a>' : '') + '</p>' + '<h1 class="ttl">Тренажёр: запросы iiko Cloud API</h1>' +
      '<p class="sub">Составьте запрос сами: метод, адрес, заголовки и JSON. Сервер учебный, данные вымышленные, ничего настоящего вы не заденете. Когда пройдёте все задания, откроются остальные разделы.</p>' +
      '<p class="who">Задания персональные: ключи, организация, меню и условия заказа свои у каждого сотрудника. После сброса задания генерируются заново. Вы: <b>' + esc(who) + '</b></p>' +
      '<div class="prog"><div class="bar"><i style="width:' + Math.round(n / T.length * 100) + '%"></i></div><span>Выполнено ' + n + ' из ' + T.length + '</span>' +
      '<button class="small' + (confirmReset ? " warnbtn" : "") + '" data-resetall="1">' + (confirmReset ? "Точно? Нажмите ещё раз" : "Сбросить: пройти заново") + '</button></div>';
    if (n === T.length) {
      h += '<div class="pass"><b>Все задания выполнены, доступ открыт</b>Теперь вам доступны «Яндекс Еда» и остальные функции SPRT API.' +
        '<div class="row"><a href="/" target="_top">Открыть API-клиент</a><button class="' + (confirmReset ? "warnbtn" : "") + '" data-resetall="1">' + (confirmReset ? "Точно? Нажмите ещё раз" : "Пройти заново с новыми заданиями") + '</button></div></div>';
    }
    h += '<div class="layout"><div class="steps">';
    T.forEach(function (x, i) {
      h += '<button class="step' + (i === cur ? " cur" : "") + (p[x.id] ? " done" : "") + (unlocked(i) ? "" : " lock") + '" data-i="' + i + '"' + (unlocked(i) ? "" : " disabled") +
        '><span class="n"><span>' + (i + 1) + '</span></span><span>' + esc(x.title) + '</span></button>';
    });
    h += '</div><div class="card"><h2>' + (cur + 1) + '. ' + esc(t.title) + '</h2><p>' + t.text + '</p>';
    h += '<div class="info">Адрес учебного сервера: <code>' + SIM.BASE + '</code>';
    if (t.data) {
      h += '<table>' + t.data.map(function (d) { return '<tr><td>' + esc(d[0]) + '</td><td><code>' + esc(d[1]) + '</code></td></tr>'; }).join("") + '</table>';
    }
    h += '</div>';
    h += '<div class="form">' +
      '<div class="reqline"><div><label class="lbl">Метод</label><select id="f-method"><option value=""' + (s.method === "" ? " selected" : "") + '>Выберите…</option>' +
      METHODS.map(function (m) { return '<option' + (s.method === m ? " selected" : "") + '>' + m + '</option>'; }).join("") + '</select></div>' +
      '<div><label class="lbl">URL</label><input id="f-url" placeholder="Адрес запроса" value="' + esc(s.url) + '" spellcheck="false"></div></div>' +
      '<div><label class="lbl">Заголовки (по одному в строке: Имя: значение)</label><textarea id="f-headers" rows="3" spellcheck="false">' + esc(s.headers) + '</textarea></div>' +
      '<div><label class="lbl">Тело запроса (JSON)</label><textarea id="f-body" rows="8" spellcheck="false">' + esc(s.body) + '</textarea></div>' +
      '<div class="actions"><button class="primary" data-send="1">Отправить</button><button data-reset="1">Очистить форму</button>' + (EX ? '<button data-example="1">Показать пример</button>' : '') + '</div></div>';
    if (s.resp) {
      var r = s.resp, cls = r.status < 300 ? "s2" : "s4";
      h += '<div class="resp"><span class="badge ' + cls + '">' + r.status + ' ' + (STATUS[r.status] || "") + '</span><span class="sub">Ответ сервера</span><pre>' + esc(JSON.stringify(r.body, null, 2)) + '</pre>';
      if (s.verdict) h += '<div class="verdict ' + s.verdict.kind + '"><b>' + esc(s.verdict.title) + '</b>' + esc(s.verdict.text) + '</div>';
      h += '</div>';
    } else if (s.verdict) {
      h += '<div class="resp"><div class="verdict ' + s.verdict.kind + '"><b>' + esc(s.verdict.title) + '</b>' + esc(s.verdict.text) + '</div></div>';
    }
    if (done && cur < T.length - 1) h += '<div class="nav"><button class="primary" data-next="1">Следующее задание</button></div>';
    h += '</div></div>';
    app.innerHTML = h + '<p id="sprt-training-status" class="sub" role="status"></p>';
    if (window.SPRTTraining) window.SPRTTraining.renderStatus();
  }

  function readForm() {
    var t = T[cur], s = st(t), g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    var m = g("f-method"); if (m !== null) s.method = m;
    var u = g("f-url"); if (u !== null) { s.url = u; s.headers = g("f-headers"); s.body = g("f-body"); }
    return s;
  }

  app.addEventListener("click", async function (e) {
    var b = e.target.closest("button"); if (!b || b.disabled || busy) return;
    var t = T[cur];
    if (!b.dataset.resetall) confirmReset = false;
    if (b.dataset.go) { go(b.dataset.go); return; }
    if (b.dataset.i !== undefined) { readForm(); cur = +b.dataset.i; render(); return; }
    if (b.dataset.next) { readForm(); cur = Math.min(T.length - 1, cur + 1); render(); window.scrollTo(0, 0); return; }
    if (b.dataset.example && EX) { var s0 = st(t), ex = EX()[t.id]; s0.method = ex.method; s0.url = ex.url; s0.headers = ex.headers; s0.body = ex.body; render(); return; }
    if (b.dataset.reset) { delete mem[t.id]; render(); return; }
    if (b.dataset.resetall) {
      if (!confirmReset) { confirmReset = true; render(); return; }
      confirmReset = false;
      busy = true;
      var reset = await save('reset');
      busy = false;
      if (!reset) return;
      SIM.reset();
      mem = {}; start(); render(); window.scrollTo(0, 0); return;
    }
    if (b.dataset.send) {
      var s = readForm();
      if (!s.method) {
        s.resp = null; s.verdict = { kind: "warn", title: "Не выбран метод", text: "Выберите HTTP-метод в списке слева от адреса." };
        render(); return;
      }
      var r = SIM.send(s); s.resp = r;
      busy = true;
      var saved = await save('attempt', t.id, r.status === 200 && r.task === t.id);
      if (saved && r.status === 200 && r.task === t.id) saved = await save('lesson', t.id, true);
      busy = false;
      if (!saved) { render(); return; }
      if (r.status === 200 && r.task === t.id) {
        s.verdict = { kind: "ok", title: "Задание выполнено", text: cur < T.length - 1 ? "Сохраните нужные значения из ответа: они понадобятся дальше." : "Это было последнее задание." };
      } else if (r.status === 200 && r.task) {
        var idx = T.map(function (x) { return x.id; }).indexOf(r.task);
        s.verdict = { kind: "warn", title: "Запрос верный, но это другое задание", text: "Вы вызвали метод из задания " + (idx + 1) + ". Здесь нужен метод из описания выше." };
      } else if (r.status === 200) {
        s.verdict = { kind: "warn", title: "Пока не готово", text: r.hint || "" };
      } else {
        s.verdict = { kind: "warn", title: "Запрос не прошёл", text: r.hint || "Сервер вернул ошибку, прочитайте её в ответе." };
      }
      render();
    }
  });

  app.innerHTML = '<p class="sub">Загружаю ваши задания…</p>';
  whoAmI(async function (u) {
    if (u && window.SPRTTraining) {
      var server = await window.SPRTTraining.init({ progress: Object.assign({}, progress()), attempt: attempt() + 1 });
      if (server) {
        isTrainingAdmin = server.admin === true;
        adopt(server);
      }
    }
    if (!serverState) {
      app.innerHTML = '<p>Не удалось загрузить прогресс. Войдите в SPRT API и обновите страницу.</p><p id="sprt-training-status" role="alert"></p>';
      if (window.SPRTTraining) window.SPRTTraining.renderStatus();
      return;
    }
    var seed, label;
    if (u) { seed = u.email; label = u.name ? u.name + " (" + u.email + ")" : u.email; }
    else { seed = guestSeed(); label = "гость (вход в SPRT API не выполнен)"; }
    who = label; baseSeed = seed; baseLabel = label;
    start();
    if (u && ADMINS.indexOf(String(u.email).toLowerCase()) >= 0) {
      var sc = document.createElement("script"); sc.src = "examples.js?t=" + Date.now();
      sc.onload = function () { EX = window.buildExamples; render(); };
      sc.onerror = function () { render(); };
      document.head.appendChild(sc);
    }
    render();
  });
})();

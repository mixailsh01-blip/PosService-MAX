(function () {
  var L = window.LESSONS;
  var app = document.getElementById("app");

  // Связь с SPRT API (родительское окно). Если страницу открыли отдельно, прогресс хранится локально.
  var bridge = null;
  try { if (parent !== window && parent.__sprtLearn) bridge = parent.__sprtLearn; } catch (e) {}
  var LS = "sprt_learn_progress";
  var local = (function () { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } })();
  function getProgress() { return bridge ? (bridge.getProgress() || {}) : local; }
  function setDone(id, v) {
    if (bridge) bridge.setProgress(id, v);
    else { local[id] = v; try { localStorage.setItem(LS, JSON.stringify(local)); } catch (e) {} }
  }
  function getEnv() { return bridge && bridge.getEnv ? (bridge.getEnv() || {}) : {}; }
  function go(path) { if (bridge && bridge.go) bridge.go(path); }

  var cur = 0;
  var mem = {}; // промежуточное состояние урока: {envOk, quizPick}
  (function pickFirst() { var p = getProgress(); for (var i = 0; i < L.length; i++) if (!p[L[i].id]) { cur = i; return; } cur = L.length - 1; })();

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function doneCount() { var p = getProgress(); return L.filter(function (l) { return p[l.id]; }).length; }
  function state(l) { return mem[l.id] || (mem[l.id] = { envOk: false, pick: null, envMsg: "" }); }

  function lessonReady(l) {
    var s = state(l), p = getProgress();
    if (p[l.id]) return true;
    var envOk = !l.check || s.envOk;
    var quizOk = !l.quiz || s.pick === l.quiz.correct;
    return envOk && quizOk;
  }
  function maybeFinish(l) {
    if (!getProgress()[l.id] && lessonReady(l)) setDone(l.id, true);
  }

  function render() {
    var p = getProgress(), n = doneCount(), l = L[cur], s = state(l), isDone = !!p[l.id];
    var h = '<div class="topbar"><h1 class="ttl">Обучение: iiko Cloud API</h1></div>' +
      '<p class="sub">Пройдите все шесть уроков, и откроются остальные разделы SPRT API.</p>' +
      '<div class="prog"><div class="bar"><i style="width:' + Math.round(n / L.length * 100) + '%"></i></div><span>Пройдено ' + n + ' из ' + L.length + '</span></div>';
    if (n === L.length) {
      h += '<div class="pass"><b>Обучение пройдено, доступ открыт</b>Теперь вам доступны «Яндекс Еда» и остальные функции SPRT API.' +
        '<div class="row"><button class="primary" data-go="/yandex">Открыть «Яндекс Еду»</button><button data-go="/">Открыть REST-клиент</button></div></div>';
    }
    h += '<div class="layout"><div class="steps">';
    L.forEach(function (x, i) {
      h += '<button class="step' + (i === cur ? " cur" : "") + (p[x.id] ? " done" : "") + '" data-i="' + i + '"><span class="n"><span>' + (i + 1) + '</span></span><span>' + esc(x.title) + '</span></button>';
    });
    h += '</div><div class="card"><h2>' + (cur + 1) + '. ' + esc(l.title) + '</h2><p class="goal">' + esc(l.goal) + '</p>' + l.html;
    if (l.task) h += '<div class="task"><b>Практика</b>' + l.task + '</div>';
    if (l.check) {
      h += '<div class="check"><button data-check="1"' + (isDone ? " disabled" : "") + '>Проверить</button><span class="res ' + ((s.envOk || isDone) ? "ok" : (s.envMsg ? "bad" : "")) + '">' +
        (s.envOk || isDone ? "Готово: " + esc(l.check.label) : esc(s.envMsg)) + '</span></div>';
    }
    if (l.quiz) {
      var q = l.quiz, answered = s.pick !== null || isDone;
      h += '<h3>Контрольный вопрос</h3><div class="quiz"><p class="q">' + esc(q.q) + '</p>';
      q.options.forEach(function (o, i) {
        var cls = "opt";
        if (isDone && i === q.correct) cls += " ok";
        else if (s.pick === i) cls += i === q.correct ? " ok" : " bad";
        h += '<button class="' + cls + '" data-opt="' + i + '"' + ((isDone || s.pick === q.correct) ? " disabled" : "") + '>' + esc(o) + '</button>';
      });
      if (s.pick !== null) h += '<p class="expl">' + (s.pick === q.correct ? "Верно. " + esc(q.explain) : "Не совсем. Подумайте ещё и выберите другой вариант.") + '</p>';
      h += '</div>';
    }
    h += '<div class="nav"><button data-prev="1"' + (cur === 0 ? " disabled" : "") + '>Назад</button>' +
      '<button class="primary" data-next="1"' + (cur === L.length - 1 || !(isDone || lessonReady(l)) ? " disabled" : "") + '>Дальше</button></div>';
    h += '</div></div>';
    app.innerHTML = h;
  }

  app.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    var l = L[cur], s = state(l);
    if (t.dataset.i !== undefined) { cur = +t.dataset.i; }
    else if (t.dataset.go) { go(t.dataset.go); return; }
    else if (t.dataset.prev) { cur = Math.max(0, cur - 1); }
    else if (t.dataset.next) { cur = Math.min(L.length - 1, cur + 1); }
    else if (t.dataset.check) {
      var v = String(getEnv()[l.check.env] || "").trim();
      s.envOk = !!v;
      s.envMsg = s.envOk ? "" : "Пока не вижу: заполните окружение «iiko Cloud API», выполните запрос и проверьте снова.";
      maybeFinish(l);
    } else if (t.dataset.opt !== undefined) {
      s.pick = +t.dataset.opt;
      maybeFinish(l);
    }
    render();
  });
  render();
})();

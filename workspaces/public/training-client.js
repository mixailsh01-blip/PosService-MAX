(function () {
  var state = null, queue = Promise.resolve(), error = '', pending = 0;
  function log(kind, values) {
    try {
      var data = JSON.parse(localStorage.getItem('sprt_debug_v2') || '{}');
      if (!data.enabled) return;
      var entry = { at: new Date().toISOString(), uid: state ? state.uid : null, kind: kind };
      ['status','durationMs','done','serverDone','attempt'].forEach(function (key) { if (Number.isFinite(values[key])) entry[key] = values[key]; });
      if (['me','events','recover'].indexOf(values.path) >= 0) entry.path = values.path;
      data.entries = (data.entries || []).concat([entry]).slice(-100);
      localStorage.setItem('sprt_debug_v2', JSON.stringify(data));
    } catch (_) {}
  }
  function status() {
    var node = document.getElementById('sprt-training-status');
    if (!node) return;
    node.textContent = error || (pending ? 'Сохраняю прогресс…' : (state ? 'Прогресс сохранён на сервере' : 'Связь с сервером обучения…'));
    node.setAttribute('role', error ? 'alert' : 'status');
  }
  async function request(path, options) {
    var started = Date.now(), response;
    try { response = await fetch('/sprt/' + path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-SPRT-Request': '1' } }, options)); }
    finally { log('request', { path: path, status: response ? response.status : 0, durationMs: Date.now() - started }); }
    var body = await response.json();
    if (!response.ok) { var failure = new Error(body.error || 'Не удалось сохранить прогресс'); failure.status = response.status; throw failure; }
    return body;
  }
  window.SPRTTraining = {
    async init(snapshot) {
      try {
        for (var i = 0; i < 16; i++) {
          try { state = await request('me'); break; }
          catch (e) { if (e.status !== 503 || i === 15) throw e; await new Promise(function (resolve) { setTimeout(resolve, 2000); }); }
        }
        // Preserve the pre-migration cache before applying any server flags.
        // Server zeros must never silently replace completed browser lessons.
        if (snapshot && snapshot.progress && state.uid) {
          try {
            var key = 'sprt_learn_backup:' + state.uid;
            if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(snapshot));
          } catch (_) {}
          log('migration', { done: Object.keys(snapshot.progress).filter(function (key) { return /^l[1-6]$/.test(key) && snapshot.progress[key] === true; }).length,
            serverDone: Object.values(state.progress).filter(function (v) { return v === true; }).length, attempt: state.attempt });
          var recovered = await request('recover', { method: 'POST', body: JSON.stringify(snapshot) });
          state.progress = recovered.progress; state.attempt = recovered.attempt;
        }
        error = ''; status(); return state;
      }
      catch (e) { error = e.message; status(); return null; }
    },
    record(kind, lesson, passed) {
      var eventId = crypto.randomUUID();
      pending++; status();
      // Save only result metadata. Bodies, headers and API keys never leave the simulator.
      queue = queue.then(async function () {
        if (!state) throw new Error('Нет связи с сервером обучения. Обновите страницу.');
        if (error) throw new Error('Есть несохранённое событие. Обновите страницу для сверки прогресса.');
        var options = { method: 'POST', body: JSON.stringify({
          id: eventId, attempt: state.attempt, kind: kind, lesson: lesson, passed: passed,
        }) };
        var result;
        for (var i = 0; i < 3; i++) {
          try { result = await request('events', options); break; }
          catch (e) { if ((e.status && e.status < 500) || i === 2) throw e; await new Promise(function (resolve) { setTimeout(resolve, 1000); }); }
        }
        state.attempt = result.attempt; state.progress = result.progress;
        error = '';
      }).catch(function (e) { error = 'Прогресс не синхронизирован: ' + e.message; })
        .finally(function () { pending--; status(); });
      return queue;
    },
    renderStatus: status,
  };
  window.addEventListener('beforeunload', function (event) {
    if (pending || error) { event.preventDefault(); event.returnValue = ''; }
  });
})();

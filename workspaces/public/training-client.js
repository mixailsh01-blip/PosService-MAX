(function () {
  var state = null, queue = Promise.resolve(), error = '', pending = 0;
  function status() {
    var node = document.getElementById('sprt-training-status');
    if (!node) return;
    node.textContent = error || (pending ? 'Сохраняю прогресс…' : (state ? 'Прогресс сохранён на сервере' : 'Связь с сервером обучения…'));
    node.setAttribute('role', error ? 'alert' : 'status');
  }
  async function request(path, options) {
    var response = await fetch('/sprt/' + path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-SPRT-Request': '1' } }, options));
    var body = await response.json();
    if (!response.ok) { var failure = new Error(body.error || 'Не удалось сохранить прогресс'); failure.status = response.status; throw failure; }
    return body;
  }
  window.SPRTTraining = {
    async init() {
      try {
        for (var i = 0; i < 16; i++) {
          try { state = await request('me'); break; }
          catch (e) { if (e.status !== 503 || i === 15) throw e; await new Promise(function (resolve) { setTimeout(resolve, 2000); }); }
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

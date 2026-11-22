(function () {
  var status = document.getElementById('status'), report = document.getElementById('report');
  var enabled = document.getElementById('enabled'), latest;
  var KEY = 'sprt_debug_v2';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{"enabled":false,"entries":[]}'); } catch (_) { return { enabled: false, entries: [] }; } }
  function save(value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {} }
  enabled.checked = read().enabled === true;
  enabled.onchange = function () { var data = read(); data.enabled = enabled.checked; if (!data.enabled) data.entries = []; save(data); };
  async function refresh() {
    status.textContent = 'Проверяю…';
    try {
      var response = await fetch('/sprt/debug', { credentials: 'same-origin', headers: { 'X-SPRT-Request': '1' } });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка диагностики');
      var local = read();
      local.entries = (local.entries || []).filter(function (entry) { return entry.uid === data.account.uid || entry.uid == null; });
      latest = { server: data, browser: local, at: new Date().toISOString() };
      report.textContent = JSON.stringify(latest, null, 2);
      status.textContent = 'Диагностика загружена'; status.className = '';
      return true;
    } catch (e) { status.textContent = e.message; status.className = 'error'; return false; }
  }
  document.getElementById('refresh').onclick = refresh;
  document.getElementById('clear').onclick = function () { save({ enabled: enabled.checked, entries: [] }); refresh(); };
  document.getElementById('download').onclick = async function () {
    if (!await refresh()) return;
    var url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' }));
    var link = document.createElement('a'); link.href = url; link.download = 'SPRT-debug-' + Date.now() + '.json'; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  refresh();
})();

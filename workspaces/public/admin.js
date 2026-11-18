(function () {
  var content = document.getElementById('content'), status = document.getElementById('status');
  var employees = [], selected = null, generation = 0;
  var lessons = ['Токен доступа', 'Организация', 'Группа терминалов', 'Номенклатура', 'Создание заказа', 'Статус команды'];
  function el(tag, text, cls) { var node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; }
  function date(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
  function count(user) { return Object.values(user.progress || {}).filter(function (v) { return v === true; }).length; }
  async function api(uid) {
    var response = await fetch('/sprt/report' + (uid ? '?uid=' + encodeURIComponent(uid) : ''), { credentials: 'same-origin', headers: { 'X-SPRT-Request': '1' } });
    var value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Не удалось загрузить результаты');
    return value;
  }
  function render() {
    content.replaceChildren();
    var summary = el('div', null, 'panel stats');
    [['Сотрудников', employees.length], ['Завершили обучение', employees.filter(function (u) { return count(u) === 6; }).length]].forEach(function (item) {
      var cell = el('div', item[0]); cell.append(el('strong', item[1])); summary.append(cell);
    }); content.append(summary);
    var table = el('table'), head = el('tr');
    ['Сотрудник', 'Прогресс', 'Попытка', 'Запросов', 'Обновлено', 'Завершено', ''].forEach(function (name) { head.append(el('th', name)); });
    var thead = el('thead'); thead.append(head); table.append(thead);
    var tbody = el('tbody'), term = document.getElementById('search').value.toLowerCase();
    employees.filter(function (u) { return (u.email + ' ' + (u.name || '')).toLowerCase().includes(term); }).forEach(function (u) {
      var row = el('tr'); row.append(el('td', u.name ? u.name + ' · ' + u.email : u.email));
      var cell = el('td', count(u) + ' / 6 '), bar = el('progress'); bar.max = 6; bar.value = count(u); bar.setAttribute('aria-label', 'Выполнено заданий'); cell.append(bar); row.append(cell);
      [u.attempt, u.requests, date(u.updated_at), u.completed_at ? date(u.completed_at) : (u.legacy && count(u) === 6 ? 'Ранее, дата неизвестна' : '—')].forEach(function (value) { row.append(el('td', value)); });
      var action = el('td'), button = el('button', 'Подробнее'); button.onclick = function () { load(u.uid); }; action.append(button); row.append(action); tbody.append(row);
    }); table.append(tbody);
    var panel = el('div', null, 'panel scroll'); panel.append(table); content.append(panel);
    if (!tbody.children.length) content.append(el('p', 'Сотрудники не найдены'));
  }
  function detail(data) {
    content.replaceChildren();
    var u = data.employee, panel = el('section', null, 'panel');
    panel.append(el('h2', u.name || u.email), el('p', u.email + ' · Попытка ' + u.attempt));
    data.lessons.forEach(function (id, i) {
      var row = el('div', null, 'lesson'); row.append(el('span', (i + 1) + '. ' + lessons[i]), el('strong', u.progress[id] ? 'Выполнено' : 'Не выполнено', u.progress[id] ? 'ok' : 'muted')); panel.append(row);
    });
    if (u.legacy) panel.append(el('p', 'Часть прогресса перенесена из прежних настроек. Старые даты и запросы неизвестны.'));
    content.append(panel);
    var history = el('section', null, 'panel'); history.append(el('h2', 'Последние события'));
    data.events.forEach(function (event) {
      var name = event.kind === 'reset' ? 'Начата новая попытка' : (event.kind === 'lesson' ? 'Задание выполнено' : 'Учебный запрос: ' + (event.passed ? 'успешно' : 'не выполнено'));
      history.append(el('p', date(event.created_at) + ' · Попытка ' + event.attempt + ' · ' + name + (event.lesson_id ? ' · ' + event.lesson_id : '')));
    }); if (!data.events.length) history.append(el('p', 'Новых событий пока нет')); content.append(history);
  }
  async function load(uid) {
    var current = ++generation; selected = uid || null; status.textContent = 'Загружаю…';
    document.getElementById('back').hidden = !selected;
    try {
      var data = await api(selected); if (current !== generation) return;
      if (selected) detail(data); else { employees = data.employees; render(); }
      status.textContent = 'Обновлено: ' + new Date().toLocaleTimeString('ru-RU'); status.className = 'muted';
    } catch (error) { if (current !== generation) return; content.replaceChildren(); status.textContent = error.message; status.className = 'error'; }
  }
  document.getElementById('search').oninput = function () { if (!selected) render(); };
  document.getElementById('refresh').onclick = function () { load(selected); };
  document.getElementById('back').onclick = function () { load(); };
  load();
})();

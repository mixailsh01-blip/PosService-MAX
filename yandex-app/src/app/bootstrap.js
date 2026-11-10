import '../core/n8nClient.js';
import {
  loadAuth,
  saveAuth,
  clearAuth,
  loadRestaurant,
  saveRestaurant,
  clearRestaurant,
  loadCart,
  saveCart,
  clearCart,
} from '../core/storage.js';
import { getRestaurants, getMenuComposition, getAvailability, createOrder } from '../core/api.js';

const app = document.getElementById('app');
const render = (html) => (app.innerHTML = html);

// ---- Global state (single source of truth) ----
window.appState ||= {
  auth: null,          // { baseUrl, clientId, clientSecret, accessToken }
  restaurant: null,    // { id, name }
  cart: { items: [] },  // [{ key, itemId, name, qty, basePrice, modifiers: [{id,name,price,amount}], totalPrice }]
  screen: 'auth',      // auth | restaurants | hub | menu | availability | cart
  history: [],         // stack of previous screens for Back
};

// ---- Style (injected once) ----
function ensureStyles() {
  if (document.getElementById('iikoStyles')) return;
  const el = document.createElement('style');
  el.id = 'iikoStyles';
  el.textContent = `
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:0;background:#fafafa;}
    #app{max-width:860px;margin:0 auto;padding:12px;}
    button{padding:10px 12px;border:1px solid #ddd;border-radius:12px;background:#fff;cursor:pointer;}
    button[disabled]{opacity:.5;cursor:not-allowed;}
    input,textarea{padding:10px;border:1px solid #ddd;border-radius:12px;width:100%;box-sizing:border-box;}
    .row{display:flex;gap:8px;align-items:center;}
    .muted{opacity:.7}
    .card{border:1px solid #eee;border-radius:16px;background:#fff;padding:12px;}
    .list{display:flex;flex-direction:column;gap:10px;}
    .menu-toolbar{display:flex;gap:8px;align-items:center;margin:12px 0;flex-wrap:wrap;}
    .menu-toolbar input{flex:1;min-width:220px;}
    .menu-cat{margin:18px 0 10px;font-size:16px;}
    .menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
    @media (max-width:520px){.menu-grid{grid-template-columns:repeat(1,minmax(0,1fr));}}
    .menu-card{border:1px solid #eee;border-radius:16px;overflow:hidden;background:#fff;}
    .menu-img{height:140px;background:#f4f4f4;display:flex;align-items:center;justify-content:center;}
    .menu-img img{width:100%;height:100%;object-fit:cover;display:block;}
    .menu-noimg{font-size:12px;opacity:.6}
    .menu-body{padding:10px;display:flex;flex-direction:column;gap:6px;}
    .menu-title{font-weight:650;font-size:14px;line-height:1.2;}
    .menu-desc{font-size:12px;opacity:.75;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px;}
    .menu-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;align-items:center;}
    .badge{font-size:12px;color:#777;background:#f1f1f1;padding:6px 8px;border-radius:999px;display:inline-block;}
    .menu-card.is-disabled{opacity:.45;filter:grayscale(1);}
    
    #restaurantBadge{position:fixed;top:10px;right:12px;z-index:1000;display:none;}
    .rest-badge{background:#f4f4f5;border-radius:10px;padding:6px 10px;font-size:12px;line-height:1.2;text-align:right;box-shadow:0 2px 6px rgba(0,0,0,.08);}
    .rest-name{font-weight:650;}
    .rest-id{opacity:.65;}
    .itemDlgHead{display:flex;gap:12px;align-items:flex-start;}
    .itemDlgImg{width:84px;height:84px;border-radius:14px;overflow:hidden;background:#f6f6f6;flex:0 0 auto;display:flex;align-items:center;justify-content:center;}
    .itemDlgImg img{width:100%;height:100%;object-fit:cover;display:block;}
    .itemDlgTitle{font-weight:700;font-size:16px;line-height:1.2;margin-bottom:4px;}
    .itemDlgDesc{font-size:12px;opacity:.75;}
    .group{margin-top:12px;}
    .groupTitle{font-weight:650;margin-bottom:6px;}
    .groupHint{font-size:12px;opacity:.65;margin-top:2px;}
    .mods{display:flex;flex-direction:column;gap:8px;margin-top:8px;}
    .modRow{display:grid;grid-template-columns:44px 1fr auto auto;gap:10px;align-items:center;width:100%;box-sizing:border-box;border:1px solid #eee;border-radius:12px;padding:10px;background:#fff;}
    .modRow:hover{border-color:#ddd;}
    .modThumb{width:44px;height:44px;border-radius:12px;overflow:hidden;background:#f2f2f2;display:flex;align-items:center;justify-content:center;}
    .modThumb img{width:100%;height:100%;object-fit:cover;display:block;}
    .modInfo{min-width:0;}
    .modInfo .name{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .modInfo .sub{font-size:12px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
    .modPrice{font-weight:700;white-space:nowrap;}
    .modControl{display:flex;justify-content:flex-end;align-items:center;}
    .modControl input{transform:scale(0.95);margin:0;}
    .modControl input[type="checkbox"], .modControl input[type="radio"]{width:18px;height:18px;}
    .modRow .modPrice{margin-left:auto;font-weight:700;font-size:13px;white-space:nowrap;}
    .modRow .modControl{margin-left:8px;}

    .modName{flex:1;min-width:0;}
    .modName b{display:block;font-size:13px;}
    .modName span{display:block;font-size:12px;opacity:.7;}
    .stepper{display:flex;gap:6px;align-items:center;}
    .stepper button{padding:6px 10px;}
    .totalRow{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #eee;}
dialog{border:none;border-radius:16px;padding:0;max-width:92vw;width:900px;}
    dialog .dlg{padding:12px;}
    dialog pre{margin:0;padding:12px;background:#111;color:#eee;overflow:auto;max-height:70vh;border-radius:12px;font-size:12px;}
    .hr{height:1px;background:#eee;margin:10px 0;}
    .dlgActions{position:sticky;bottom:0;display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:10px 0 0;margin-top:12px;background:linear-gradient(to top, #fff 75%, rgba(255,255,255,0));}
    .dlgActions button{padding:10px 14px;border-radius:14px;}

  `;
  document.head.appendChild(el);
}

// ---- Navigation helpers ----
function setScreen(screen, { pushHistory = true } = {}) {
  const st = window.appState;

  if (pushHistory && st.screen && st.screen !== screen) {
    st.history.push(st.screen);
  }

  st.screen = screen;
  rerender();
}

function goBack() {
  const st = window.appState;
  const prev = st.history.pop();
  if (prev) {
    st.screen = prev;
    rerender();
    return;
  }
  // fallback
  st.screen = st.restaurant?.id ? 'hub' : (st.auth?.accessToken ? 'restaurants' : 'auth');
  rerender();
}

function header(title) {
  const st = window.appState;
  const showBack = st.screen !== 'auth' && st.history.length > 0;
  const chip = (st.restaurant?.id && st.screen !== 'auth' && st.screen !== 'restaurants')
    ? `<div class="restchip" title="${st.restaurant.id}">${st.restaurant.name ? st.restaurant.name : 'Ресторан'}</div>` : '';
  return `
    <div class="topbar">
      ${showBack ? `<button id="backBtn" type="button" class="iconbtn" aria-label="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>` : ''}
      <h1 class="ttl">${title}</h1>
      ${chip}
    </div>
  `;
}

function wireBackButton() {
  const back = document.getElementById('backBtn');
  if (back) back.onclick = () => goBack();
}

// ---- Telegram helpers ----

// ---- Cart helpers ----
function cartCount() {
  const items = (window.appState.cart?.items || []);
  return items.reduce((s, x) => s + Number(x.quantity || 0), 0);
}

function buildCartKey(itemId, modifiers) {
  const mods = (modifiers || []).slice().sort((a,b) => String(a.id).localeCompare(String(b.id)));
  return String(itemId) + '|' + mods.map(m => `${m.id}:${m.amount || 1}`).join(',');
}

function selectionToModifiers(item, sel) {
  const out = [];
  for (const g of (item.modifierGroups || [])) {
    const chosen = sel[g.id] || {};
    for (const m of (g.modifiers || [])) {
      const amt = Number(chosen[m.id] || 0);
      if (amt > 0) {
        out.push({
          id: m.id,
          name: m.name || String(m.id),
          price: safeNum(m.price, 0),
          amount: amt,
          groupId: g.id,
          groupName: g.name || ''
        });
      }
    }
  }
  return out;
}

function addToCart(item, sel) {
  const st = window.appState;
  st.cart ||= { items: [] };

  const modifications = selectionToModifiers(item, sel).map((m) => ({
    id: String(m.id),
    name: m.name || String(m.id),
    quantity: safeNum(m.amount, 1),
    price: safeNum(m.price, 0)
  }));

  const key = buildCartKey(item.id, modifications.map(mm => ({ id: mm.id, amount: mm.quantity })));

  const existing = (st.cart.items || []).find(x => x.key === key);
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + 1;
  } else {
    st.cart.items.push(JSON.parse(JSON.stringify({
      key,
      id: String(item.id),
      name: (item.name || '').trim() || `#${item.id}`,
      quantity: 1,
      price: safeNum(item.price, 0),
      modifications,
      promos: [],
      imgUrl: item.images?.[0]?.url || item.images?.[0] || ''
    })))
  }

  saveCart(st.cart);
  try { tg().showPopup?.({ title: 'Готово', message: 'Добавлено в корзину', buttons: [{ id: 'ok', type: 'ok', text: 'OK' }] }); } catch(_) {}
}
function updateCartItemQty(key, qty) {
  const st = window.appState;
  const items = st.cart?.items || [];
  const x = items.find(i => i.key === key);
  if (!x) return;

  const q = Math.max(0, Number(qty || 0));
  if (q === 0) {
    st.cart.items = items.filter(i => i.key !== key);
  } else {
    x.quantity = q;
  }
  saveCart(st.cart);
}
function cartTotal() {
  const orderItems = cartToOrderItems();
  return calcItemsCost(orderItems);
}

function tg() {
  return window.Telegram?.WebApp || null;
}

function tgConfirm(message) {
  const webApp = tg();
  if (webApp?.showConfirm) {
    return new Promise((resolve) => webApp.showConfirm(message, (ok) => resolve(Boolean(ok))));
  }
  return Promise.resolve(window.confirm(message));
}

// ---- Menu helpers ----
function normalizeMenuResponse(raw) {
  const unwrap = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') return JSON.parse(v);
    return v;
  };

  const outer = unwrap(raw);
  if (!outer) return { categories: [], items: [], lastChange: null };

  if (outer.data != null) {
    const inner = unwrap(outer.data);
    return {
      categories: Array.isArray(inner?.categories) ? inner.categories : [],
      items: Array.isArray(inner?.items) ? inner.items : [],
      lastChange: inner?.lastChange ?? null,
    };
  }

  return {
    categories: Array.isArray(outer?.categories) ? outer.categories : [],
    items: Array.isArray(outer?.items) ? outer.items : [],
    lastChange: outer?.lastChange ?? null,
  };
}

function normalizeAvailabilityResponse(raw) {
  const unwrap = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') return JSON.parse(v);
    return v;
  };

  const outer = unwrap(raw);
  if (!outer) return { items: [], modifiers: [] };

  if (outer.data != null) {
    const inner = unwrap(outer.data);
    return {
      items: Array.isArray(inner?.items) ? inner.items : [],
      modifiers: Array.isArray(inner?.modifiers) ? inner.modifiers : [],
    };
  }

  return {
    items: Array.isArray(outer?.items) ? outer.items : [],
    modifiers: Array.isArray(outer?.modifiers) ? outer.modifiers : [],
  };
}

function stopIdVariants(value) {
  const s = String(value ?? '').trim();
  if (!s) return [];

  const firstToken = s.split(/\s+/)[0];
  const beforeDash = firstToken.split('-')[0];

  const variants = new Set([s, firstToken, beforeDash]);

  const m = s.match(/^\d+/);
  if (m?.[0]) variants.add(m[0]);

  return [...variants].filter(Boolean);
}

function buildMenuViewModel(menu) {
  const groups = new Map();
  for (const it of menu.items || []) {
    const key = it.categoryId ?? 'uncat';
    const arr = groups.get(key) || [];
    arr.push(it);
    groups.set(key, arr);
  }

  const categoriesSorted = (menu.categories || []).slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const sections = categoriesSorted.map((cat) => {
    const items = (groups.get(cat.id) || []).slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return { category: cat, items };
  }).filter((s) => s.items.length > 0);

  // If API returns items without categories, show them anyway
  if (sections.length === 0 && (menu.items || []).length > 0) {
    sections.push({ category: { id: 'uncat', name: 'Позиции', sortOrder: 0 }, items: menu.items });
  }

  return { sections, lastChange: menu.lastChange };
}

function itemToSearchString(it) {
  const safe = (v) => (v == null ? '' : String(v));
  return [
    it.id,
    it.categoryId,
    it.name,
    it.description,
    it.price,
    it.measure,
    it.measureUnit,
    it.weight,
  ].map(safe).join(' ').toLowerCase();
}

function rub(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return `${v} ₽`;
  return `${n} ₽`;
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openJsonDialog(obj) {
  const dlg = document.getElementById('jsonDialog');
  const pre = document.getElementById('jsonPre');
  if (!dlg || !pre) return;
  pre.textContent = JSON.stringify(obj, null, 2);
  const c = document.getElementById('jsonClose'); if (c) c.onclick = () => dlg.close();
  dlg.showModal();
}

// ---- Screens ----
function authScreen() {
  render(`
    <div class="authwrap">
      <div class="card auth">
        <div class="authhead">
          <div class="authico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3"/></svg></div>
          <div>
            <div class="authttl">API Яндекс Еды</div>
            <div class="authsub">Вход по Client ID и Client Secret интеграции</div>
          </div>
        </div>
        <div class="list">
          <label class="fld"><span>Base URL</span><input id="baseUrl" placeholder="https://компания.iikoweb.ru/api/integrations/yandex-food" /></label>
          <label class="fld"><span>Client ID</span><input id="clientId" autocomplete="off" /></label>
          <label class="fld"><span>Client Secret</span><input id="clientSecret" type="password" autocomplete="off" /></label>
          <button id="go" class="primary">Войти</button>
          <div id="err"></div>
        </div>
      </div>
    </div>
  `);

  wireBackButton();

  const stored = loadAuth();
  if (stored?.baseUrl) document.getElementById('baseUrl').value = stored.baseUrl;
  if (stored?.clientId) document.getElementById('clientId').value = stored.clientId;
  if (stored?.clientSecret) document.getElementById('clientSecret').value = stored.clientSecret;

  document.getElementById('go').onclick = async () => {
    const baseUrl = document.getElementById('baseUrl').value.trim();
    const clientId = document.getElementById('clientId').value.trim();
    const clientSecret = document.getElementById('clientSecret').value;

    const err = document.getElementById('err');
    err.textContent = '';

    try {
      await window.n8nAuth({ baseUrl, clientId, clientSecret });
      window.appState.auth = loadAuth();
      setScreen('restaurants', { pushHistory: false });
    } catch (e) {
      err.textContent = e?.error?.message || e?.message || JSON.stringify(e);
    }
  };
}

async function restaurantsScreen() {
  render(`${header('Рестораны')}<div class="muted">Загрузка…</div>`);
  wireBackButton();

  try {
    const r = await getRestaurants();
    const list = r?.places || r?.restaurants || r || [];
    const items = Array.isArray(list) ? list : [];

    render(`
      ${header('Рестораны')}
      <div class="list">
        ${items.map((p) => {
          const id = p.id || p.restaurantId || p.placeId || '';
          const title = p.name || p.title || p.address || id;
          return `<button class="restaurantBtn" data-id="${id}">${title}</button>`;
        }).join('') || `<div class="muted">Пусто</div>`}
      </div>

      <div style="margin-top:14px;" class="row">
        <button id="logout">Выйти</button>
      </div>
    `);

    wireBackButton();

    document.querySelectorAll('.restaurantBtn').forEach((btn) => {
      btn.onclick = async () => {
        const restaurantId = btn.getAttribute('data-id');
        if (!restaurantId) return;
        const ok = await tgConfirm(`Выбрать ресторан ${restaurantId}?`);
        if (!ok) return;

        saveRestaurant({ id: restaurantId, name: btn.textContent.trim() });
        window.appState.restaurant = { id: restaurantId, name: btn.textContent.trim() };
        setScreen('hub');
      };
    });

    document.getElementById('logout').onclick = () => {
      clearAuth();
      clearRestaurant();
      clearCart();
      window.appState.auth = null;
      window.appState.restaurant = null;
      window.appState.history = [];
      setScreen('auth', { pushHistory: false });
    };
  } catch (e) {
    render(`${header('Рестораны')}<pre>${JSON.stringify(e, null, 2)}</pre>`);
    wireBackButton();
  }
}

function hubScreen() {
  const st = window.appState;
  if (!st.restaurant?.id) {
    setScreen('restaurants', { pushHistory: false });
    return;
  }

  render(`
    ${header('Главный экран')}
    <div class="tiles">
      <button id="goMenu" class="tile"><span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span><span class="tt">Меню</span><span class="td">Позиции, цены, модификаторы</span></button>
      <button id="goAvail" class="tile"><span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span><span class="tt">Недоступные позиции</span><span class="td">Стоп-лист ресторана</span></button>
      <button id="goCart" class="tile"><span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 12h11l2-8.5H6.4"/></svg></span><span class="tt">Корзина <span class="badge" id="cartCountBadge"></span></span><span class="td">Сборка и проверка заказа</span></button>
      <button class="tile" disabled><span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><span class="tt">Заказы</span><span class="td">Скоро</span></button>
      <button class="tile" disabled><span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></span><span class="tt">Создание заказа</span><span class="td">Позже</span></button>
    </div>

    <div class="foot row">
      <button id="changeRest" type="button">Сменить ресторан</button>
      <button id="logout" type="button">Выйти</button>
    </div>
  `);

  wireBackButton();

  document.getElementById('goMenu').onclick = () => setScreen('menu');
  document.getElementById('goAvail').onclick = () => setScreen('availability');
  const cc = cartCount();
  const b = document.getElementById('cartCountBadge');
  if (b) b.textContent = cc ? String(cc) : '';
  const goCart = document.getElementById('goCart');
  if (goCart) goCart.onclick = () => setScreen('cart');

  document.getElementById('changeRest').onclick = () => {
    window.appState.restaurant = null;
    clearRestaurant();
      clearCart();
    window.appState.history = [];
    setScreen('restaurants', { pushHistory: false });
  };

  document.getElementById('logout').onclick = () => {
    clearAuth();
    clearRestaurant();
      clearCart();
    window.appState.auth = null;
    window.appState.restaurant = null;
    window.appState.history = [];
    setScreen('auth', { pushHistory: false });
  };
}

async function menuScreen() {
  const st = window.appState;
  if (!st.restaurant?.id) {
    setScreen('restaurants', { pushHistory: false });
    return;
  }

  render(`${header('Меню')}<div class="muted">Загрузка…</div>`);
  wireBackButton();

  try {
    const restaurantId = st.restaurant.id;

    // composition + availability (чтобы сразу серить недоступные)
    const [rawComp, rawAvail0] = await Promise.all([
      getMenuComposition(restaurantId),
      getAvailability(restaurantId).catch(() => null),
    ]);

    const menu = normalizeMenuResponse(rawComp);
    const menuVm = buildMenuViewModel(menu);

    const rawAvail = rawAvail0 ? normalizeAvailabilityResponse(rawAvail0) : { items: [], modifiers: [] };

    // itemId в availability может приходить в "упакованном" виде и содержать хвосты ("-8 шт" и т.п.).
    // Для устойчивого матчинга серим по набору вариантов.
    const stopSet = new Set();
    for (const x of (rawAvail.items || [])) {
      for (const v of stopIdVariants(x?.itemId)) stopSet.add(String(v));
    }

    render(`
      ${header('Меню')}

      <div class="menu-toolbar">
        <input id="menuSearch" placeholder="Поиск по любым полям..." />
        <button id="btnJson" type="button">JSON</button>
        <button id="btnDownload" type="button">Скачать JSON</button>
        <span class="badge">Недоступных: ${stopSet.size}</span>
      </div>

      <div id="menuRoot"></div>

      <dialog id="jsonDialog">
        <div class="dlg">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <div style="font-weight:650;">JSON</div>
            <form method="dialog"><button type="submit">Закрыть</button></form>
          </div>
          <div class="hr"></div>
          <pre id="jsonPre"></pre>
        </div>
      </dialog>


      <dialog id="itemDialog"></dialog>
    `);

    wireBackButton();

    const root = document.getElementById('menuRoot');

    const itemDlg = document.getElementById('itemDialog');

    function formatRule(g) {
      const min = Number(g.minSelectedModifiers || 0);
      const max = Number(g.maxSelectedModifiers || 0);
      if (min && max) return `Нужно выбрать ${min}–${max}`;
      if (min) return `Нужно выбрать минимум ${min}`;
      if (max) return `Можно выбрать до ${max}`;
      return '';
    }

    function isSingleChoiceGroup(g) {
      const maxSel = Number(g.maxSelectedModifiers || 0);
      // если явно 1 — считаем одиночным выбором
      return maxSel === 1;
    }

    function calcTotal(item, sel) {
      let total = Number(item.price || 0);
      for (const g of (item.modifierGroups || [])) {
        const gs = sel[g.id] || {};
        for (const m of (g.modifiers || [])) {
          const amt = Number(gs[m.id] || 0);
          total += amt * Number(m.price || 0);
        }
      }
      return total;
    }

    function validateSelection(item, sel) {
      const errs = [];
      for (const g of (item.modifierGroups || [])) {
        const gs = sel[g.id] || {};
        let cnt = 0;
        for (const k of Object.keys(gs)) cnt += Number(gs[k] || 0) > 0 ? 1 : 0;
        const min = Number(g.minSelectedModifiers || 0);
        const max = Number(g.maxSelectedModifiers || 0);
        if (min && cnt < min) errs.push(`«${g.name}»: выбрано ${cnt}, нужно минимум ${min}`);
        if (max && cnt > max) errs.push(`«${g.name}»: выбрано ${cnt}, максимум ${max}`);
      }
      return errs;
    }

    function openItemDialog(item, { disabled } = {}) {
      if (!itemDlg) return;

      // локальное состояние выбора модификаторов (для предпросмотра)
      const sel = {};
      for (const g of (item.modifierGroups || [])) sel[g.id] = {};

      // delegated actions: survive innerHTML re-renders
      itemDlg.onclick = (e) => {
        const t = e.target;
        if (!t || !t.id) return;
        if (t.id === 'addToCartBtn') {
          try { addToCart(item, sel); } catch (err) { console.error(err); }
          try { rerender(); } catch (err) { console.error(err); }
          try { itemDlg.close(); } catch (_) {}
        }
        if (t.id === 'closeItemDlg') {
          try { itemDlg.close(); } catch (_) {}
        }
      };


      const imgUrl = item.images?.[0]?.url || item.images?.[0] || '';
      const desc = (item.description || '').trim();
      const weight = item.measure != null
        ? `${item.measure} ${item.measureUnit || ''}`.trim()
        : (item.weight ? `${item.weight}` : '');

      function renderDlg() {
        const total = calcTotal(item, sel);
        const errs = validateSelection(item, sel);

        itemDlg.innerHTML = `
          <div class="dlg">
            <div class="row" style="justify-content:space-between;align-items:center;">
              <div style="font-weight:650;">Детали</div>
              <form method="dialog"><button type="submit">Закрыть</button></form>
            </div>
            <div class="hr"></div>

            <div class="itemDlgHead">
              <div class="itemDlgImg">
                ${imgUrl ? `<img src="${imgUrl}" alt="">` : `<div class="menu-noimg">нет фото</div>`}
              </div>
              <div style="min-width:0;">
                <div class="itemDlgTitle">${(item.name || '').trim() || `#${item.id}`}</div>
                <div class="itemDlgDesc">${desc || ''}</div>
                <div class="row" style="gap:10px;margin-top:6px;align-items:baseline;">
                  <div class="muted">${weight}</div>
                  <div style="margin-left:auto;font-weight:700;">${rub(item.price)}</div>
                </div>
                ${disabled ? `<div style="margin-top:6px;"><span class="badge">Недоступно</span></div>` : ``}
              </div>
            </div>

            ${(item.modifierGroups && item.modifierGroups.length) ? `
              <div class="hr"></div>
              <div>
                ${(item.modifierGroups || []).map((g) => {
                  const rule = formatRule(g);
                  const single = isSingleChoiceGroup(g);
                  const min = Number(g.minSelectedModifiers || 0);
                  const max = Number(g.maxSelectedModifiers || 0);
                  return `
                    <div class="group" data-g="${g.id}">
                      <div class="groupTitle">${g.name || 'Модификаторы'}</div>
                      ${rule ? `<div class="groupHint">${rule}</div>` : ``}
                      <div class="mods">
                        ${(g.modifiers || []).map((m) => {
                          const amt = Number((sel[g.id] || {})[m.id] || 0);
                          const min = Number(g.minSelectedModifiers || 0);
                          const max = Number(g.maxSelectedModifiers || 0);
                          const single = isSingleChoiceGroup(g);
                          const canMany = Number(m.maxAmount || 1) > 1 || (!single && (max > 1));
                          const mImgUrl = m.images?.[0]?.url || m.images?.[0] || '';
                          const priceTxt = Number(m.price || 0) ? `+${rub(m.price)}` : `${rub(0)}`;
                          if (single) {
                            return `
                              <label class="modRow">
                                <div class="modThumb">${mImgUrl ? `<img src="${mImgUrl}" alt="">` : `<div class="muted" style="font-size:11px;">—</div>`}</div>
                                <div class="modInfo">
                                  <div class="name">${m.name || String(m.id)}</div>
                                  <div class="sub">id: <code>${m.id}</code></div>
                                </div>
                                <div class="modPrice">${priceTxt}</div>
                                <div class="modControl">
                                  <input type="radio" name="g_${g.id}" value="${m.id}" data-g="${g.id}" data-m="${m.id}" ${amt ? 'checked' : ''}/>
                                </div>
                              </label>
                            `;
                          }
                          return `
                            <div class="modRow">
                              <div class="modThumb">${mImgUrl ? `<img src="${mImgUrl}" alt="">` : `<div class="muted" style="font-size:11px;">—</div>`}</div>
                              <div class="modInfo">
                                <div class="name">${m.name || String(m.id)}</div>
                                <div class="sub">id: <code>${m.id}</code></div>
                              </div>
                              <div class="modPrice">${priceTxt}</div>
                              <div class="modControl">
                                ${canMany ? `
                                  <div class="stepper" data-mid="${m.id}" data-g="${g.id}" data-m="${m.id}">
                                    <button type="button" class="dec">−</button>
                                    <div style="min-width:18px;text-align:center;">${amt || 0}</div>
                                    <button type="button" class="inc">+</button>
                                  </div>
                                ` : `
                                  <input type="checkbox" class="modChk" data-mid="${m.id}" data-g="${g.id}" data-m="${m.id}" ${amt ? 'checked' : ''}/>
                                `}
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="muted" style="margin-top:10px;">У этого блюда нет модификаторов.</div>
            `}

            <div class="totalRow">
              <div class="muted">Итого</div>
              <div style="font-weight:800;font-size:16px;">${rub(total)}</div>
            </div>

            <div class="dlgActions">
              <button id="addToCartBtn" type="button" ${disabled || errs.length ? 'disabled' : ''}>В корзину</button>
              <button id="closeItemDlg" type="button">Закрыть</button>
            </div>

            ${errs.length ? `
              <div style="margin-top:10px;">
                <div class="badge" style="background:var(--err-bg);color:var(--err);">Проверь выбор</div>
                <div style="font-size:12px;opacity:.8;margin-top:6px;">
                  ${errs.map(e => `<div>• ${e}</div>`).join('')}
                </div>
              </div>
            ` : ``}
          </div>
        `;

        // wire events
        for (const g of (item.modifierGroups || [])) {
          const gEl = itemDlg.querySelector(`[data-g="${g.id}"]`);
          if (!gEl) continue;

          const single = isSingleChoiceGroup(g);
          if (single) {
            gEl.querySelectorAll(`input[type="radio"][name="g_${g.id}"]`).forEach((r) => {
              r.onchange = () => {
                // сброс и установка одного
                sel[g.id] = {};
                sel[g.id][r.value] = 1;
                renderDlg();
              };
            });
            continue;
          }

          // multi choice
          gEl.querySelectorAll('.modChk').forEach((chk) => {
            chk.onchange = () => {
              const mid = chk.getAttribute('data-mid');
              if (!mid) return;
              if (chk.checked) {
                sel[g.id][mid] = Math.max(1, Number(sel[g.id][mid] || 0));
              } else {
                delete sel[g.id][mid];
              }
              renderDlg();
            };
          });

          gEl.querySelectorAll('.stepper').forEach((stp) => {
            const mid = stp.getAttribute('data-mid');
            const mod = (g.modifiers || []).find((x) => String(x.id) === String(mid));
            const minAmt = Number(mod?.minAmount || 0);
            const maxAmt = Number(mod?.maxAmount || 99);

            const inc = stp.querySelector('.inc');
            const dec = stp.querySelector('.dec');

            if (inc) inc.onclick = () => {
              const cur = Number(sel[g.id][mid] || 0);
              const next = Math.min(maxAmt, cur + 1);
              if (next > 0) sel[g.id][mid] = next;
              renderDlg();
            };

            if (dec) dec.onclick = () => {
              const cur = Number(sel[g.id][mid] || 0);
              const next = Math.max(0, cur - 1);
              if (next === 0) {
                delete sel[g.id][mid];
              } else {
                sel[g.id][mid] = Math.max(minAmt || 1, next);
              }
              renderDlg();
            };
          });
        }
      }

      renderDlg();
      itemDlg.showModal();
    }

    function renderMenu(query) {
      const q = (query || '').trim().toLowerCase();
      root.innerHTML = '';

      let shown = 0;

      for (const sec of menuVm.sections) {
        const grid = document.createElement('div');
        grid.className = 'menu-grid';

        const filtered = sec.items.filter((it) => {
          if (!q) return true;
          return itemToSearchString(it).includes(q);
        });

        if (filtered.length === 0) continue;

        const h = document.createElement('div');
        h.className = 'menu-cat';
        h.textContent = sec.category?.name || 'Категория';
        root.appendChild(h);

        for (const it of filtered) {
          const id = String(it.id);
          const disabled = stopSet.has(id) || stopSet.has(id.split('-')[0]);
          const card = document.createElement('div');
          card.className = 'menu-card' + (disabled ? ' is-disabled' : '');

          const imgUrl = it.images?.[0]?.url || it.images?.[0] || '';
          const desc = (it.description || '').trim();
          const weight = it.measure != null
            ? `${it.measure} ${it.measureUnit || ''}`.trim()
            : (it.weight ? `${it.weight}` : '');

          card.innerHTML = `
            <div class="menu-img">
              ${imgUrl ? `<img src="${imgUrl}" alt="">` : `<div class="menu-noimg">нет фото</div>`}
            </div>
            <div class="menu-body">
              <div class="menu-title">${(it.name || '').trim() || `#${it.id}`}</div>
              <div class="menu-desc">${desc || '&nbsp;'}</div>
              <div class="menu-meta">
                <span class="muted">${weight}</span>
                <b>${rub(it.price)}</b>
              </div>
              ${disabled ? `<div class="badge">Недоступно</div>` : ``}
            </div>
          `;

          // Клик по карточке — открыть расширенную информацию + выбор модификаторов
          card.onclick = () => openItemDialog(it, { disabled });

          grid.appendChild(card);
          shown += 1;
        }

        root.appendChild(grid);
      }

      if (shown === 0) {
        root.innerHTML = `<div class="muted">Ничего не найдено.</div>`;
      }
    }

    renderMenu('');

    document.getElementById('menuSearch').oninput = (e) => renderMenu(e.target.value);

    document.getElementById('btnJson').onclick = () => openJsonDialog({
      restaurantId,
      lastChange: menuVm.lastChange,
      availability: rawAvail,
      menu,
    });

    document.getElementById('btnDownload').onclick = () => {
      downloadJson(menu, `menu_${restaurantId}.json`);
    };
  } catch (e) {
    render(`${header('Меню')}<pre>${JSON.stringify(e, null, 2)}</pre>`);
    wireBackButton();
  }
}



function genPositionId() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function pad2(n){ return String(n).padStart(2,'0'); }
function formatIsoWithOffset(d) {
  const y=d.getFullYear(), mo=pad2(d.getMonth()+1), da=pad2(d.getDate());
  const h=pad2(d.getHours()), mi=pad2(d.getMinutes()), s=pad2(d.getSeconds());
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const oh = pad2(Math.floor(abs/60));
  const om = pad2(abs%60);
  return `${y}-${mo}-${da}T${h}:${mi}:${s}.000000${sign}${oh}:${om}`;
}
function genEatsIdFromNow(d) {
  const yy=String(d.getFullYear()).slice(-2);
  return `${yy}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function safeStr(v, fallback = '') {
  if (v === null || v === undefined) return fallback;
  const t = typeof v;
  if (t === 'string') return v;
  if (t === 'number' || t === 'bigint' || t === 'boolean') return String(v);
  // Avoid String(obj) / obj.toString() because it can recurse (Telegram/WebView oddities)
  return fallback;
}

function safeNum(v, fallback = 0) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  // Avoid Number(obj) / String(obj) to prevent recursion
  return fallback;
}

function cartToOrderItems() {
  const items = (window.appState.cart?.items || []);
  return items.map((x) => {
    const id = safeStr(x.id, safeStr(x.itemId, ''));
    const name = safeStr(x.name, id || '');
    const quantity = safeNum(x.quantity, safeNum(x.qty, 1));
    const price = safeNum(x.price, safeNum(x.basePrice, 0));

    const rawMods = Array.isArray(x.modifications) ? x.modifications : (Array.isArray(x.modifiers) ? x.modifiers : []);
    const modifications = rawMods.map((m) => ({
      id: safeStr(m.id, safeStr(m.modifierId, '')),
      name: safeStr(m.name, safeStr(m.id, '')),
      quantity: safeNum(m.quantity, safeNum(m.amount, 1)),
      price: safeNum(m.price, 0),
    }));

    return { id, name, quantity, price, modifications, promos: [] };
  });
}
function calcItemsCost(orderItems) {
  let sum = 0;
  for (const it of orderItems) {
    const mods = (it.modifications || []).reduce((s,m)=>s+safeNum(m.price,0)*safeNum(m.quantity,1),0);
    const unit = safeNum(it.price,0) + mods;
    sum += unit * safeNum(it.quantity,1);
  }
  return sum;
}
function buildOrderPayload() {
  const st = window.appState;
  const orderItems = cartToOrderItems();
  const itemsCost = calcItemsCost(orderItems);
  const now = new Date();
  const delivery = new Date(now.getTime() + 2*60*60*1000);
  st.orderForm ||= {};
  const f = st.orderForm;
  const deliveryFee = safeNum(f.deliveryFee, 0);
  const change = safeNum(f.change, 0);
  const total = itemsCost + deliveryFee;
  return {
    discriminator: "marketplace",
    eatsId: f.eatsId || genEatsIdFromNow(now),
    restaurantId: String(st.restaurant?.id || ''),
    deliveryInfo: {
      clientName: "Yandex.Eda",
      phoneNumber: "88006001210",
      deliveryDate: formatIsoWithOffset(delivery),
      deliveryAddress: {
        full: (f.addressFull || '').trim(),
        latitude: (f.latitude || '').trim(),
        longitude: (f.longitude || '').trim()
      }
    },
    paymentInfo: {
      paymentType: "CARD",
      itemsCost: itemsCost,
      deliveryFee: deliveryFee,
      change: change,
      total: total
    },
    items: orderItems,
    persons: Number(f.persons ?? 1),
    comment: (f.comment || '').trim(),
    promos: []
  };
}

function cartScreen() {
  const st = window.appState;
  st.cart ||= { items: [] };

  const items = st.cart.items || [];
  const total = cartTotal();

  render(`
    ${header('Корзина')}
    ${items.length ? `
      <div class="list">
        ${items.map((x) => {
          const mods = (x.modifiers || []).map(m => `${m.name}${m.amount > 1 ? ` ×${m.amount}` : ''}${m.price ? ` (+${rub(m.price * (m.amount||1))})` : ''}`).join(', ');
          return `
            <div class="card">
              <div class="row" style="align-items:flex-start;gap:10px;">
                <div style="width:64px;height:64px;border-radius:12px;overflow:hidden;background:var(--bg-2);flex:0 0 auto;display:flex;align-items:center;justify-content:center;">
                  ${x.imgUrl ? `<img src="${x.imgUrl}" style="width:100%;height:100%;object-fit:cover;" alt="">` : `<div class="muted" style="font-size:11px;">нет фото</div>`}
                </div>
                <div style="min-width:0;flex:1;">
                  <div class="citem">${x.name}</div>
                  ${mods ? `<div class="muted" style="font-size:12px;margin-top:4px;">${mods}</div>` : ``}
                  <div class="row" style="justify-content:space-between;margin-top:8px;align-items:center;">
                    <div class="stepper" data-step="${x.key}">
                      <button type="button" class="dec">−</button>
                      <div style="min-width:22px;text-align:center;">${x.quantity}</div>
                      <button type="button" class="inc">+</button>
                    </div>
                    <div style="font-weight:800;">${rub((Number(x.quantity||1) * (Number(x.price||0) + (x.modifications||[]).reduce((s,m)=>s+safeNum(m.price,0)*safeNum(m.quantity,1),0))))}</div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      
      <div class="card" style="margin-top:12px;">
        <div class="sect">Доставка</div>
        <div class="grid3">
          <label class="fld wide"><span>Адрес</span><input id="addrFull" placeholder="Город, улица, дом" /></label>
          <label class="fld"><span>Широта</span><input id="addrLat" placeholder="latitude" /></label>
          <label class="fld"><span>Долгота</span><input id="addrLon" placeholder="longitude" /></label>
        </div>
        <div class="grid4">
          <label class="fld"><span>Персон</span><input id="persons" type="number" min="0" /></label>
          <label class="fld"><span>Доставка, ₽</span><input id="deliveryFee" type="number" min="0" /></label>
          <label class="fld"><span>Сдача, ₽</span><input id="change" type="number" min="0" /></label>
          <label class="fld"><span>eatsId (необяз.)</span><input id="eatsId" /></label>
        </div>
        <label class="fld"><span>Комментарий</span><textarea id="comment" placeholder="Комментарий к заказу"></textarea></label>
        <div class="hint">Время доставки (deliveryDate) ставится автоматически: текущее время + 2 часа.</div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div class="row" style="justify-content:space-between;align-items:center;">
          <div class="muted">Итого</div>
          <div class="bigsum">${rub(total)}</div>
        </div>
        <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="clearCart" type="button">Очистить корзину</button>
          <button id="showOrderJson" type="button">JSON заказа</button>
          <button id="downloadOrderJson" type="button">Скачать JSON</button>
          <button id="checkoutBtn" type="button" class="primary" disabled>Отправить заказ</button>
        </div>
      </div>
    ` : `
      <div class="empty">Корзина пуста. Добавьте позиции из меню.</div>
    `}
  `);

  wireBackButton();

  st.orderForm ||= {};
  const f = st.orderForm;
  const setVal=(id,v)=>{const el=document.getElementById(id); if(el) el.value = v ?? '';};
  setVal('addrFull', f.addressFull || '');
  setVal('addrLat', f.latitude || '');
  setVal('addrLon', f.longitude || '');
  setVal('persons', f.persons ?? 1);
  setVal('deliveryFee', f.deliveryFee ?? 0);
  setVal('change', f.change ?? 0);
  setVal('eatsId', f.eatsId || '');
  setVal('comment', f.comment || '');
  const bind=(id,key)=>{const el=document.getElementById(id); if(!el) return; el.oninput=()=>{f[key]=el.value;};};
  bind('addrFull','addressFull');
  bind('addrLat','latitude');
  bind('addrLon','longitude');
  bind('persons','persons');
  bind('deliveryFee','deliveryFee');
  bind('change','change');
  bind('eatsId','eatsId');
  bind('comment','comment');
  const showBtn=document.getElementById('showOrderJson');
  if(showBtn) showBtn.onclick=()=>{const payload=buildOrderPayload(); openJsonDialog(payload);};
  const dlBtn=document.getElementById('downloadOrderJson');
  if(dlBtn) dlBtn.onclick=()=>{const payload=buildOrderPayload(); const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='order.json'; a.click(); URL.revokeObjectURL(a.href);};

  const checkoutBtn = document.getElementById('checkoutBtn');
  const validateOrderForm = () => {
    const p = buildOrderPayload();
    const addr = p.deliveryInfo?.deliveryAddress || {};
    const addrOk = String(addr.full || '').trim() && String(addr.latitude || '').trim() && String(addr.longitude || '').trim();
    const restOk = String(p.restaurantId || '').trim().length > 0;
    const itemsOk = Array.isArray(p.items) && p.items.length > 0;
    return { ok: !!(addrOk && restOk && itemsOk), payload: p };
  };

  const vv0 = validateOrderForm();
  if (checkoutBtn) checkoutBtn.disabled = !vv0.ok;

  const watchIds = ['addrFull','addrLat','addrLon','persons','deliveryFee','change','eatsId','comment'];
  for (const id of watchIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    const prev = el.oninput;
    el.oninput = (e) => { if (prev) prev(e); const vv = validateOrderForm(); if (checkoutBtn) checkoutBtn.disabled = !vv.ok; };
  }

  if (checkoutBtn) checkoutBtn.onclick = async () => {
    const vv = validateOrderForm();
    if (!vv.ok) {
      try { tg().showPopup?.({ title: 'Не готово', message: 'Заполни адрес (full + lat/lon) и добавь позиции в корзину.', buttons: [{ id:'ok', type:'ok', text:'OK'}] }); } catch(_) {}
      return;
    }
    try {
      checkoutBtn.disabled = true;
      const prevText = checkoutBtn.textContent;
      checkoutBtn.textContent = 'Отправляем...';
      const res = await createOrder(vv.payload);
      const id = res?.orderId || res?.id || res?.eatsId || '';
      try { tg().showPopup?.({ title: 'Отправлено', message: id ? `Заказ создан: ${id}` : 'Заказ создан успешно.', buttons: [{ id:'ok', type:'ok', text:'OK'}] }); } catch(_) {}
      window.appState.cart = { items: [] };
      saveCart(window.appState.cart);
      rerender();
    } catch (e) {
      const msg = (e && (e.message || e.error?.message || JSON.stringify(e))) || 'Ошибка';
      try { tg().showPopup?.({ title: 'Ошибка', message: msg, buttons: [{ id:'ok', type:'ok', text:'OK'}] }); } catch(_) {}
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Отправить заказ';
    }
  };


  for (const x of items) {
    const el = document.querySelector(`[data-step="${x.key}"]`);
    if (!el) continue;
    el.querySelector('.dec').onclick = () => updateCartItemQty(x.key, Number(x.quantity) - 1), rerender();
    el.querySelector('.inc').onclick = () => updateCartItemQty(x.key, Number(x.quantity) + 1), rerender();
  }

  const clearBtn = document.getElementById('clearCart');
  if (clearBtn) clearBtn.onclick = () => { st.cart = { items: [] }; saveCart(st.cart); rerender(); };
}

async function availabilityScreen() {
  const st = window.appState;
  if (!st.restaurant?.id) {
    setScreen('restaurants', { pushHistory: false });
    return;
  }

  render(`${header('Недоступные позиции')}<div class="muted">Загрузка…</div>`);
  wireBackButton();

  try {
    const restaurantId = st.restaurant.id;

    // Берём и composition, чтобы показать “человеческие” карточки (имя/фото/цена),
    // а также нормализуем упакованный ответ availability ({data:"{...}"}).
    const [rawAvail0, rawComp] = await Promise.all([
      getAvailability(restaurantId),
      getMenuComposition(restaurantId).catch(() => null),
    ]);

    const rawAvail = normalizeAvailabilityResponse(rawAvail0);
    const menu = rawComp ? normalizeMenuResponse(rawComp) : { categories: [], items: [] };
    const itemById = new Map((menu.items || []).map((it) => [String(it.id), it]));

    const items = rawAvail?.items || [];
    const modifiers = rawAvail?.modifiers || [];

    render(`
      ${header('Недоступные позиции')}

      <div class="menu-toolbar">
        <span class="badge">items: ${items.length}</span>
        <span class="badge">modifiers: ${modifiers.length}</span>
        <button id="btnJson" type="button">JSON</button>
        <button id="btnDownload" type="button">Скачать JSON</button>
      </div>

      <div id="availRoot"></div>

      <dialog id="jsonDialog">
        <div class="dlg">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <div style="font-weight:650;">JSON</div>
            <form method="dialog"><button type="submit">Закрыть</button></form>
          </div>
          <div class="hr"></div>
          <pre id="jsonPre"></pre>
        </div>
      </dialog>


      <dialog id="itemDialog"></dialog>
    `);

    wireBackButton();

    const root = document.getElementById('availRoot');

    function renderCards() {
      if (!items.length) {
        root.innerHTML = `<div class="card"><div class="muted">Нет недоступных позиций</div></div>`;
        return;
      }

      const cards = items.map((x) => {
        const rawId = String(x.itemId);
        const variants = stopIdVariants(rawId);
        const matchedId = variants.find((v) => itemById.has(String(v))) || null;
        const it = matchedId ? itemById.get(String(matchedId)) : null;

        const imgUrl = it?.images?.[0]?.url || it?.images?.[0] || '';
        const desc = (it?.description || '').trim();
        const weight = it?.measure != null
          ? `${it.measure} ${it.measureUnit || ''}`.trim()
          : (it?.weight ? `${it.weight}` : '');

        return `
          <div class="menu-card is-disabled">
            <div class="menu-img">
              ${imgUrl ? `<img src="${imgUrl}" alt="">` : `<div class="menu-noimg">нет фото</div>`}
            </div>
            <div class="menu-body">
              <div class="menu-title">${(it?.name || '').trim() || rawId}</div>
              <div class="menu-desc">${desc || '&nbsp;'}</div>
              <div class="menu-meta">
                <span class="muted">${weight}</span>
                <b>${it?.price != null ? rub(it.price) : ''}</b>
              </div>
              <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <span class="badge">stock: ${x.stock}</span>
                <span class="muted" style="font-size:12px;">id: <code>${rawId}</code></span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      root.innerHTML = `<div class="menu-grid">${cards}</div>`;
    }

    renderCards();

    document.getElementById('btnJson').onclick = () => openJsonDialog({ availability: rawAvail, menu });
    document.getElementById('btnDownload').onclick = () => downloadJson(rawAvail, `availability_${restaurantId}.json`);
  } catch (e) {
    render(`${header('Недоступные позиции')}<pre>${JSON.stringify(e, null, 2)}</pre>`);
    wireBackButton();
  }
}

// ---- Rerender ----
function rerender() {
  ensureStyles();

  const st = window.appState;

  // hydrate from storage once
  st.auth ||= loadAuth();
  st.restaurant ||= loadRestaurant();

  if (!st.auth?.accessToken) {
    st.screen = 'auth';
  } else if (!st.restaurant?.id && st.screen !== 'restaurants') {
    st.screen = 'restaurants';
  }

  if (st.screen === 'auth') return authScreen();
  if (st.screen === 'restaurants') return restaurantsScreen();
  if (st.screen === 'hub') return hubScreen();
  if (st.screen === 'menu') return menuScreen();
  if (st.screen === 'availability') return availabilityScreen();
  if (st.screen === 'cart') return cartScreen();

  // fallback
  st.screen = 'auth';
  authScreen();
}

// ---- Bootstrap (idempotent) ----
function bootstrap() {
  if (window.__iikoBootstrapped) {
    rerender();
    return;
  }
  window.__iikoBootstrapped = true;

  // initial state hydration
  window.appState.auth = loadAuth();
  window.appState.restaurant = loadRestaurant();
  window.appState.cart = loadCart();
  window.appState.screen = window.appState.auth?.accessToken ? (window.appState.restaurant?.id ? 'hub' : 'restaurants') : 'auth';

  // Telegram: expand UI
  try { tg()?.ready?.(); tg()?.expand?.(); } catch (_) {}

  rerender();
}

bootstrap();

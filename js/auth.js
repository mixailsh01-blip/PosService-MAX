/* ==================== AUTH MODULE ==================== */
/* Отвечает за авторизацию, кэширование, обновление UI */

const Auth = {
  tg: window.WebApp ?? window.Telegram?.WebApp ?? null,

  /**
   * Показывает индикатор загрузки
   */
  showLoading() {
    // Создаём оверлей загрузки
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        flex-direction: column;
        color: white;
        font-family: 'PT Root UI', sans-serif;
      `;

      const spinner = document.createElement('div');
      spinner.style.cssText = `
        width: 40px;
        height: 40px;
        border: 4px solid #333;
        border-top: 4px solid #00c8ff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
      `;

      const text = document.createElement('div');
      text.textContent = 'Загрузка данных...';
      text.style.cssText = `
        font-size: 16px;
        font-weight: 500;
      `;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;

      overlay.appendChild(spinner);
      overlay.appendChild(text);
      overlay.appendChild(style);
      document.body.appendChild(overlay);
    }

    overlay.style.display = 'flex';
  },

  /**
   * Скрывает индикатор загрузки
   */
  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  },

  applyPermissions() {
    const p = window.userPermissions || {};

    // Скрываем/показываем вкладку Счета
    const accountsBtn = document.querySelector('.nav-btn[data-page="accounts"]');
    if (accountsBtn) {
      accountsBtn.style.display = p.счета ? '' : 'none';
    }

    // Кнопка "Заведения" в профиле — заменяем на "Запросить доступ" если нет доступа
    console.warn('🔐 applyPermissions — просмотрСотрудников:', p.просмотрСотрудников, '| full perms:', JSON.stringify(p, (k,v) => v instanceof Set ? [...v] : v));
    const estBtn = document.getElementById('profile-establishments-btn');
    if (estBtn) {
      // false = явно запрещено; undefined = права ещё не пришли, не трогаем
      if (p.просмотрСотрудников === false) {
        estBtn.textContent = 'Запросить доступ';
        estBtn.disabled = false;
        estBtn.classList.add('btn-request-access');
      } else {
        estBtn.textContent = 'Заведения';
        estBtn.disabled = false;
        estBtn.classList.remove('btn-request-access');
      }
    }

    // Рендерим список заведений на странице Счета
    const accountsPage = document.getElementById('accounts');
    if (!accountsPage) return;

    const список = p.счетаЗаведения ?? [];
    if (список.length === 0) {
      accountsPage.innerHTML = `<div class="accounts-placeholder">Нет доступных заведений для просмотра счетов.</div>`;
      return;
    }

    const items = список.map(з => `
      <button class="accounts-establishment-btn" data-id="${escapeHtml(String(з.id))}" data-name="${escapeHtml(з.name)}">
        <span class="accounts-establishment-name">${escapeHtml(з.name)}</span>
        <i class="fas fa-chevron-right accounts-establishment-arrow"></i>
      </button>`).join('');

    accountsPage.innerHTML = `
      <div class="accounts-header">
        <span class="accounts-title">Счета</span>
      </div>
      <div class="accounts-establishment-list">${items}</div>
      <div class="accounts-coming-soon">Раздел счетов в разработке.</div>`;
  },

  /**
   * Обновляет профиль и рестораны на основе данных из хука
   * @param {Object} userData - Данные пользователя из ответа хука
   */
  updateProfile(userData) {
    const firstName = userData.first_name || userData.name || '';
    const lastName = userData.last_name || userData.family || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Без имени';

    const userFullname = document.getElementById('user-fullname');
    const userName = document.getElementById('user-name');
    
    if (userFullname) userFullname.textContent = fullName;
    if (userName) userName.textContent = firstName || 'Гость';

    // Обновляем телефон
    const phone = userData.phone || userData.phone_number || userData.Nubmer || userData.Number || null;
    const userPhone = document.getElementById('user-phone');
    const shareContactBtn = document.getElementById('share-contact-btn');

    if (phone && userPhone) {
      userPhone.textContent = formatPhoneNumber(phone);
      if (shareContactBtn) shareContactBtn.classList.add('hidden');
    }

    this.updateRestaurants(userData.restaurants);
  },

  /**
   * Обновляет выпадающий список ресторанов
   * @param {string|Array} restaurantsData - JSON-строка или массив с ресторанами
   */
  updateRestaurants(restaurantsData) {
    try {
      let restaurants = [];
      
      // Обработка разных форматов данных
      if (typeof restaurantsData === 'string') {
        restaurants = JSON.parse(restaurantsData);
      } else if (Array.isArray(restaurantsData)) {
        restaurants = restaurantsData;
      } else {
        console.warn('⚠️ [Auth] Некорректный формат данных ресторанов');
        return;
      }
      
      const dropdown = document.getElementById('main-dropdown');
      
      if (!dropdown || !Array.isArray(restaurants)) return;

      const normalizedRestaurants = restaurants
        .map((restaurant) => {
          const id = restaurant?.id ?? restaurant?.ID ?? restaurant?.Id ?? null;
          const name = restaurant?.name ?? restaurant?.Client ?? restaurant?.client ?? null;
          if (!id || !name) return null;
          return { id: String(id), name: String(name) };
        })
        .filter(Boolean);

      const existingRestaurants = Array.from(dropdown.options)
        .map((option) => ({
          id: String(option.value || '').trim(),
          name: String(option.textContent || '').trim()
        }))
        .filter((restaurant) => restaurant.id && restaurant.name && restaurant.name !== 'Выберите заведение');

      const seenRestaurants = new Set();
      const mergedRestaurants = [...existingRestaurants, ...normalizedRestaurants].filter((restaurant) => {
        const key = `${restaurant.id}::${restaurant.name}`;
        if (seenRestaurants.has(key)) return false;
        seenRestaurants.add(key);
        return true;
      });

      // Очищаем текущие опции (кроме placeholder)
      dropdown.innerHTML = '<option value="">Выберите заведение</option>';

      // Добавляем рестораны в dropdown главной страницы
      mergedRestaurants.forEach((restaurant) => {
        const option = document.createElement('option');
        option.value = restaurant.id;
        option.textContent = restaurant.name;
        dropdown.appendChild(option);
      });

      // Обновляем фильтр "Заведение" на вкладке заявок
      const filterSelect = document.getElementById('filter-establishment');
      if (filterSelect) {
        const previousValue = filterSelect.value;
        filterSelect.innerHTML = '<option value="">Все заведения</option>';
        mergedRestaurants.forEach((restaurant) => {
          const option = document.createElement('option');
          option.value = restaurant.name;
          option.textContent = restaurant.name;
          option.dataset.establishmentId = restaurant.id;
          filterSelect.appendChild(option);
        });
        if (previousValue && Array.from(filterSelect.options).some(o => o.value === previousValue)) {
          filterSelect.value = previousValue;
        }
      }

      // Обновляем список в модалке "Ваши заведения"
      const list = document.querySelector('#establishment-modal .establishment-list');
      if (list) {
        list.innerHTML = '';
        mergedRestaurants.forEach((restaurant) => {
          const button = document.createElement('button');
          button.className = 'establishment-item btn-RestModal w-full';
          button.dataset.establishmentId = restaurant.id;
          button.dataset.establishmentName = restaurant.name;
          button.type = 'button';
          button.innerHTML = `
            <span class="establishment-item__label">${escapeHtml(restaurant.name)}</span>
            <span class="establishment-item__actions">
              <span class="establishment-item__share" data-establishment-share="true" role="button" tabindex="0" aria-label="Поделиться ${escapeHtml(restaurant.name)}">
                <i class="fas fa-share-nodes" aria-hidden="true"></i>
              </span>
            </span>
          `;
          list.appendChild(button);
        });
      }

      console.log(`✅ [Auth] Загружено ${mergedRestaurants.length} ресторанов`);

    } catch (error) {
      console.error('❌ [Auth] Ошибка парсинга ресторанов:', error);
    }
  },

  /**
   * Основной процесс авторизации
   * @param {Object} userData - Данные пользователя из MAX/Telegram Bridge
   * @param {Function} onReady - Callback, вызываемый после завершения авторизации (всегда!)
   */
  async authorize(userData, onReady = null) {
    if (!userData?.id) {
      console.warn('⚠️ [Auth] Нет ID пользователя для авторизации');
      this.hideLoading(); // На всякий случай скрываем индикатор
      if (onReady) onReady();
      return;
    }

    // Показываем индикатор загрузки
    this.showLoading();

    try {
      if (!window.API) {
        console.error('❌ [Auth] Модуль API не загружен');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Ждём 2 сек для UX
        if (onReady) onReady();
        return;
      }

      const result = await window.API.authorize(userData);
      if (!result) {
        console.warn('⚠️ [Auth] Нет ответа от сервера');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (onReady) onReady();
        return;
      }

      const responseItems = Array.isArray(result) ? result : [result];

      // Находим текущего пользователя по ID (старый формат)
      let currentUser = responseItems.find(item =>
        String(item?.id ?? item?.user_id ?? '') === String(userData.id)
      );

      // Новый формат lk-ps: [{ Nubmer, Client, ID }]
      // Если user не найден по id, трактуем ответ как список заведений и профильные поля.
      if (!currentUser && responseItems.length > 0) {
        const fallbackRestaurants = [];
        const seenRestaurants = new Set();

        responseItems.forEach((item) => {
          const indexes = new Set();

          Object.keys(item || {}).forEach((key) => {
            const match = key.match(/^IDRestoran(\d+)$/i);
            if (match) indexes.add(match[1]);
          });

          indexes.forEach((index) => {
            const id =
              item?.[`IDRestoran${index}`] ??
              item?.[`id_restoran${index}`] ??
              item?.[`idrestoran${index}`] ??
              null;
            const name =
              item?.[`Restoran${index}`] ??
              item?.[`restoran${index}`] ??
              null;

            if (!id || !name) return;

            const key = `${id}::${name}`;
            if (seenRestaurants.has(key)) return;
            seenRestaurants.add(key);
            fallbackRestaurants.push({ id: String(id), name: String(name) });
          });

          if (indexes.size > 0) return;

          const id =
            item?.IDRestoran1 ??
            item?.id_restoran1 ??
            item?.IDRestoran ??
            item?.id_restoran ??
            item?.ID ??
            item?.id ??
            item?.Id ??
            null;
          const name =
            item?.Restoran1 ??
            item?.restoran1 ??
            item?.Restoran ??
            item?.restoran ??
            item?.Client ??
            item?.client ??
            item?.name ??
            null;

          if (!id || !name) return;

          const key = `${id}::${name}`;
          if (seenRestaurants.has(key)) return;
          seenRestaurants.add(key);
          fallbackRestaurants.push({ id: String(id), name: String(name) });
        });

        currentUser = {
          name: userData.first_name || '',
          last_name: userData.last_name || '',
          phone: responseItems[0]?.Nubmer ?? responseItems[0]?.Number ?? null,
          restaurants: fallbackRestaurants
        };
      }

      if (!currentUser) {
        console.warn('⚠️ [Auth] Пользователь не найден в ответе');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (onReady) onReady();
        return;
      }

      // Обновляем профиль
      this.updateProfile(currentUser);
      console.log('✅ [Auth] Профиль успешно обновлён');

      // Загружаем права пользователя
      if (userData?.id && window.API?.getPersonRights) {
        const права = await window.API.getPersonRights(userData.id);
        window.userPermissions = права ? {
          счета:               права['Счета']                       === 'Да',
          анонимныеЗаявки:     права['Анонимные заявки']            === 'Да',
          редактированиеПрав:  права['Редактирование прав доступа'] === 'Да',
        } : { счета: true, анонимныеЗаявки: false, редактированиеПрав: false };
        console.log('🔐 [Auth] Права:', window.userPermissions);
        this.applyPermissions();
      }

      // Ждём 2 секунды для плавности
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error('❌ [Auth] Ошибка авторизации:', error);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Всё равно ждём 2 сек
    } finally {
      // ВСЕГДА скрываем индикатор и вызываем onReady
      this.hideLoading();
      if (onReady) onReady(); // ← ЭТО КРИТИЧЕСКИ ВАЖНО
    }
  }
}; // Добавлена закрывающая фигурная скобка

// Экспортируем модуль
window.Auth = Auth;

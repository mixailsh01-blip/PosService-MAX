/* ==================== Логирование ==================== */
const tg = window.WebApp ?? window.Telegram?.WebApp ?? null;
const user = tg?.initDataUnsafe?.user;
const platformName = window.WebApp ? 'max' : (window.Telegram?.WebApp ? 'telegram' : 'web');

const BOT_DEEP_LINK_BASE = 'https://max.ru/id501305283158_bot?startapp=';

const showPlatformPopup = (title, message) => {
  if (typeof tg?.showAlert === 'function') {
    tg.showAlert(message);
    return;
  }

  alert(title ? `${title}\n\n${message}` : message);
};

const handleGlobalError = (message, source, lineno) => {
  showPlatformPopup('Ошибка', `${message} (строка ${lineno})`);
  return true;
};

window.onerror = handleGlobalError;

if (tg) {
  if (typeof tg.expand === 'function') tg.expand();
}

/* ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================== */

const getGreetingByTime = () => {
  const hours = new Date().getHours();
  if (hours >= 5 && hours < 12) return "Доброе утро";
  if (hours >= 12 && hours < 17) return "Добрый день";
  if (hours >= 17 && hours < 23) return "Добрый вечер";
  return "Доброй ночи";
};

const getAvatarFallbackSrc = (person = null) => {
  const firstName = person?.first_name || person?.name || '';
  const lastName = person?.last_name || person?.family || '';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim().toUpperCase() || 'PS';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="48" fill="#252525"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="PT Root UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#f2f2f2">${initials}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const getUserPhotoUrl = (person = null) => {
  const rawPhoto = person?.photo_url ?? person?.photo ?? person?.avatar_url ?? person?.avatar ?? null;
  if (typeof rawPhoto !== 'string') return null;

  const normalizedPhoto = rawPhoto.trim();
  if (!normalizedPhoto) return null;

  if (/^(https?:|data:|blob:|\/)/i.test(normalizedPhoto)) {
    return normalizedPhoto;
  }

  return null;
};

/* ==================== РАБОТА С ДАННЫМИ ПОЛЬЗОВАТЕЛЯ ==================== */

const initializeUserData = () => {
  const greeting = getGreetingByTime();
  const userAvatar = document.getElementById('user-avatar');
  
  // Получаем имя пользователя сразу из Bridge-данных
  let displayName = 'Гость';
  if (user?.first_name) {
    displayName = user.first_name;
  }

  // Устанавливаем имя сразу, без "Загрузка..."
  document.querySelector('#welcome-screen p').innerHTML = `${greeting}, <span id="user-name">${displayName}</span>`;

  if (userAvatar) {
    const fallbackAvatar = getAvatarFallbackSrc(user);
    userAvatar.onerror = () => {
      userAvatar.onerror = null;
      userAvatar.src = fallbackAvatar;
    };
    userAvatar.src = getUserPhotoUrl(user) || fallbackAvatar;
  }

  // Остальная логика остаётся без изменений — обновление аватара, телефона и т.д.
  if (user) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени';
    document.getElementById('user-fullname').textContent = fullName;

    const phoneNumber = user.phone_number || user.phone || null;
    if (phoneNumber) {
      document.getElementById('user-phone').textContent = formatPhoneNumber(phoneNumber);
    } else {
      document.getElementById('user-phone').textContent = '+7 (XXX)-XXX-XXXX';
      document.getElementById('share-contact-btn')?.classList.remove('hidden');
    }
  }
};

/* ==================== РАБОТА С КАМЕРОЙ ==================== */

const checkCameraPermission = async () => {
  try {
    if (!navigator.permissions) {
      return true;
    }
    const permission = await navigator.permissions.query({ name: 'camera' });
    return permission.state === 'granted' || permission.state === 'prompt';
  } catch (error) {
    console.warn('Не удалось проверить разрешения камеры:', error);
    return true;
  }
};

const openCameraForRestaurant = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Камера не поддерживается этим браузером или протоколом (нужен https)');
    }

    const hasPermission = await checkCameraPermission();
    if (!hasPermission && !confirm('Для добавления заведения требуется доступ к камере. Разрешить?')) {
      throw new Error('Доступ к камере запрещен пользователем');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });

    handleCameraStream(stream);

  } catch (error) {
    console.error('Ошибка при открытии камеры:', error);
    
    let errorMessage = 'Не удалось открыть камеру. ';
    
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        errorMessage += 'Доступ к камере запрещен. Пожалуйста, разрешите доступ в настройках браузера.';
        break;
      case 'NotFoundError':
      case 'OverconstrainedError':
        errorMessage += 'Камера не найдена или недоступна.';
        break;
      case 'NotReadableError':
        errorMessage += 'Камера занята другим приложением.';
        break;
      case 'AbortError':
        errorMessage += 'Операция была прервана.';
        break;
      default:
        errorMessage += error.message || 'Произошла неизвестная ошибка.';
    }
    
    alert(errorMessage);
  }
};

const handleCameraStream = (stream) => {
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    const cameraContainer = document.createElement('div');
    cameraContainer.id = 'camera-container';
    cameraContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #000;
      z-index: 2000;
      display: flex;
      flex-direction: column;
    `;
    
    video.style.cssText = `
      flex: 1;
      object-fit: cover;
      width: 100%;
    `;
    
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = `
      display: flex;
      justify-content: center;
      padding: 20px;
      gap: 16px;
      background: rgba(0,0,0,0.7);
    `;

    const hint = document.createElement('div');
    hint.textContent = 'Наведите камеру на QR-код';
    hint.style.cssText = `
      color: #ffffff;
      font-size: 14px;
      opacity: 0.8;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Закрыть';
    closeBtn.style.cssText = `
      background: #333;
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 84%;
      font-size: 16px;
      cursor: pointer;
    `;
    
    closeBtn.addEventListener('click', () => closeCamera(stream));
    
    controlsDiv.appendChild(hint);
    controlsDiv.appendChild(closeBtn);
    cameraContainer.appendChild(video);
    cameraContainer.appendChild(controlsDiv);
    
    document.body.appendChild(cameraContainer);

    // Запускаем сканирование QR-кода
    startQrScanner(video, stream);
    
  } catch (error) {
    console.error('Ошибка при создании интерфейса камеры:', error);
    closeCamera(stream);
    alert('Не удалось открыть интерфейс камеры');
  }
};

const startQrScanner = (video, stream) => {
  try {
    if (typeof jsQR === 'undefined') {
      console.error('Библиотека jsQR не загружена');
      alert('Не удалось запустить сканер QR-кода.');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scan = () => {
      // Если камера уже закрыта, выходим
      if (!document.getElementById('camera-container')) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code && code.data) {
          handleQrResult(code.data, stream);
          return;
        }
      }

      requestAnimationFrame(scan);
    };

    requestAnimationFrame(scan);
  } catch (error) {
    console.error('Ошибка работы сканера QR:', error);
    alert('Не удалось запустить сканирование QR-кода');
  }
};

const handleQrResult = async (data, stream) => {
  try {
    console.log('QR-код распознан:', data);
    closeCamera(stream);

    if (window.API?.sendQrData) {
      const result = await window.API.sendQrData(data, user);
      const restaurants = normalizeRestaurantsFromQrResponse(result);
      if (restaurants.length > 0) {
        applyRestaurants(restaurants);
        alert('Заведение привязано: ' + restaurants[0].name);
        return restaurants;
      }

      console.warn('QR отправлен, но заведение не получено. Ответ вебхука:', result);
      alert('QR отправлен, но заведение не получено');
      return [];
    }

    alert('QR-код распознан: ' + data);
    return [];
  } catch (error) {
    console.error('Ошибка обработки результата QR:', error);
    alert('Не удалось обработать QR-код');
    return [];
  }
};

const normalizeRestaurantsFromQrResponse = (result) => {
  if (!result) return [];
  const items = Array.isArray(result) ? result : [result];

  return items
    .map((item) => {
      const name = item?.Client ?? item?.client ?? item?.name ?? null;
      const id = item?.ID ?? item?.id ?? item?.Id ?? null;
      if (!name || !id) return null;
      return { id: String(id), name: String(name) };
    })
    .filter(Boolean);
};

const mergeRestaurants = (...restaurantGroups) => {
  const seen = new Set();

  return restaurantGroups
    .flat()
    .map((restaurant) => {
      const id = String(restaurant?.id ?? restaurant?.ID ?? restaurant?.Id ?? '').trim();
      const name = String(restaurant?.name ?? restaurant?.Client ?? restaurant?.client ?? '').trim();
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((restaurant) => {
      if (!restaurant) return false;
      const key = `${restaurant.id}::${restaurant.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const loadCachedEstablishments = () => {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(ESTABLISHMENTS_CACHE_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeRestaurants(parsed) : [];
  } catch (error) {
    console.warn('Не удалось загрузить establishments cache из localStorage:', error);
    return [];
  }
};

const saveCachedEstablishments = (restaurants) => {
  try {
    localStorage.setItem(
      getScopedStorageKey(ESTABLISHMENTS_CACHE_STORAGE_KEY),
      JSON.stringify(mergeRestaurants(restaurants))
    );
  } catch (error) {
    console.warn('Не удалось сохранить establishments cache в localStorage:', error);
  }
};

const applyRestaurants = (restaurants, { replace = false } = {}) => {
  try {
    const mergedRestaurants = replace
      ? mergeRestaurants(restaurants)
      : mergeRestaurants(getKnownEstablishments(), restaurants);
    saveCachedEstablishments(mergedRestaurants);

    // Обновляем dropdown на главной (через существующую логику Auth)
    if (window.Auth?.updateRestaurants) {
      window.Auth.updateRestaurants(mergedRestaurants);
    }

    // Обновляем фильтр "Заведение" на вкладке "Заявки"
    const filterSelect = document.getElementById('filter-establishment');
    if (filterSelect) {
      const previousValue = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Все заведения</option>';

      mergedRestaurants.forEach((restaurant) => {
        const option = document.createElement('option');
        // В таблице "Заявки" заведение хранится текстом, поэтому value = name
        option.value = restaurant.name;
        option.textContent = restaurant.name;
        option.dataset.establishmentId = restaurant.id;
        filterSelect.appendChild(option);
      });

      // Пытаемся восстановить выбор, если он еще существует
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

    syncOpenTasksForKnownEstablishments();
  } catch (error) {
    console.error('Ошибка обновления заведений:', error);
  }
};

const closeCamera = (stream) => {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    const cameraContainer = document.getElementById('camera-container');
    if (cameraContainer) {
      cameraContainer.remove();
    }
    
  } catch (error) {
    console.error('Ошибка при закрытии камеры:', error);
  }
};

const handleRestaurantPhoto = (blob) => {
  try {
    console.log('Фото заведения получено, размер:', blob.size, 'байт');
    const imageUrl = URL.createObjectURL(blob);
    alert('Фото заведения успешно загружено! Теперь вы можете добавить информацию о заведении.');
    URL.revokeObjectURL(imageUrl);
  } catch (error) {
    console.error('Ошибка при обработке фото:', error);
    alert('Не удалось обработать фото заведения');
  }
};

const startAddRestaurantFlow = async () => {
  const isMaxWebApp = Boolean(window.WebApp);

  if (tg && typeof tg.openCodeReader === 'function') {
    try {
      const result = await tg.openCodeReader();
      const code = typeof result === 'string'
        ? result
        : (result?.value ?? result?.text ?? result?.data ?? null);
      if (!code) {
        console.log('QR-сканер MAX закрыт без результата', result);
        return [];
      }

      return await handleQrResult(code, null);
    } catch (error) {
      const errorText = String(
        error?.message ??
        error?.error ??
        error?.reason ??
        error ??
        ''
      ).toLowerCase();
      const isUserCancelled =
        errorText.includes('cancel') ||
        errorText.includes('closed') ||
        errorText.includes('close') ||
        errorText.includes('abort') ||
        errorText.includes('dismiss') ||
        errorText.includes('назад') ||
        errorText.includes('закры');

      if (isUserCancelled) {
        console.log('QR-сканер MAX закрыт пользователем');
        return [];
      }

      if (isMaxWebApp) {
        console.warn('Ошибка MAX Code Reader без fallback на сайт-камеру:', error);
        return [];
      }

      console.warn('Не удалось использовать MAX Code Reader, переключаемся на камеру:', error);
    }
  }

  if (isMaxWebApp) {
    return [];
  }

  const scanMethod =
    (tg && typeof tg.showScanQrPopup === 'function' && 'showScanQrPopup') ||
    (tg && typeof tg.openScanQrPopup === 'function' && 'openScanQrPopup');

  if (scanMethod) {
    return new Promise((resolve) => {
      tg[scanMethod]({ text: 'Сканируйте QR-код заведения' }, async (text) => {
        if (!text) {
          console.log('QR-сканер закрыт без результата');
          resolve([]);
          return true;
        }

        const restaurants = await handleQrResult(text, null);
        resolve(restaurants);
        return true;
      });
    });
  }

  openCameraForRestaurant();
  return [];
};

const setupAddRestaurantButton = () => {
  const addRestaurantBtn = document.querySelector('.btn-AddRestaurant');
  if (addRestaurantBtn) {
    addRestaurantBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await startAddRestaurantFlow();
    });
  }
};

const setupMarketButton = () => {
  const marketBtn = document.querySelector('.home-market-link');
  if (!marketBtn) return;
  const marketUrl = 'https://posbazar.ru/item/pos-terminaly/';
  let isNavigating = false;

  const openMarketLink = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (isNavigating) return;
    isNavigating = true;

    if (typeof tg?.openLink === 'function') {
      try {
        tg.openLink(marketUrl);
        return;
      } catch (error) {
        console.warn('Не удалось открыть ссылку через Bridge, используем fallback:', error);
      }
    }

    const openedWindow = window.open(marketUrl, '_blank', 'noopener,noreferrer');
    if (openedWindow) {
      return;
    }

    window.location.href = marketUrl;
  };

  marketBtn.addEventListener('click', openMarketLink);
  marketBtn.addEventListener('touchend', openMarketLink, { passive: false });
};

/* ==================== РАБОТА С МОДАЛЬНЫМИ ОКНАМИ ==================== */

const setupModal = () => {
  const editIcon = document.getElementById('edit-icon');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const closeModalIcon = document.getElementById('close-modal-icon');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const modal = document.getElementById('edit-modal');
  const userFullname = document.getElementById('user-fullname');

  editIcon?.addEventListener('click', () => {
    const nameParts = userFullname.textContent.split(' ');
    document.getElementById('edit-firstname').value = nameParts[0] || '';
    document.getElementById('edit-lastname').value = nameParts[1] || '';
    modal.classList.remove('hidden');
  });

  closeModalBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  closeModalIcon?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  saveProfileBtn?.addEventListener('click', () => {
    const firstName = document.getElementById('edit-firstname').value.trim();
    const lastName = document.getElementById('edit-lastname').value.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Без имени';
    userFullname.textContent = fullName;
    modal.classList.add('hidden');
    
    // Также обновляем имя в приветствии
    document.getElementById('user-name').textContent = firstName || 'Гость';
  });
};

/* ==================== РАБОТА С КОНТАКТАМИ ==================== */

const showContactShareModal = () => {
  const modal = document.getElementById('contact-share-modal');
  const progress = document.getElementById('contact-share-progress');
  const progressText = document.getElementById('contact-share-progress-text');
  const modalBtn = document.getElementById('contact-share-btn');
  if (modal) modal.classList.remove('hidden');
  progress?.classList.add('hidden');
  if (progressText) {
    progressText.textContent = 'Секунду… разработчик уже регистрирует вас в Pos Bazar 🙂';
  }
  if (modalBtn) {
    modalBtn.disabled = false;
    modalBtn.textContent = 'Поделиться номером';
  }
};

const hideContactShareModal = () => {
  const modal = document.getElementById('contact-share-modal');
  if (modal) modal.classList.add('hidden');
};

const setContactShareLoading = (enabled, message = '') => {
  const progress = document.getElementById('contact-share-progress');
  const progressText = document.getElementById('contact-share-progress-text');
  const modalBtn = document.getElementById('contact-share-btn');

  if (enabled) {
    progress?.classList.remove('hidden');
    if (progressText) {
      progressText.textContent = message || 'Секунду… разработчик уже регистрирует вас в Pos Bazar 🙂';
    }
    if (modalBtn) {
      modalBtn.disabled = true;
      modalBtn.textContent = 'Подождите...';
    }
    return;
  }

  progress?.classList.add('hidden');
  if (modalBtn) {
    modalBtn.disabled = false;
    modalBtn.textContent = 'Поделиться номером';
  }
};

const notifyRegistrClient = async (contact, meta = null) => {
  if (!window.API?.sendRegistrClient) {
    console.warn('⚠️ [registr_client] Не вызываем: API.sendRegistrClient не найден');
    showPlatformPopup('Ошибка', 'API.sendRegistrClient не найден (скрипты не обновились).');
    return null;
  }

  const phoneNumber = String(contact?.phone_number || '').trim();
  if (!phoneNumber) {
    console.warn('⚠️ [registr_client] Не вызываем: пустой phone_number');
    return null;
  }

  window.__registrClientState = window.__registrClientState || {
    inFlightPhone: '',
    inFlightPromise: null,
    completedPhones: new Set()
  };

  const registrClientState = window.__registrClientState;
  if (registrClientState.completedPhones.has(phoneNumber)) {
    console.log('⏭️ [registr_client] Повторный вызов пропущен: номер уже зарегистрирован в этой сессии', { phone_number: phoneNumber, meta });
    return { skipped: true, phone_number: phoneNumber };
  }

  if (registrClientState.inFlightPromise && registrClientState.inFlightPhone === phoneNumber) {
    console.log('⏳ [registr_client] Возвращаем текущий in-flight запрос для того же номера', { phone_number: phoneNumber, meta });
    return registrClientState.inFlightPromise;
  }

  console.log('📨 [registr_client] Вызываем вебхук...', { phone_number: phoneNumber, meta });
  registrClientState.inFlightPhone = phoneNumber;
  registrClientState.inFlightPromise = window.API.sendRegistrClient(contact, user, tg, meta);

  let result = null;
  try {
    result = await registrClientState.inFlightPromise;
    if (result) {
      registrClientState.completedPhones.add(phoneNumber);
    }
  } finally {
    registrClientState.inFlightPhone = '';
    registrClientState.inFlightPromise = null;
  }

  showPlatformPopup(
    'Контакт',
    result ? 'Номер отправлен в систему.' : 'Не удалось отправить номер. Проверьте сеть или логи.'
  );
  return result;
};

const clientSupportResponseHasId = (result) => {
  if (!result) return false;
  const items = Array.isArray(result) ? result : [result];
  return items.some((item) => item && (item.ID || item.id || item.IDClient || item.id_client || item.user_id));
};

const extractRestaurantsFromClientSupportItem = (item) => {
  if (!item || typeof item !== 'object') return [];

  const restaurants = [];
  const indexes = new Set();

  Object.keys(item).forEach((key) => {
    const match = key.match(/^IDRestoran(\d+)$/i);
    if (match) indexes.add(match[1]);
  });

  indexes.forEach((index) => {
    const id =
      item[`IDRestoran${index}`] ??
      item[`id_restoran${index}`] ??
      item[`idrestoran${index}`] ??
      null;
    const name =
      item[`Restoran${index}`] ??
      item[`restoran${index}`] ??
      null;

    if (id && name) {
      restaurants.push({ id: String(id), name: String(name) });
    }
  });

  if (restaurants.length > 0) return restaurants;

  const fallbackName =
    item?.Restoran1 ??
    item?.restoran1 ??
    item?.Restoran ??
    item?.restoran ??
    item?.Client ??
    item?.client ??
    item?.name ??
    null;
  const fallbackId =
    item?.IDRestoran1 ??
    item?.id_restoran1 ??
    item?.IDRestoran ??
    item?.id_restoran ??
    item?.ID ??
    item?.id ??
    item?.Id ??
    null;

  return fallbackId && fallbackName ? [{ id: String(fallbackId), name: String(fallbackName) }] : [];
};

const normalizeRestaurantsFromClientSupportResponse = (result) => {
  if (!result) return [];
  const items = Array.isArray(result) ? result : [result];
  const seen = new Set();

  return items
    .flatMap((item) => extractRestaurantsFromClientSupportItem(item))
    .filter((restaurant) => {
      const key = `${restaurant.id}::${restaurant.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const applyClientSupportResponse = (result) => {
  const restaurants = normalizeRestaurantsFromClientSupportResponse(result);
  if (restaurants.length > 0) {
    applyRestaurants(restaurants, { replace: true });
  }
};

const clientSupportState = {
  inFlightPromise: null,
  lastResult: null,
  lastFetchedAt: 0
};

const fetchClientSupport = async ({ force = false, cacheMs = 3000 } = {}) => {
  if (!user?.id || !window.API?.sendClientTGSupport) return null;

  const now = Date.now();
  if (!force && clientSupportState.lastResult && (now - clientSupportState.lastFetchedAt) < cacheMs) {
    return clientSupportState.lastResult;
  }

  if (clientSupportState.inFlightPromise) {
    return clientSupportState.inFlightPromise;
  }

  clientSupportState.inFlightPromise = window.API.sendClientTGSupport(user, tg);

  try {
    const result = await clientSupportState.inFlightPromise;
    clientSupportState.lastResult = result;
    clientSupportState.lastFetchedAt = Date.now();
    return result;
  } finally {
    clientSupportState.inFlightPromise = null;
  }
};

const pollClientSupportId = async ({ maxTries = 12, intervalMs = 800 } = {}) => {
  if (!user?.id || !window.API?.sendClientTGSupport) return false;

  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    try {
      const result = await fetchClientSupport({ force: true, cacheMs: 0 });
      applyClientSupportResponse(result);
      if (clientSupportResponseHasId(result)) return true;
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return false;
};

const hasAuthorizedClientAccess = async () => {
  if (!user?.id || !window.API?.sendClientTGSupport) return false;
  try {
    const result = await fetchClientSupport();
    applyClientSupportResponse(result);
    return clientSupportResponseHasId(result);
  } catch (error) {
    console.error('❌ Ошибка проверки clientTG_support:', error);
    return false;
  }
};

const normalizeContactData = (raw) => {
  if (!raw) return null;
  const source = raw?.response?.contact ?? raw?.contact ?? raw?.user ?? raw?.response ?? raw;

  const phone =
    source?.phone_number ??
    source?.phone ??
    source?.phoneNumber ??
    raw?.phone_number ??
    raw?.phone ??
    raw?.phoneNumber ??
    null;

  const firstName =
    source?.first_name ??
    source?.firstName ??
    raw?.first_name ??
    raw?.firstName ??
    user?.first_name ??
    null;

  const lastName =
    source?.last_name ??
    source?.lastName ??
    raw?.last_name ??
    raw?.lastName ??
    user?.last_name ??
    null;

  const userId =
    source?.id ??
    source?.user_id ??
    source?.userId ??
    raw?.id ??
    raw?.user_id ??
    raw?.userId ??
    user?.id ??
    null;

  return {
    phone_number: phone,
    first_name: firstName,
    last_name: lastName,
    user_id: userId
  };
};

const setupContactSharing = () => {
  const shareBtn = document.getElementById('share-contact-btn');
  const modalBtn = document.getElementById('contact-share-btn');

  const requestPlatformContact = () => {
    if (typeof tg?.requestContact !== 'function') {
      return Promise.reject(new Error('Метод requestContact не поддерживается'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      try {
        const maybePromise = tg.requestContact((value) => finishResolve(value));
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finishResolve).catch(finishReject);
          return;
        }

        if (maybePromise !== undefined) {
          finishResolve(maybePromise);
        }
      } catch (error) {
        finishReject(error);
      }
    });
  };

  const requestContactAndUpdate = async () => {
    console.log('📤 Запрашиваем контакт...');

    if (typeof tg?.requestContact !== 'function') {
      showContactError('Метод requestContact не поддерживается');
      return;
    }

    try {
      const result = await requestPlatformContact();
      console.log('📥 Результат requestContact:', result);

      if (!result) {
        console.warn('⚠️ Контакт не предоставлен');
        showContactError('Контакт не был предоставлен. Попробуйте еще раз.');
        return;
      }

      if (result === true) {
        console.log('✅ Контакт запрошен, пытаемся получить данные...');
        setContactShareLoading(true, 'Секунду… разработчик уже регистрирует вас в Pos Bazar 🙂');

        let attemptsLeft = 6;
        const tryReadInitData = () => {
          const initData = tg?.initDataUnsafe;
          console.log(`🔍 initDataUnsafe (попытка ${7 - attemptsLeft}/6):`, initData);

          const normalized = normalizeContactData(initData?.user);
          if (normalized?.phone_number) {
            console.log('✅ Получен контакт через initDataUnsafe');
            updateContactInfo(normalized);
            notifyRegistrClient(normalized, { stage: 'initDataUnsafe_user_phone_number' }).then((registrResult) => {
              if (registrResult) {
                requestDeepLinkState.awaitingAuthorization = false;
                runPendingAuthorizedActionNow();
              }
            });
            hideContactShareModal();
            return;
          }

          attemptsLeft -= 1;
          if (attemptsLeft <= 0) {
            console.warn('⚠️ Контакт запрошен, но phone_number не появился в initDataUnsafe');
            setContactShareLoading(false);
            if (requestDeepLinkState.awaitingAuthorization && requestDeepLinkState.type === 'add_restaurant') {
              showContactError('Не удалось получить номер телефона для регистрации. Нажмите еще раз.');
            } else {
              showContactInfo('Контакт отправлен в MAX. Если номер не обновился, попробуйте еще раз.');
            }
            return;
          }

          setTimeout(tryReadInitData, 400);
        };

        setTimeout(tryReadInitData, 300);
        return;
      }

      if (typeof result === 'object') {
        console.log('✅ Получен контакт напрямую');
        const normalized = normalizeContactData(result);
        if (!normalized?.phone_number) {
          console.warn('⚠️ Не удалось извлечь phone_number из объекта контакта:', result);
          showContactError('Не удалось получить номер телефона. Попробуйте еще раз.');
          return;
        }
        updateContactInfo(normalized);
        const registrResult = await notifyRegistrClient(normalized, { stage: 'requestContact_object' });
        hideContactShareModal();
        if (registrResult) {
          requestDeepLinkState.awaitingAuthorization = false;
          await runPendingAuthorizedActionNow();
        }
        return;
      }

      if (typeof result === 'string') {
        try {
          const contact = parseContactString(result);
          if (contact) {
            console.log('✅ Получен контакт из строки');
            const normalized = normalizeContactData(contact);
            if (!normalized?.phone_number) {
              console.warn('⚠️ Не удалось извлечь phone_number из строки контакта:', contact);
              showContactError('Не удалось получить номер телефона. Попробуйте еще раз.');
              return;
            }
            updateContactInfo(normalized);
            const registrResult = await notifyRegistrClient(normalized, { stage: 'requestContact_string' });
            hideContactShareModal();
            if (registrResult) {
              requestDeepLinkState.awaitingAuthorization = false;
              await runPendingAuthorizedActionNow();
            }
          } else {
            console.warn('⚠️ Не удалось распарсить строку контакта:', result);
          }
        } catch (e) {
          console.error('❌ Ошибка парсинга строки контакта:', e);
        }
        return;
      }

      showContactError('Не удалось обработать ответ MAX Bridge при запросе контакта.');
    } catch (error) {
      console.error('❌ Ошибка requestContact:', error);
      showContactError(error?.message || 'Не удалось запросить номер телефона.');
    }
  };

  shareBtn?.addEventListener('click', requestContactAndUpdate);
  modalBtn?.addEventListener('click', requestContactAndUpdate);
};

// Функция для парсинга строки контакта
const parseContactString = (contactString) => {
  try {
    // Попытка 1: URL-параметры
    const urlParams = new URLSearchParams(contactString);
    const contactParam = urlParams.get('contact');
    
    if (contactParam) {
      const decodedContact = decodeURIComponent(contactParam);
      return JSON.parse(decodedContact);
    }
    
    // Попытка 2: Прямой JSON
    return JSON.parse(contactString);
  } catch (e) {
    console.warn('Не удалось распарсить как JSON:', e);
    return null;
  }
};

// Функция для показа ошибки
const showContactError = (message) => {
  showPlatformPopup('Ошибка', message);
  console.error('❌ Ошибка получения контакта:', message);
};

// Функция для показа информационного сообщения
const showContactInfo = (message) => {
  showPlatformPopup('Информация', message);
  console.log('ℹ️ Информация:', message);
};

// Отдельная функция для обновления контактной информации
const updateContactInfo = (contact) => {
  console.log('✅ Обновляем контактную информацию:', contact);
  
  // Проверяем наличие номера телефона
  if (!contact?.phone_number) {
    console.warn('⚠️ Номер телефона отсутствует в данных контакта');
    showContactError('Номер телефона не найден в данных контакта');
    return;
  }
  
  // Обновляем номер телефона в профиле
  const userPhoneElement = document.getElementById('user-phone');
  if (userPhoneElement) {
    userPhoneElement.textContent = formatPhoneNumber(contact.phone_number);
    console.log('📱 Телефон обновлён в UI:', contact.phone_number);
  }
  
  // Обновляем имя, если нужно
  const userFullname = document.getElementById('user-fullname');
  const userName = document.getElementById('user-name');
  
  if (contact.first_name || contact.last_name) {
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Без имени';
    if (userFullname) {
      userFullname.textContent = fullName;
    }
    if (userName) {
      userName.textContent = contact.first_name || 'Гость';
    }
    console.log('👤 Имя обновлено:', fullName);
  }
  
  // Прячем кнопку "Поделиться контактом"
  const shareBtn = document.getElementById('share-contact-btn');
  if (shareBtn) {
    shareBtn.classList.add('hidden');
  }

  // Прячем модалку, если она была открыта
  hideContactShareModal();
  
  // Показываем сообщение об успехе
  showContactInfo('Номер телефона успешно обновлен!');
  
  console.log('✅ Контактная информация успешно обновлена');
};

/* ==================== АНИМАЦИИ ==================== */

const resetAnimationStyles = () => {
  document.querySelectorAll('[class^="btn-"]').forEach(btn => {
    btn.style.opacity = '';
    btn.style.transform = '';
  });

  const navBar = document.querySelector('.nav-bar');
  if (navBar) {
    navBar.style.opacity = '';
    navBar.style.transform = '';
  }

  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.classList.remove('fade-in');
    welcomeScreen.style.display = '';
  }

  const mainApp = document.getElementById('main-app');
  if (mainApp) {
    mainApp.style.display = '';
  }
};

const animateButtons = (page) => {
  const buttons = page.querySelectorAll('[class^="btn-"]');
  buttons.forEach((btn, index) => {
    setTimeout(() => {
      btn.classList.add('slide-in');
    }, index * 400);
  });

  if (page.id === 'home') {
    const dropdownContainer = page.querySelector('.dropdown-container');
    if (dropdownContainer) {
      setTimeout(() => {
        dropdownContainer.classList.add('slide-in');
      }, 100);
    }
  }

  if (page.id === 'requests') {
    const tableContainer = page.querySelector('.requests-table');
    if (tableContainer) {
      setTimeout(() => {
        tableContainer.classList.add('slide-in');
      }, 300);
    }
  }
};

const startAnimation = () => {
  resetAnimationStyles();
  
  const welcomeScreen = document.getElementById('welcome-screen');
  welcomeScreen.style.display = 'flex';

  setTimeout(() => {
    welcomeScreen.classList.add('fade-in');
    
    setTimeout(() => {
      welcomeScreen.style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
      
      setTimeout(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage) {
          document.body.classList.toggle('hide-main-logo', activePage.id === 'requests');
          animateButtons(activePage);
        }
        document.querySelector('.nav-bar')?.classList.add('slide-in');
      }, 100);
    }, 3000);
  }, 500);
};

/* ==================== НАВИГАЦИЯ ==================== */

const setupNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = btn.getAttribute('data-page');

      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

      const newPage = document.getElementById(pageId);
      newPage?.classList.add('active');
      btn.classList.add('active');
      document.body.classList.toggle('hide-main-logo', pageId === 'requests');

      if (pageId === 'requests') {
        syncOpenTasksForKnownEstablishments({ force: true }).then(() => {
          window.startRequestsListOpenChatPolling?.();
        });
      } else {
        window.stopRequestsListOpenChatPolling?.();
      }

      const allButtons = newPage.querySelectorAll('[class^="btn-"]');
      allButtons.forEach(button => button.classList.remove('slide-in'));

      const dropdownContainers = newPage.querySelectorAll('.dropdown-container');
      dropdownContainers.forEach(dropdown => dropdown.classList.remove('slide-in'));

      const tableContainers = newPage.querySelectorAll('.table-container, .requests-table');
      tableContainers.forEach(table => table.classList.remove('slide-in'));

      setTimeout(() => {
        allButtons.forEach((button, index) => {
          setTimeout(() => button.classList.add('slide-in'), index * 200);
        });

        if (pageId === 'home') {
          const dropdownContainer = newPage.querySelector('.dropdown-container');
          if (dropdownContainer) {
            setTimeout(() => {
              dropdownContainer.classList.add('slide-in');
            }, 100);
          }
        }

        if (pageId === 'requests') {
          const tableContainer = newPage.querySelector('.requests-table');
          if (tableContainer) {
            setTimeout(() => {
              tableContainer.classList.add('slide-in');
            }, 300);
          }
        }
      }, 50);
    });
  });
};


/* ==================== УЛУЧШЕНИЕ UX ==================== */

const enhanceMobileUX = () => {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-device');
  }
  
  document.querySelectorAll('button, .nav-btn').forEach(element => {
    let lastTouchEnd = 0;
    element.addEventListener('touchend', function (event) {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
  });
};

/* ==================== ВЫБОР ЗАВЕДЕНИЯ ДЛЯ СЧЕТОВ ==================== */

let currentlySelectedEstablishmentButton = null;
const requestsState = {
  tasks: [],
  activeTaskId: null,
  isLoading: false
};
const requestsFiltersState = {
  search: '',
  establishment: ''
};
const openTaskSyncState = {
  lastSignature: '',
  inFlight: false
};
const openChatPollState = {
  timerId: null,
  attempt: 0,
  taskId: null
};
const requestsOpenChatPollState = {
  timerId: null,
  attempt: 0,
  inFlight: false
};
const requestDeepLinkState = {
  rawParam: '',
  type: '',
  value: '',
  handled: false,
  attempt: 0,
  timerId: null,
  inFlight: false,
  awaitingAuthorization: false
};
const pendingAuthorizedActionState = {
  callback: null,
  timerId: null
};
const pendingOutgoingMessagesByTask = new Map();
const pendingLocalAttachmentsCache = new Map();

const registerPendingLocalAttachment = (cacheKey, file) => {
  if (!cacheKey || !(file instanceof Blob)) return;
  pendingLocalAttachmentsCache.set(String(cacheKey), {
    blob: file,
    fileName: String(file.name || 'Файл'),
    createdAt: Date.now()
  });
  if (pendingLocalAttachmentsCache.size > 40) {
    pendingLocalAttachmentsCache.delete(pendingLocalAttachmentsCache.keys().next().value);
  }
};

const getPendingLocalAttachment = (cacheKey) => {
  if (!cacheKey) return null;
  return pendingLocalAttachmentsCache.get(String(cacheKey)) || null;
};
const ESTABLISHMENTS_CACHE_STORAGE_KEY = 'miniapp_establishments_cache_v1';
const UNREAD_STORAGE_KEY = 'miniapp_unread_counts_v1';
const REQUESTS_CACHE_STORAGE_KEY = 'miniapp_requests_cache_v1';
const READ_CHAT_SIGNATURES_STORAGE_KEY = 'miniapp_read_chat_signatures_v1';
const OPEN_CHAT_POLL_DELAYS_MS = [4000, 4000, 4000, 8000, 8000, 8000, 16000, 16000, 16000, 24000, 24000, 24000, 48000, 48000, 48000];
const getScopedStorageKey = (baseKey) => `${baseKey}:${user?.id != null ? String(user.id) : 'guest'}`;
const LOCAL_PREVIEW_ESTABLISHMENTS = [
  { id: 'demo-1', name: 'ресторан «Я семья»' },
  { id: 'demo-2', name: 'кофейня «Атлас»' },
  { id: 'demo-3', name: 'бар «Север»' },
  { id: 'demo-4', name: 'кафе «Бруно»' },
  { id: 'demo-5', name: 'пиццерия «Тесто»' },
  { id: 'demo-6', name: 'ресторан «Мореман»' },
  { id: 'demo-7', name: 'пекарня «Хлебный двор»' },
  { id: 'demo-8', name: 'бистро «Парк»' },
  { id: 'demo-9', name: 'кафе «Лайм»' },
  { id: 'demo-10', name: 'ресторан «Гринвич»' }
];
const LOCAL_PREVIEW_DESCRIPTIONS = [
  'Не печатает чек',
  'Не открывается смена',
  'Ошибка эквайринга',
  'Терминал зависает',
  'Не приходит заказ на кухню',
  'Проблема с интеграцией',
  'Касса уходит в офлайн',
  'Нет связи с принтером',
  'Сбой оплаты по QR',
  'Не грузится меню'
];
const LOCAL_PREVIEW_TASKS = [
  {
    task_id: 345999748,
    chat_id: '5457100_1774806154883_evec',
    Client: 'ресторан «Я семья»',
    status: 'В работе',
    description: 'Тест диалога с файлом',
    chat: [
      {
        task_id: 345999748,
        comment_id: 2954941360,
        author: 'Михаил',
        text: 'Темт',
        date: '2026-03-29T17:43:40Z',
        channel_type: 'custom',
        IDUser: '5457100',
        message_type: 'TEXT',
        attachmentsID: [],
        attachmentsName: [],
        attachmentsURL: [],
        attachmentsMD5: []
      },
      {
        task_id: 345999748,
        comment_id: 2954946959,
        author: 'Михаил',
        text: 'Файл: IMG_4849.png',
        date: '2026-03-29T17:49:08Z',
        channel_type: 'custom',
        IDUser: '5457100',
        message_type: 'TEXT',
        attachmentsID: [],
        attachmentsName: [],
        attachmentsURL: [],
        attachmentsMD5: []
      },
      {
        task_id: 345999748,
        comment_id: 2954971338,
        author: 'Михаил',
        text: '',
        date: '2026-03-29T18:13:48Z',
        channel_type: 'custom',
        IDUser: '5457100',
        message_type: 'FILES',
        attachmentsID: [
          424060439
        ],
        attachmentsName: [
          'IMG_4849.png'
        ],
        attachmentsURL: [
          'https://pyrus.com/services/attachment?id=424060439'
        ],
        attachmentsMD5: [
          '78C67420A38B2326A4FB91766FC6575A'
        ]
      }
    ]
  },
  ...Array.from({ length: 20 }, (_, index) => {
  const establishment = LOCAL_PREVIEW_ESTABLISHMENTS[index % LOCAL_PREVIEW_ESTABLISHMENTS.length];
  const description = LOCAL_PREVIEW_DESCRIPTIONS[index % LOCAL_PREVIEW_DESCRIPTIONS.length];
  const taskId = String(345246422 + index);
  const baseTime = Date.now() - ((20 - index) * 60 * 60 * 1000);

  return {
    task_id: taskId,
    chat_id: `demo_${taskId}_chat`,
    Client: establishment.name,
    status: index % 4 === 0 ? 'В работе' : (index % 5 === 0 ? 'Закрыта' : 'Новая'),
    description,
    chat: [
      {
        task_id: taskId,
        comment_id: `demo-${taskId}-1`,
        author: 'Pyrus',
        text: `Здравствуйте. Проверяем заявку: ${description.toLowerCase()}.`,
        date: new Date(baseTime).toISOString(),
        channel_type: 'custom'
      },
      {
        task_id: taskId,
        comment_id: `demo-${taskId}-2`,
        author: 'Вы',
        text: `Локальный просмотр диалога для ${establishment.name}.`,
        date: new Date(baseTime + 20 * 60 * 1000).toISOString(),
        channel_type: 'web',
        is_outgoing: true
      }
    ]
  };
})
];

const formatRequestDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}`;
};

const normalizeCommentAuthor = (comment) => String(
  comment?.author ??
  comment?.sender ??
  comment?.sender_name ??
  comment?.username ??
  'Pyrus'
);

const normalizePendingMessageText = (value) => String(value ?? '').trim();

const isHiddenSystemTaskComment = (comment) => {
  const author = normalizeCommentAuthor(comment).trim().toLowerCase();
  const text = String(comment?.text ?? '').trim();
  return author === 'pyrus' && /^id:\s*\d+\s+name:\s*/i.test(text);
};

const registerPendingOutgoingMessage = (taskId, message) => {
  const normalizedTaskId = String(taskId || '').trim();
  const normalizedText = normalizePendingMessageText(message?.text);
  const timestamp = new Date(message?.date || Date.now()).getTime();

  if (!normalizedTaskId || !normalizedText || Number.isNaN(timestamp)) return;

  const existing = pendingOutgoingMessagesByTask.get(normalizedTaskId) || [];
  existing.push({
    text: normalizedText,
    timestamp
  });
  pendingOutgoingMessagesByTask.set(normalizedTaskId, existing.slice(-20));
};

const matchPendingOutgoingMessage = (taskId, comment) => {
  const normalizedTaskId = String(taskId || comment?.task_id || '').trim();
  if (!normalizedTaskId) return false;

  const pending = pendingOutgoingMessagesByTask.get(normalizedTaskId);
  if (!pending || pending.length === 0) return false;

  const normalizedText = normalizePendingMessageText(comment?.text);
  const timestamp = new Date(comment?.date || Date.now()).getTime();
  if (!normalizedText || Number.isNaN(timestamp)) return false;

  const matchIndex = pending.findIndex((item) =>
    item.text === normalizedText &&
    Math.abs(item.timestamp - timestamp) <= 10 * 60 * 1000
  );

  if (matchIndex === -1) return false;

  pending.splice(matchIndex, 1);
  if (pending.length === 0) {
    pendingOutgoingMessagesByTask.delete(normalizedTaskId);
  } else {
    pendingOutgoingMessagesByTask.set(normalizedTaskId, pending);
  }

  return true;
};

const normalizeCommentIsOutgoing = (comment, author, taskId = '') => {
  const currentUserId = user?.id == null ? null : String(user.id);
  const hasExplicitCommentUserId =
    Object.prototype.hasOwnProperty.call(comment || {}, 'UserID') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'IDUser') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'userID') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'id_user') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'idUser') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'user_id') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'userId') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'author_id') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'authorId') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'sender_id') ||
    Object.prototype.hasOwnProperty.call(comment || {}, 'senderId');
  const commentUserId =
    comment?.UserID ??
    comment?.IDUser ??
    comment?.userID ??
    comment?.id_user ??
    comment?.idUser ??
    comment?.user_id ??
    comment?.userId ??
    comment?.author_id ??
    comment?.authorId ??
    comment?.sender_id ??
    comment?.senderId ??
    null;
  const normalizedChannel = String(comment?.channel_type ?? comment?.channelType ?? '').toLowerCase();
  const normalizedAuthor = String(author || '').trim().toLowerCase();
  const currentNames = [
    user?.first_name,
    user?.username,
    [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (comment?.is_outgoing != null) return Boolean(comment.is_outgoing);
  if (comment?.isOutgoing != null) return Boolean(comment.isOutgoing);
  if (comment?.from_me != null) return Boolean(comment.from_me);
  if (comment?.fromMe != null) return Boolean(comment.fromMe);
  if (hasExplicitCommentUserId) {
    return Boolean(currentUserId && commentUserId != null && String(commentUserId) === currentUserId);
  }
  if (currentUserId && commentUserId != null && String(commentUserId) === currentUserId) return true;
  if (
    normalizedChannel.includes('telegram_webapp') ||
    normalizedChannel.includes('max_webapp') ||
    normalizedChannel.includes('miniapp')
  ) return true;
  if (currentNames.includes(normalizedAuthor)) return true;
  if (normalizedAuthor === 'вы') return true;
  if (matchPendingOutgoingMessage(taskId, comment)) return true;
  return false;
};

const normalizeTaskComment = (comment, fallbackText = '', taskId = '') => {
  const author = normalizeCommentAuthor(comment);
  const normalizedTaskId = String(comment?.task_id ?? taskId ?? '');
  const messageType = String(comment?.message_type ?? comment?.messageType ?? 'TEXT').trim().toUpperCase();
  const senderType = String(comment?.sender_type ?? comment?.senderType ?? '').trim().toLowerCase();
  const legacyAttachmentNames = Array.isArray(comment?.attachmentsName) ? comment.attachmentsName : [];
  const legacyAttachmentUrls = Array.isArray(comment?.attachmentsURL) ? comment.attachmentsURL : [];
  const legacyAttachmentIds = Array.isArray(comment?.attachmentsID) ? comment.attachmentsID : [];
  const legacyAttachmentMd5 = Array.isArray(comment?.attachmentsMD5) ? comment.attachmentsMD5 : [];
  const legacyAttachmentMimeTypes = Array.isArray(comment?.attachmentsMimeType) ? comment.attachmentsMimeType : [];
  const legacyAttachmentPreviewUrls = Array.isArray(comment?.attachmentsPreviewURL) ? comment.attachmentsPreviewURL : [];
  const objectAttachments = Array.isArray(comment?.attachments) ? comment.attachments : [];
  const attachments = objectAttachments.length > 0
    ? objectAttachments
      .map((item, index) => ({
        id: String(item?.id ?? item?.attachment_id ?? item?.ID ?? index),
        name: String(item?.name ?? item?.file_name ?? item?.title ?? `Файл ${index + 1}`),
        url: String(item?.url ?? item?.file_url ?? item?.href ?? ''),
        md5: String(item?.md5 ?? item?.hash ?? ''),
        mimeType: String(item?.mime_type ?? item?.mimeType ?? ''),
        previewUrl: String(item?.preview_url ?? item?.previewUrl ?? item?.thumb_url ?? item?.thumbnail ?? item?.url ?? ''),
        isPending: Boolean(item?.isPending),
        localCacheKey: String(item?.localCacheKey ?? item?.local_cache_key ?? '')
      }))
      .filter((item) => item.name || item.url)
    : legacyAttachmentNames.map((name, index) => ({
      id: String(legacyAttachmentIds[index] ?? index),
      name: String(name ?? `Файл ${index + 1}`),
      url: String(legacyAttachmentUrls[index] ?? ''),
      md5: String(legacyAttachmentMd5[index] ?? ''),
      mimeType: String(legacyAttachmentMimeTypes[index] ?? ''),
      previewUrl: String(legacyAttachmentPreviewUrls[index] ?? legacyAttachmentUrls[index] ?? '')
    }))
      .filter((item) => item.name || item.url);
  const normalizedText = String(comment?.text ?? fallbackText ?? '');

  return {
    taskId: normalizedTaskId,
    commentId: String(comment?.comment_id ?? comment?.commentId ?? `${Date.now()}`),
    author,
    text: normalizedText,
    date: comment?.date || new Date().toISOString(),
    channelType: String(comment?.channel_type ?? comment?.channelType ?? 'custom'),
    senderType,
    isOutgoing: normalizeCommentIsOutgoing(comment, author, normalizedTaskId),
    messageType,
    attachments
  };
};

const getCommentIdentity = (comment) => `${comment.commentId}|${comment.date}|${comment.author}|${comment.text}`;
const getTaskChatSignature = (chat = []) => (Array.isArray(chat) ? chat.map(getCommentIdentity).join('||') : '');
const getTaskStorageKey = (task) => String(task?.chatId || task?.taskId || '');
const getCommentTimestamp = (comment) => {
  const timestamp = new Date(comment?.date || '').getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};
const sortCommentsByDateAsc = (comments = []) => [...comments].sort((a, b) => getCommentTimestamp(a) - getCommentTimestamp(b));
const getLatestTaskMessage = (task) => {
  const chat = Array.isArray(task?.chat) ? task.chat : [];
  if (!chat.length) return null;
  return sortCommentsByDateAsc(chat)[chat.length - 1] || null;
};

const normalizeDeepLinkChatId = (value = '') => String(value || '')
  .trim()
  .replace(/^['"]+|['"]+$/g, '');

const parseMiniAppStartParam = (value = '') => {
  const normalized = normalizeDeepLinkChatId(value);
  if (!normalized) return { type: '', value: '' };
  if (normalized.startsWith('add_restaurant_')) {
    return {
      type: 'add_restaurant',
      value: normalized.slice('add_restaurant_'.length)
    };
  }
  if (normalized.startsWith('chat_')) {
    return {
      type: 'chat',
      value: normalized.slice('chat_'.length)
    };
  }
  return {
    type: 'chat',
    value: normalized
  };
};

const getMiniAppStartParam = () => {
  const candidates = [
    tg?.initDataUnsafe?.start_param,
    tg?.initDataUnsafe?.startapp,
    window.WebApp?.initDataUnsafe?.start_param,
    window.WebApp?.initDataUnsafe?.startapp,
    new URLSearchParams(window.location.search).get('startapp'),
    new URLSearchParams(window.location.search).get('start_param'),
    new URLSearchParams(window.location.search).get('WebAppStartParam')
  ];

  const resolved = candidates
    .map(normalizeDeepLinkChatId)
    .find(Boolean);

  return resolved || '';
};

const normalizeRestaurantsFromTaskSupportResponse = (result) => {
  const qrRestaurants = normalizeRestaurantsFromQrResponse(result);
  if (qrRestaurants.length > 0) return qrRestaurants;
  return normalizeRestaurantsFromClientSupportResponse(result);
};

const clearPendingAuthorizedAction = () => {
  if (pendingAuthorizedActionState.timerId) {
    clearTimeout(pendingAuthorizedActionState.timerId);
  }
  pendingAuthorizedActionState.timerId = null;
  pendingAuthorizedActionState.callback = null;
};

const schedulePendingAuthorizedAction = (callback, delayMs = 2000) => {
  if (typeof callback !== 'function') return;
  clearPendingAuthorizedAction();
  pendingAuthorizedActionState.callback = callback;
  pendingAuthorizedActionState.timerId = window.setTimeout(async () => {
    const nextCallback = pendingAuthorizedActionState.callback;
    clearPendingAuthorizedAction();
    if (typeof nextCallback === 'function') {
      await nextCallback();
    }
  }, delayMs);
};

const runPendingAuthorizedActionNow = async () => {
  const callback = pendingAuthorizedActionState.callback;
  clearPendingAuthorizedAction();
  if (typeof callback === 'function') {
    await callback();
  }
};

const delayPendingAuthorizedAction = (delayMs = 2000) => {
  const callback = pendingAuthorizedActionState.callback;
  if (typeof callback !== 'function') return;
  schedulePendingAuthorizedAction(callback, delayMs);
};

const loadUnreadCountsFromStorage = () => {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(UNREAD_STORAGE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Не удалось загрузить unread counts из localStorage:', error);
    return {};
  }
};

const loadReadChatSignaturesFromStorage = () => {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(READ_CHAT_SIGNATURES_STORAGE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Не удалось загрузить read chat signatures из localStorage:', error);
    return {};
  }
};

const saveReadChatSignaturesToStorage = (payload) => {
  try {
    localStorage.setItem(getScopedStorageKey(READ_CHAT_SIGNATURES_STORAGE_KEY), JSON.stringify(payload || {}));
  } catch (error) {
    console.warn('Не удалось сохранить read chat signatures в localStorage:', error);
  }
};

const getStoredReadChatSignature = (task) => {
  const key = getTaskStorageKey(task);
  if (!key) return '';
  const stored = loadReadChatSignaturesFromStorage();
  return String(stored[key] || '');
};

const markTaskChatSignatureAsRead = (task) => {
  const key = getTaskStorageKey(task);
  if (!key) return;
  const stored = loadReadChatSignaturesFromStorage();
  stored[key] = getTaskChatSignature(task?.chat || []);
  saveReadChatSignaturesToStorage(stored);
};

const loadRequestsCacheFromStorage = () => {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(REQUESTS_CACHE_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Не удалось загрузить requests cache из localStorage:', error);
    return [];
  }
};

const saveRequestsCacheToStorage = () => {
  try {
    const payload = requestsState.tasks.map((task) => ({
      taskId: String(task.taskId || ''),
      org: String(task.org || ''),
      description: String(task.description || ''),
      status: String(task.status || ''),
      chatId: String(task.chatId || ''),
      isClosed: Boolean(task.isClosed),
      createdAt: task.createdAt || new Date().toISOString(),
      unreadCount: Number(task.unreadCount || 0),
      chat: Array.isArray(task.chat)
        ? task.chat.slice(-20).map((message) => ({
          taskId: String(message.taskId || task.taskId || ''),
          commentId: String(message.commentId || ''),
          author: String(message.author || ''),
          text: String(message.text || ''),
          date: message.date || '',
          channelType: String(message.channelType || ''),
          senderType: String(message.senderType || ''),
          isOutgoing: Boolean(message.isOutgoing),
          messageType: String(message.messageType || 'TEXT'),
          attachments: Array.isArray(message.attachments)
            ? message.attachments.map((attachment) => ({
              id: String(attachment.id || ''),
              name: String(attachment.name || ''),
              url: String(attachment.url || ''),
              md5: String(attachment.md5 || ''),
              mimeType: String(attachment.mimeType || ''),
              previewUrl: String(attachment.previewUrl || '')
            }))
            : []
        }))
        : []
    }));
    localStorage.setItem(getScopedStorageKey(REQUESTS_CACHE_STORAGE_KEY), JSON.stringify(payload));
  } catch (error) {
    console.warn('Не удалось сохранить requests cache в localStorage:', error);
  }
};

const clearRequestsCacheForCurrentUser = () => {
  try {
    localStorage.removeItem(getScopedStorageKey(ESTABLISHMENTS_CACHE_STORAGE_KEY));
    localStorage.removeItem(getScopedStorageKey(UNREAD_STORAGE_KEY));
    localStorage.removeItem(getScopedStorageKey(REQUESTS_CACHE_STORAGE_KEY));
    localStorage.removeItem(getScopedStorageKey(READ_CHAT_SIGNATURES_STORAGE_KEY));
  } catch (error) {
    console.warn('Не удалось очистить requests cache из localStorage:', error);
  }
};

const clearRequestsStateAndCache = () => {
  requestsState.tasks = [];
  requestsState.activeTaskId = null;
  requestsState.isLoading = false;
  clearRequestsCacheForCurrentUser();
  renderRequestsList();
};

const restoreRequestsCacheFromStorage = () => {
  const cachedTasks = loadRequestsCacheFromStorage();
  if (!cachedTasks.length) return false;

  requestsState.tasks = cachedTasks
    .map((task) => ({
      ...task,
      unreadCount: Number(task.unreadCount || 0),
      chat: Array.isArray(task.chat)
        ? sortCommentsByDateAsc(task.chat
          .filter((comment) => !isHiddenSystemTaskComment(comment))
          .map((comment) => normalizeTaskComment(comment, task.description, task.taskId))
          .filter(Boolean))
        : []
    }))
    .filter((task) => task?.taskId);

  restoreUnreadCountsFromStorage();
  renderRequestsList();
  return requestsState.tasks.length > 0;
};

const saveUnreadCountsToStorage = () => {
  try {
    const payload = requestsState.tasks.reduce((acc, task) => {
      const key = getTaskStorageKey(task);
      if (!key) return acc;
      acc[key] = Number(task.unreadCount || 0);
      return acc;
    }, {});
    localStorage.setItem(getScopedStorageKey(UNREAD_STORAGE_KEY), JSON.stringify(payload));
  } catch (error) {
    console.warn('Не удалось сохранить unread counts в localStorage:', error);
  }
};

const restoreUnreadCountsFromStorage = () => {
  const stored = loadUnreadCountsFromStorage();
  requestsState.tasks.forEach((task) => {
    const key = getTaskStorageKey(task);
    if (!key) return;
    task.unreadCount = Number(stored[key] || task.unreadCount || 0);
  });
};

const applyStoredUnreadCountToTask = (task) => {
  const stored = loadUnreadCountsFromStorage();
  const key = getTaskStorageKey(task);
  if (!key) return task;
  return {
    ...task,
    unreadCount: Number(stored[key] || task.unreadCount || 0)
  };
};

const getNextOpenChatPollDelay = (attempt) => OPEN_CHAT_POLL_DELAYS_MS[Math.max(attempt, 0)] ?? null;

const isTaskClosed = (task) => {
  const normalizedStatus = String(task?.status || '').trim().toLowerCase();
  return Boolean(task?.isClosed)
    || ['решен', 'решена', 'решено', 'закрыта', 'закрыт', 'закрыто', 'closed'].includes(normalizedStatus)
    || normalizedStatus.startsWith('реш')
    || normalizedStatus.startsWith('закры');
};

const getTaskOrganizationName = (item = {}) => {
  const candidates = [
    item?.org,
    item?.Org,
    item?.organization,
    item?.Organization,
    item?.org_name,
    item?.orgName,
    item?.company,
    item?.Company,
    item?.client,
    item?.Client,
    item?.client_name,
    item?.clientName,
    item?.restaurant,
    item?.Restaurant,
    item?.restaurant_name,
    item?.restaurantName,
    item?.establishment,
    item?.establishment_name,
    item?.establishmentName,
    item?.data?.org,
    item?.data?.organization,
    item?.data?.Client
  ];

  const resolved = candidates
    .map((value) => String(value ?? '').trim())
    .find(Boolean);

  const cleaned = String(resolved || '')
    .replace(/^Карточка\s+ресторана:\s*/i, '')
    .trim();

  return cleaned || 'Без организации';
};

const hasResolvedOrganizationName = (value = '') => {
  const normalized = String(value ?? '').trim();
  return Boolean(normalized) && normalized !== 'Без организации';
};

const normalizeTaskFromWebhook = (item) => {
  if (!item || (!item.task_id && !item.taskId)) return null;
  const taskId = String(item.task_id ?? item.taskId);
  const chatItems = Array.isArray(item.chat) ? item.chat : [];
  const fallbackPreviewComment = !chatItems.length
    ? {
      task_id: taskId,
      comment_id: item?.comment_id ?? item?.commentId ?? `preview-${taskId}`,
      author: item?.author ?? item?.sender ?? item?.sender_name ?? item?.senderName ?? item?.username ?? 'Pyrus',
      text: item?.text ?? item?.message ?? item?.comment ?? item?.body ?? '',
      date: item?.date ?? item?.updated_at ?? item?.updatedAt ?? item?.last_message_date ?? item?.lastMessageDate ?? item?.created_at ?? item?.createdAt ?? new Date().toISOString(),
      channel_type: item?.channel_type ?? item?.channelType ?? 'custom',
      sender_type: item?.sender_type ?? item?.senderType ?? '',
      message_type: item?.message_type ?? item?.messageType ?? 'TEXT',
      IDUser: item?.IDUser ?? item?.UserID ?? item?.user_id ?? item?.userId ?? null,
      attachmentsID: Array.isArray(item?.attachmentsID) ? item.attachmentsID : [],
      attachmentsName: Array.isArray(item?.attachmentsName) ? item.attachmentsName : [],
      attachmentsURL: Array.isArray(item?.attachmentsURL) ? item.attachmentsURL : [],
      attachmentsMD5: Array.isArray(item?.attachmentsMD5) ? item.attachmentsMD5 : []
    }
    : null;
  const sourceComments = chatItems.length > 0 ? chatItems : (fallbackPreviewComment ? [fallbackPreviewComment] : []);
  const normalizedChat = sourceComments
    .filter((comment) => !isHiddenSystemTaskComment(comment))
    .map((comment) => normalizeTaskComment({
      ...comment,
      IDUser: comment?.IDUser ?? comment?.UserID ?? item?.IDUser ?? item?.UserID ?? null
    }, item.description, taskId))
    .filter((comment) => comment.text || (Array.isArray(comment.attachments) && comment.attachments.length > 0));
  const sortedChat = sortCommentsByDateAsc(normalizedChat);
  const lastMessage = sortedChat[sortedChat.length - 1];
  const description = item.description == null ? '' : String(item.description ?? item.text ?? '');
  const hasStatus = Object.prototype.hasOwnProperty.call(item, 'status');
  const hasClosedFlag =
    Object.prototype.hasOwnProperty.call(item, 'is_closed') ||
    Object.prototype.hasOwnProperty.call(item, 'isClosed');

  return {
    taskId,
    org: getTaskOrganizationName(item),
    description,
    status: hasStatus ? String(item.status ?? '') : '',
    chatId: String(item.chat_id ?? item.chatId ?? ''),
    isClosed: hasClosedFlag ? Boolean(item.is_closed ?? item.isClosed ?? false) : undefined,
    chat: sortedChat,
    createdAt: lastMessage?.date || new Date().toISOString(),
    unreadCount: 0
  };
};

const markMatchingTaskMessagesAsOutgoing = (task, expectedText = '') => {
  if (!task || !expectedText) return;
  const normalizedExpectedText = normalizePendingMessageText(expectedText);
  if (!normalizedExpectedText) return;

  task.chat = (task.chat || []).map((message) => {
    if (message?.isOutgoing) return message;
    const normalizedMessageText = normalizePendingMessageText(message?.text);
    if (normalizedMessageText !== normalizedExpectedText) return message;
    return {
      ...message,
      isOutgoing: true
    };
  });
};

const ensureCreatedTaskStartsWithOutgoingMessage = (task, expectedText = '') => {
  if (!task || !expectedText) return;
  const normalizedExpectedText = normalizePendingMessageText(expectedText);
  if (!normalizedExpectedText) return;

  const chat = Array.isArray(task.chat) ? [...task.chat] : [];
  const matchingIndex = chat.findIndex((message) => normalizePendingMessageText(message?.text) === normalizedExpectedText);

  if (matchingIndex >= 0) {
    const [matchingMessage] = chat.splice(matchingIndex, 1);
    chat.unshift({
      ...matchingMessage,
      isOutgoing: true,
      author: user?.first_name || user?.username || matchingMessage?.author || 'Вы'
    });
    task.chat = chat;
    saveRequestsCacheToStorage();
    return;
  }

  const syntheticMessage = normalizeTaskComment({
    task_id: task.taskId,
    comment_id: `created-${task.taskId}`,
    author: user?.first_name || user?.username || 'Вы',
    isOutgoing: true,
    text: expectedText,
    date: task.createdAt || new Date().toISOString(),
    channel_type: `${platformName}_webapp`,
    message_type: 'TEXT'
  }, expectedText, task.taskId);

  task.chat = [syntheticMessage, ...chat];
  saveRequestsCacheToStorage();
};

const extractTaskItemsFromResult = (result) => {
  const rootItems = Array.isArray(result) ? result : [result];
  return rootItems.flatMap((item) => {
    if (!item) return [];
    if (typeof item === 'string') {
      try {
        return extractTaskItemsFromResult(JSON.parse(item));
      } catch (error) {
        return [];
      }
    }
    if (Array.isArray(item?.data)) return item.data;
    if (typeof item?.data === 'string') {
      try {
        const parsed = JSON.parse(item.data);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        return [];
      }
    }
    if (item?.data && typeof item.data === 'object') return [item.data];
    return item ? [item] : [];
  });
};

const markTaskAsRead = (taskId) => {
  const task = requestsState.tasks.find((item) => item.taskId === String(taskId));
  if (!task) return;
  task.unreadCount = 0;
  markTaskChatSignatureAsRead(task);
  saveUnreadCountsToStorage();
  saveRequestsCacheToStorage();
};

const upsertRequestTask = (task, options = {}) => {
  if (!task?.taskId) return;
  const shouldMarkRead = options.markRead === true;
  const existingIndex = requestsState.tasks.findIndex((item) => item.taskId === task.taskId);
  if (existingIndex >= 0) {
    const existingTask = requestsState.tasks[existingIndex];
    const nextChat = task.chat.length > 0 ? task.chat : existingTask.chat;
    const nextChatSignature = getTaskChatSignature(nextChat);
    const storedReadSignature = getStoredReadChatSignature(existingTask);
    const hasUnreadChanges = Boolean(nextChatSignature) && nextChatSignature !== storedReadSignature;

    requestsState.tasks[existingIndex] = {
      ...existingTask,
      ...task,
      org: hasResolvedOrganizationName(task.org) ? task.org : existingTask.org,
      description: task.description || existingTask.description,
      status: task.status || existingTask.status,
      chatId: task.chatId || existingTask.chatId,
      isClosed: typeof task.isClosed === 'boolean' ? task.isClosed : existingTask.isClosed,
      chat: nextChat,
      createdAt: existingTask.createdAt || task.createdAt,
      unreadCount: shouldMarkRead ? 0 : (hasUnreadChanges ? 1 : 0)
    };
    if (shouldMarkRead) {
      markTaskChatSignatureAsRead(requestsState.tasks[existingIndex]);
    }
  } else {
    const initialTask = applyStoredUnreadCountToTask({
      ...task,
      isClosed: Boolean(task.isClosed),
      unreadCount: 0
    });
    const initialSignature = getTaskChatSignature(initialTask.chat || []);
    const hasUnreadChanges = Boolean(initialSignature) && initialSignature !== getStoredReadChatSignature(initialTask);
    requestsState.tasks.unshift({
      ...initialTask,
      unreadCount: shouldMarkRead ? 0 : (hasUnreadChanges ? 1 : 0)
    });
    if (shouldMarkRead) {
      markTaskChatSignatureAsRead(requestsState.tasks[0]);
    }
  }
  saveUnreadCountsToStorage();
  saveRequestsCacheToStorage();
};

const getStatusClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('новая') || s === 'new') return 'request-status--new';
  if (s.includes('работ')) return 'request-status--progress';
  if (s.includes('ожида')) return 'request-status--waiting';
  if (s.includes('сообщ')) return 'request-status--message';
  if (s.includes('передач') || s.includes('специал')) return 'request-status--transfer';
  if (s.includes('решен') || s.includes('закрыт') || s.includes('closed')) return 'request-status--resolved';
  return '';
};

const getRequestMessagePreview = (message, fallback = 'Без описания') => {
  if (!message) return fallback;
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    if (message.attachments.length === 1) {
      return `Файл: ${message.attachments[0].name || 'без названия'}`;
    }
    return `Файлы: ${message.attachments.length}`;
  }
  return message.text || fallback;
};

const normalizeAttachmentExtension = (name = '') => {
  const normalizedName = String(name || '').trim();
  const dotIndex = normalizedName.lastIndexOf('.');
  if (dotIndex < 0) return null;
  let extension = normalizedName.slice(dotIndex + 1).toLowerCase();
  if (extension === 'jpeg') extension = 'jpg';
  if (extension === 'tif') extension = 'tiff';
  if (extension === 'heif') extension = 'heic';
  return extension || null;
};

const PHOTO_EXTENSIONS = new Set(['jpg', 'png', 'webp', 'heic', 'bmp']);
const VIDEO_MP4_EXTENSIONS = new Set(['mp4']);
const VIDEO_OTHER_EXTENSIONS = new Set(['mov', 'mkv', 'avi', 'wmv', 'flv', 'webm', 'm4v']);
const OFFICE_TEXT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'epub']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus']);
const RAW_VECTOR_SOURCE_EXTENSIONS = new Set(['raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'srw', 'svg', 'ai', 'psd', 'eps', 'indd', 'sketch', 'fig']);

const classifyAttachmentKind = (attachment = {}) => {
  const extension = normalizeAttachmentExtension(attachment?.name || '');
  if (!extension) return 'doc';
  if (PHOTO_EXTENSIONS.has(extension)) return 'photo';
  if (VIDEO_MP4_EXTENSIONS.has(extension)) return 'video';
  if (VIDEO_OTHER_EXTENSIONS.has(extension)) return 'doc';
  if (OFFICE_TEXT_EXTENSIONS.has(extension)) return 'doc';
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'doc';
  if (AUDIO_EXTENSIONS.has(extension)) return 'doc';
  if (RAW_VECTOR_SOURCE_EXTENSIONS.has(extension)) return 'doc';
  return 'doc';
};

const renderFileChipHtml = (attachment) => `
  <button
    type="button"
    class="request-file-chip${attachment?.isPending ? ' is-pending' : ''}"
    data-attachment-id="${escapeHtml(attachment?.id || '')}"
    data-attachment-md5="${escapeHtml(attachment?.md5 || '')}"
    data-attachment-name="${escapeHtml(attachment?.name || 'Файл')}"
    data-attachment-local-key="${escapeHtml(attachment?.localCacheKey || '')}"
  >
    <span class="request-file-chip__icon"><i class="fas fa-paperclip" aria-hidden="true"></i></span>
    <span class="request-file-chip__meta">
      <span class="request-file-chip__name">${escapeHtml(attachment?.name || 'Файл')}</span>
      <span class="request-file-chip__action">${((k) => k === 'video' ? 'Открыть видео' : k === 'photo' ? 'Открыть фото' : 'Открыть файл')(classifyAttachmentKind(attachment))}</span>
    </span>
  </button>
`;

const renderRequestsList = () => {
  const list = document.getElementById('requests-list');
  if (!list) return;

  const search = String(requestsFiltersState.search || '').trim().toLowerCase();
  const establishment = String(requestsFiltersState.establishment || '').trim();
  const filteredTasks = requestsState.tasks.filter((task) => {
    const previewText = getLatestTaskMessage(task)?.text || task.description || '';
    const matchesSearch = !search || [
      task.taskId,
      task.status,
      task.org,
      task.description,
      previewText
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    const matchesEstablishment = !establishment || String(task.org || '').trim() === establishment;
    return matchesSearch && matchesEstablishment;
  }).sort((a, b) => {
    const aClosed = isTaskClosed(a);
    const bClosed = isTaskClosed(b);
    if (aClosed !== bClosed) {
      return aClosed ? 1 : -1;
    }
    return 0;
  });

  const filterBtn = document.querySelector('.requests-filter-btn');
  if (filterBtn) {
    filterBtn.classList.toggle('is-active', Boolean(search || establishment));
  }

  if (filteredTasks.length === 0) {
    if (requestsState.isLoading && !search && !establishment) {
      list.innerHTML = '<div class="requests-empty">Загружаем заявки...</div>';
      return;
    }
    list.innerHTML = `<div class="requests-empty">${search || establishment ? 'По вашему фильтру ничего не найдено' : 'Заявок пока нет'}</div>`;
    return;
  }

  list.innerHTML = filteredTasks
    .map((task) => {
      const previewText = getRequestMessagePreview(getLatestTaskMessage(task), task.description || 'Без описания');
      return `
        <div class="request-card" data-task-id="${escapeHtml(task.taskId)}">
          <div class="request-card-top">
            <span class="request-number">№${escapeHtml(task.taskId)} от ${escapeHtml(formatRequestDate(task.createdAt))}</span>
            <span class="request-status ${getStatusClass(task.status)}">${escapeHtml(task.status)}</span>
          </div>
          <div class="request-topic">${escapeHtml(task.description || 'Новая заявка')}</div>
          <div class="request-meta-row">
            <div class="request-meta">${escapeHtml(task.org)}</div>
            ${task.unreadCount > 0 ? '<span class="request-unread-badge" aria-label="Есть непрочитанные сообщения"></span>' : ''}
          </div>
          <div class="request-text">${escapeHtml(previewText)}</div>
        </div>
      `;
    })
    .join('');
};

const syncCreatedTasksFromResult = (result, options = {}) => {
  const items = extractTaskItemsFromResult(result);
  const normalizedTasks = items
    .map(normalizeTaskFromWebhook)
    .filter(Boolean);

  normalizedTasks.forEach((task) => upsertRequestTask(task));

  if (options.reconcile === true) {
    const incomingTaskIds = new Set(normalizedTasks.map((task) => String(task.taskId)));
    requestsState.tasks = requestsState.tasks.filter((task) => incomingTaskIds.has(String(task.taskId)));
    if (requestsState.activeTaskId && !incomingTaskIds.has(String(requestsState.activeTaskId))) {
      requestsState.activeTaskId = null;
    }
    saveUnreadCountsToStorage();
    saveRequestsCacheToStorage();
  }

  renderRequestsList();
  window.tryOpenDeepLinkedRequest?.();
  return requestsState.tasks[0] || null;
};

const syncOpenedChatFromResult = (result, fallbackTaskId = null) => {
  const items = extractTaskItemsFromResult(result);
  const normalizedTasks = items.map(normalizeTaskFromWebhook).filter(Boolean);
  normalizedTasks.forEach((task) => {
    upsertRequestTask(task, { markRead: requestsState.activeTaskId === task.taskId });
  });
  renderRequestsList();
  window.tryOpenDeepLinkedRequest?.();

  if (!fallbackTaskId) return normalizedTasks[0] || null;
  return requestsState.tasks.find((item) => item.taskId === String(fallbackTaskId)) || normalizedTasks[0] || null;
};

const getKnownEstablishments = () => {
  const dropdown = document.getElementById('main-dropdown');
  const dropdownRestaurants = !dropdown ? [] : Array.from(dropdown.options)
    .map((option) => ({
      id: (option.value || '').trim(),
      name: (option.textContent || '').trim()
    }))
    .filter((item) => item.id && item.name && item.name !== 'Выберите заведение');

  return mergeRestaurants(dropdownRestaurants, loadCachedEstablishments());
};

const syncOpenTasksForKnownEstablishments = async ({ force = false } = {}) => {
  if (!window.API?.sendOpenTask) return;

  const establishments = getKnownEstablishments();
  if (establishments.length === 0) return;

  const signature = establishments
    .map((item) => `${item.id}:${item.name}`)
    .sort()
    .join('|');

  if (!signature || openTaskSyncState.inFlight || (!force && openTaskSyncState.lastSignature === signature)) {
    return;
  }

  openTaskSyncState.inFlight = true;
  requestsState.isLoading = requestsState.tasks.length === 0;
  renderRequestsList();
  try {
    const result = await window.API.sendOpenTask(establishments, user);
    syncCreatedTasksFromResult(result, { reconcile: true });
    openTaskSyncState.lastSignature = signature;
  } catch (error) {
    console.error('❌ Ошибка синхронизации open_task:', error);
  } finally {
    openTaskSyncState.inFlight = false;
    requestsState.isLoading = false;
    renderRequestsList();
  }
};

const seedLocalPreviewData = () => {
  const hasBridgeUser = Boolean(user?.id);
  if (hasBridgeUser) return;
  if (requestsState.tasks.length > 0) return;
  if (getKnownEstablishments().length === 0) {
    applyRestaurants(LOCAL_PREVIEW_ESTABLISHMENTS);
  }

  LOCAL_PREVIEW_TASKS
    .map(normalizeTaskFromWebhook)
    .filter(Boolean)
    .forEach((task) => {
      upsertRequestTask(task, { markRead: true });
    });

  renderRequestsList();
  window.tryOpenDeepLinkedRequest?.();

  const mainDropdown = document.getElementById('main-dropdown');
  if (mainDropdown && Array.from(mainDropdown.options).some((option) => option.value === LOCAL_PREVIEW_ESTABLISHMENTS[0].id)) {
    mainDropdown.value = LOCAL_PREVIEW_ESTABLISHMENTS[0].id;
  }
};

const setupRequestsFiltersModal = () => {
  const modal = document.getElementById('requests-filters-modal');
  const filterBtn = document.querySelector('.requests-filter-btn');
  const closeBtn = document.getElementById('requests-filters-close');
  const resetBtn = document.getElementById('requests-filters-reset');
  const applyBtn = document.getElementById('requests-filters-apply');
  const searchInput = document.querySelector('.requests-search-input');
  const establishmentSelect = document.getElementById('requests-filter-establishment');

  if (!modal || !filterBtn || !closeBtn || !resetBtn || !applyBtn || !searchInput || !establishmentSelect) {
    return;
  }

  let closeTimerId = null;

  const getEstablishmentNames = () => {
    const knownItems = getKnownEstablishments()
      .map((item) => item.name)
      .filter(Boolean);
    const taskItems = requestsState.tasks
      .map((task) => String(task.org || '').trim())
      .filter(Boolean);

    return Array.from(new Set([...knownItems, ...taskItems]))
      .sort((a, b) => a.localeCompare(b, 'ru'));
  };

  const populateEstablishmentOptions = () => {
    const options = getEstablishmentNames();
    establishmentSelect.innerHTML = '<option value="">Все заведения</option>';

    options.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      establishmentSelect.appendChild(option);
    });

    establishmentSelect.value = options.includes(requestsFiltersState.establishment)
      ? requestsFiltersState.establishment
      : '';
  };

  const openModal = () => {
    if (closeTimerId) {
      clearTimeout(closeTimerId);
      closeTimerId = null;
    }

    populateEstablishmentOptions();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.classList.add('is-open'));
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    closeTimerId = window.setTimeout(() => {
      modal.classList.add('hidden');
    }, 220);
  };

  searchInput.value = requestsFiltersState.search;
  searchInput.addEventListener('input', () => {
    requestsFiltersState.search = searchInput.value;
    renderRequestsList();
  });

  filterBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  resetBtn.addEventListener('click', () => {
    requestsFiltersState.search = '';
    requestsFiltersState.establishment = '';
    searchInput.value = '';
    establishmentSelect.value = '';
    renderRequestsList();
    closeModal();
  });

  applyBtn.addEventListener('click', () => {
    requestsFiltersState.establishment = establishmentSelect.value;
    renderRequestsList();
    closeModal();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
};

const setupEstablishmentSelection = () => {
  const selectBtn = document.getElementById('select-establishment-btn');
  const profileEstablishmentsBtn = document.getElementById('profile-establishments-btn');
  const selectedDisplay = document.getElementById('selected-establishment');
  const modal = document.getElementById('establishment-modal');
  const closeBtn = document.getElementById('close-establishment-modal-btn');
  const establishmentList = modal?.querySelector('.establishment-list');
  const staffModal = document.getElementById('establishment-staff-modal');
  const staffTitle = document.getElementById('establishment-staff-title');
  const staffList = document.getElementById('establishment-staff-list');
  const staffCloseBtn = document.getElementById('close-establishment-staff-btn');
  let establishmentsMode = 'select';
  const rolesCatalogState = {
    loaded: false,
    roles: []
  };

  if ((!selectBtn && !profileEstablishmentsBtn) || !selectedDisplay || !modal || !closeBtn || !establishmentList) return;

  const normalizeRolesFromCatalogResponse = (result) => {
    const items = Array.isArray(result) ? result : [result];
    return items
      .flatMap((item) => Array.isArray(item?.items) ? item.items : [])
      .map((item) => {
        const roleName = String(item?.values?.[0] ?? '').trim();
        const roleId = String(item?.item_id ?? '').trim();
        if (!roleName || !roleId) return null;
        return {
          role_id: roleId,
          role_name: roleName
        };
      })
      .filter(Boolean);
  };

  const loadRolesCatalog = async () => {
    if (rolesCatalogState.loaded) return rolesCatalogState.roles;
    const result = await window.API?.sendRolesCatalog?.();
    rolesCatalogState.roles = normalizeRolesFromCatalogResponse(result);
    rolesCatalogState.loaded = true;
    return rolesCatalogState.roles;
  };

  const shareEstablishmentInvite = async (establishmentId, establishmentName) => {
    const shareLink = `${BOT_DEEP_LINK_BASE}add_restaurant_${encodeURIComponent(establishmentId)}`;
    const shareText = establishmentName
      ? `Откройте заведение ${establishmentName}`
      : 'Откройте заведение';

    try {
      if (typeof tg?.shareMaxContent === 'function') {
        await Promise.resolve(tg.shareMaxContent({ text: shareText, link: shareLink }));
        return;
      }

      if (typeof tg?.shareContent === 'function') {
        await Promise.resolve(tg.shareContent(shareText, shareLink));
        return;
      }

      if (navigator.share) {
        await navigator.share({ text: shareText, url: shareLink });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
        showPlatformPopup('Ссылка скопирована', 'Ссылка приглашения скопирована в буфер обмена.');
        return;
      }

      showPlatformPopup('Ссылка', shareLink);
    } catch (error) {
      if (error?.message && /cancel/i.test(error.message)) {
        return;
      }
      console.error('❌ Ошибка шеринга заведения:', error);
      showPlatformPopup('Ошибка', 'Не удалось открыть экран отправки ссылки.');
    }
  };

  const renderStaffList = (items = []) => {
    if (!staffList) return;
    if (!items.length) {
      staffList.innerHTML = '<div class="establishment-staff-empty">Сотрудники не найдены</div>';
      return;
    }

    const roleOptions = rolesCatalogState.roles;
    staffList.innerHTML = items.map((item) => {
      const firstName = String(item?.first_name || '').trim();
      const lastName = String(item?.last_name || '').trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Без имени';
      const phone = String(item?.Телефон ?? item?.phone ?? item?.phone_number ?? '').trim() || 'Без телефона';
      const role = String(item?.POST ?? item?.post ?? '').trim();
      const employeeId = String(item?.ID ?? '').trim();
      const roleItemId = String(item?.ITEM_ID ?? '').trim();
      const hasAssignedRole = Boolean(role) && Boolean(roleItemId);
      const roleSelectHtml = roleOptions.length > 0
        ? `
          <select
            class="establishment-staff-role-select"
            data-personal-id="${escapeHtml(employeeId)}"
            data-item-id="${escapeHtml(roleItemId)}"
          >
            ${hasAssignedRole ? '' : '<option value="" selected>Выберите должность</option>'}
            ${roleOptions.map((option) => `
              <option value="${escapeHtml(option.role_id)}" ${hasAssignedRole && option.role_name === role ? 'selected' : ''}>
                ${escapeHtml(option.role_name)}
              </option>
            `).join('')}
          </select>
        `
        : `<div class="establishment-staff-role-select" data-personal-id="${escapeHtml(employeeId)}" data-item-id="${escapeHtml(roleItemId)}">${escapeHtml(role || 'Выберите должность')}</div>`;

      return `
        <div class="establishment-staff-card" data-personal-id="${escapeHtml(employeeId)}" data-item-id="${escapeHtml(roleItemId)}">
          <div class="establishment-staff-head">
            <div class="establishment-staff-main">
              <div class="establishment-staff-name">${escapeHtml(fullName)}</div>
              <div class="establishment-staff-meta">
                <div>${escapeHtml(phone)}</div>
              </div>
            </div>
            <div class="establishment-staff-role">
              ${roleSelectHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  const closeStaffModal = () => {
    if (!staffModal) return;
    staffModal.classList.add('hidden');
    modal.classList.remove('hidden');
    if (tg?.BackButton) {
      if (typeof tg.BackButton.offClick === 'function') {
        tg.BackButton.offClick(closeStaffModal);
      }
      if (typeof tg.BackButton.onClick === 'function') {
        tg.BackButton.onClick(closeModal);
      }
    }
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    if (staffModal) {
      staffModal.classList.add('hidden');
    }
    if (tg?.BackButton) {
      if (typeof tg.BackButton.offClick === 'function') {
        tg.BackButton.offClick(closeModal);
        tg.BackButton.offClick(closeStaffModal);
      }
      if (typeof tg.BackButton.hide === 'function') {
        tg.BackButton.hide();
      }
    }
  };

  const openModal = (e, mode = 'select') => {
    e.preventDefault();
    establishmentsMode = mode;
    modal.classList.remove('hidden');
    if (staffModal) {
      staffModal.classList.add('hidden');
    }
    if (tg?.BackButton) {
      if (typeof tg.BackButton.offClick === 'function') {
        tg.BackButton.offClick(closeModal);
        tg.BackButton.offClick(closeStaffModal);
      }
      if (typeof tg.BackButton.onClick === 'function') {
        tg.BackButton.onClick(closeModal);
      }
      if (typeof tg.BackButton.show === 'function') {
        tg.BackButton.show();
      }
    }
  };

  // Открытие модального окна
  selectBtn?.addEventListener('click', (e) => openModal(e, 'select'));
  profileEstablishmentsBtn?.addEventListener('click', (e) => openModal(e, 'employees'));

  // Закрытие по кнопке "Отмена"
  closeBtn.addEventListener('click', closeModal);
  staffCloseBtn?.addEventListener('click', closeStaffModal);

  // Выбор заведения (делаем делегирование, т.к. список обновляется динамически)
  establishmentList.addEventListener('click', async (e) => {
    const item = e.target.closest('.establishment-item');
    if (!item) return;

    const shareButton = e.target.closest('[data-establishment-share="true"]');
    const establishmentName = String(item.dataset.establishmentName || '').trim();
    const establishmentId = String(item.dataset.establishmentId || '').trim();

    if (shareButton) {
      e.preventDefault();
      e.stopPropagation();
      if (!establishmentId) return;
      await shareEstablishmentInvite(establishmentId, establishmentName);
      return;
    }

    // Обновляем отображение
    selectedDisplay.textContent = establishmentName;
    selectedDisplay.classList.remove('text-gray-400');
    selectedDisplay.classList.add('text-white');

    if (establishmentsMode === 'employees') {
      if (!staffModal || !staffList) return;
      modal.classList.add('hidden');
      staffModal.classList.remove('hidden');
      if (staffTitle) {
        staffTitle.textContent = establishmentName || 'Сотрудники';
      }
      staffList.innerHTML = '<div class="establishment-staff-empty">Загружаем сотрудников...</div>';
      await loadRolesCatalog();
      if (tg?.BackButton) {
        if (typeof tg.BackButton.offClick === 'function') {
          tg.BackButton.offClick(closeModal);
          tg.BackButton.offClick(closeStaffModal);
        }
        if (typeof tg.BackButton.onClick === 'function') {
          tg.BackButton.onClick(closeStaffModal);
        }
        if (typeof tg.BackButton.show === 'function') {
          tg.BackButton.show();
        }
      }

      const result = await window.API?.sendPersonal?.({
        IDREST: establishmentId,
        ID: establishmentId,
        KК: establishmentName,
        KK: establishmentName,
        Client: establishmentName,
        name: establishmentName
      }, user, tg);
      const items = Array.isArray(result) ? result : (result ? [result] : []);
      renderStaffList(items);
      return;
    }

    closeModal();
  });
};

/* ==================== СОЗДАНИЕ ЗАЯВКИ ==================== */

const setupTaskCreation = () => {
  const createBtns = document.querySelectorAll('.btn-Create, .btn-NewRequest');
  const modal = document.getElementById('task-create-modal');
  const sendBtn = document.getElementById('task-send-btn');
  const establishmentSelect = document.getElementById('task-establishment-select');
  const establishmentToggle = document.getElementById('task-establishment-toggle');
  const establishmentToggleText = document.getElementById('task-establishment-toggle-text');
  const establishmentMenu = document.getElementById('task-establishment-menu');
  const establishmentOptions = document.getElementById('task-establishment-options');
  const addEstablishmentBtn = document.getElementById('task-add-establishment-btn');
  const descriptionInput = document.getElementById('task-description-input');
  const filesInput = document.getElementById('task-files-input');
  const attachBtn = document.getElementById('task-attach-btn');
  const filesList = document.getElementById('task-files-list');

  if (
    !createBtns.length ||
    !modal ||
    !sendBtn ||
    !establishmentSelect ||
    !establishmentToggle ||
    !establishmentToggleText ||
    !establishmentMenu ||
    !establishmentOptions ||
    !addEstablishmentBtn ||
    !descriptionInput ||
    !filesInput ||
    !attachBtn ||
    !filesList
  ) return;
  let isTaskCreateSubmitting = false;
  let isTaskCreatePreparingFiles = false;
  let taskCreateFilesPrepareToken = 0;

  const getEstablishmentsFromMainDropdown = () => {
    const dropdown = document.getElementById('main-dropdown');
    if (!dropdown) return { items: [], selectedId: '' };

    const items = getKnownEstablishments();
    const selectedId = (dropdown.value || '').trim();
    return { items, selectedId };
  };

  const renderSelectedFiles = () => {
    const files = Array.from(filesInput.files || []);
    filesList.innerHTML = '';
    const totalSizeBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const totalSizeMb = totalSizeBytes / (1024 * 1024);
    const totalSizeLabel = totalSizeMb >= 1
      ? `${totalSizeMb.toFixed(totalSizeMb >= 10 ? 0 : 1)} МБ`
      : `${Math.max(1, Math.ceil(totalSizeBytes / 1024))} КБ`;

    document.querySelector('.task-create-file-row')?.classList.toggle('has-files', files.length > 0);
    attachBtn.classList.toggle('is-compact', files.length > 0);

    if (!files.length) return;

    filesList.innerHTML = `
      <div class="task-create-file-summary">
        <div class="task-create-file-indicator${isTaskCreatePreparingFiles || isTaskCreateSubmitting ? ' is-busy' : ''}" aria-hidden="true">
          <span class="task-create-file-indicator__count">${files.length}</span>
        </div>
        <button type="button" class="task-create-file-remove" aria-label="Удалить файлы">
          <i class="fas fa-trash-alt" aria-hidden="true"></i>
        </button>
        <div class="task-create-file-meta">
          <div class="task-create-file-title">Файлов: ${files.length}</div>
          <div class="task-create-file-size">${totalSizeLabel}</div>
          ${isTaskCreatePreparingFiles ? '<div class="task-create-file-uploading">Подготавливаем файлы...</div>' : (isTaskCreateSubmitting ? '<div class="task-create-file-uploading">Отправляем заявку...</div>' : '')}
        </div>
      </div>
    `;
  };

  const updateSendButtonState = () => {
    const hasEstablishment = Boolean((establishmentSelect.value || '').trim());
    const hasDescription = Boolean((descriptionInput.value || '').trim());
    const hasFiles = Array.from(filesInput.files || []).length > 0;
    const isReady = hasEstablishment && hasDescription && !isTaskCreateSubmitting && !isTaskCreatePreparingFiles;

    sendBtn.disabled = !isReady;
    if (isTaskCreatePreparingFiles) {
      sendBtn.textContent = hasFiles ? 'Подготавливаем файлы...' : 'Подготавливаем...';
    } else if (isTaskCreateSubmitting) {
      sendBtn.textContent = 'Создаем...';
    } else if (!hasEstablishment) {
      sendBtn.textContent = 'Выберите заведение';
    } else if (!hasDescription) {
      sendBtn.textContent = 'Заполните описание';
    } else {
      sendBtn.textContent = 'Создать';
    }
    sendBtn.classList.toggle('is-disabled', !isReady);
    sendBtn.classList.toggle('is-loading', isTaskCreateSubmitting || isTaskCreatePreparingFiles);
  };

  const setEstablishmentValue = (value = '') => {
    establishmentSelect.value = value;
    const activeOption = Array.from(establishmentSelect.options).find((option) => option.value === value);
    establishmentToggleText.textContent = activeOption?.textContent?.trim() || 'Выберите заведение';
    updateSendButtonState();
  };

  const toggleEstablishmentMenu = (isOpen) => {
    establishmentMenu.classList.toggle('hidden', !isOpen);
    establishmentToggle.classList.toggle('is-open', isOpen);
    establishmentToggle.setAttribute('aria-expanded', String(isOpen));
  };

  const renderEstablishmentPicker = (preferredId = '') => {
    const { items, selectedId } = getEstablishmentsFromMainDropdown();
    const nextSelectedId =
      preferredId ||
      selectedId ||
      (items.length === 1 ? items[0].id : '');

    establishmentSelect.innerHTML = '<option value="">Выберите заведение</option>';
    establishmentOptions.innerHTML = '';

    if (items.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'task-establishment-empty';
      emptyState.textContent = 'Заведений пока нет';
      establishmentOptions.appendChild(emptyState);
    }

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      establishmentSelect.appendChild(option);

      const itemButton = document.createElement('button');
      itemButton.type = 'button';
      itemButton.className = 'task-establishment-option';
      itemButton.dataset.id = item.id;
      itemButton.innerHTML = `<span>${escapeHtml(item.name)}</span><i class="fas fa-check" aria-hidden="true"></i>`;
      if (item.id === nextSelectedId) {
        itemButton.classList.add('is-selected');
      }
      establishmentOptions.appendChild(itemButton);
    });

    addEstablishmentBtn.classList.remove('hidden');
    setEstablishmentValue(items.some((item) => item.id === nextSelectedId) ? nextSelectedId : '');
    toggleEstablishmentMenu(false);
  };

  const handlePlatformBack = () => {
    closeModal();
  };

  const syncPlatformBackButton = (isVisible) => {
    const bridgeBackButton = tg?.BackButton;
    if (!bridgeBackButton) return;

    if (typeof bridgeBackButton.offClick === 'function') {
      bridgeBackButton.offClick(handlePlatformBack);
    }

    if (isVisible) {
      if (typeof bridgeBackButton.onClick === 'function') {
        bridgeBackButton.onClick(handlePlatformBack);
      }
      if (typeof bridgeBackButton.show === 'function') {
        bridgeBackButton.show();
      }
      return;
    }

    if (typeof bridgeBackButton.hide === 'function') {
      bridgeBackButton.hide();
    }
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    toggleEstablishmentMenu(false);
    syncPlatformBackButton(false);
    isTaskCreateSubmitting = false;
    isTaskCreatePreparingFiles = false;
    taskCreateFilesPrepareToken += 1;
    attachBtn.disabled = false;
    filesInput.disabled = false;
    descriptionInput.disabled = false;
    establishmentToggle.disabled = false;
    updateSendButtonState();
  };

  const openModal = () => {
    isTaskCreateSubmitting = false;
    isTaskCreatePreparingFiles = false;
    renderEstablishmentPicker();
    descriptionInput.value = '';
    filesInput.value = '';
    renderSelectedFiles();
    modal.classList.remove('hidden');
    syncPlatformBackButton(true);
  };

  const sendTaskHandler = async () => {
    const establishmentId = (establishmentSelect.value || '').trim();
    const establishmentName = (establishmentSelect.options[establishmentSelect.selectedIndex]?.textContent || '').trim();
    const description = (descriptionInput.value || '').trim();
    const files = Array.from(filesInput.files || []);

    if (!establishmentId) {
      return;
    }

    if (!description) {
      showPlatformPopup('Пустое описание', 'Добавьте описание проблемы.');
      return;
    }

    if (!window.API?.createTaskV2) {
      showPlatformPopup('Ошибка', 'Метод API.createTaskV2 не найден.');
      return;
    }

    if (isTaskCreatePreparingFiles) {
      return;
    }

    isTaskCreateSubmitting = true;
    attachBtn.disabled = true;
    filesInput.disabled = true;
    descriptionInput.disabled = true;
    establishmentToggle.disabled = true;
    renderSelectedFiles();
    updateSendButtonState();
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const taskData = {
        title: 'Новая заявка',
        description,
        establishment_id: establishmentId,
        establishment_name: establishmentName,
        restaurant_id: establishmentId,
        restaurant_name: establishmentName,
        Client: establishmentName,
        ID: establishmentId,
        files_count: files.length,
        source: `${platformName}_webapp`
      };

      const result = await window.API.createTaskV2(taskData, user, tg, files);
      if (result) {
        const createdTask = syncCreatedTasksFromResult(result);
        markMatchingTaskMessagesAsOutgoing(createdTask, description);
        ensureCreatedTaskStartsWithOutgoingMessage(createdTask, description);
        const mainDropdown = document.getElementById('main-dropdown');
        if (mainDropdown && Array.from(mainDropdown.options).some((o) => o.value === establishmentId)) {
          mainDropdown.value = establishmentId;
        }
        closeModal();
        document.querySelector('.nav-btn[data-page="requests"]')?.click();
        if (createdTask?.taskId) {
          setTimeout(() => {
            document.querySelector(`.request-card[data-task-id="${createdTask.taskId}"]`)?.click();
          }, 80);
        }
      }

      showPlatformPopup(
        result ? 'Заявка создана' : 'Ошибка',
        result
          ? 'Заявка отправлена в TaskV2.'
          : 'Не удалось отправить заявку. Проверьте сеть и логи.'
      );
    } finally {
      isTaskCreateSubmitting = false;
      attachBtn.disabled = false;
      filesInput.disabled = false;
      descriptionInput.disabled = false;
      establishmentToggle.disabled = false;
      renderSelectedFiles();
      updateSendButtonState();
    }
  };

  const openHandler = (event) => {
    event.preventDefault();
    openModal();
  };

  createBtns.forEach((btn) => btn.addEventListener('click', openHandler));
  establishmentToggle.addEventListener('click', () => {
    toggleEstablishmentMenu(establishmentMenu.classList.contains('hidden'));
  });
  establishmentOptions.addEventListener('click', (event) => {
    const optionButton = event.target.closest('.task-establishment-option');
    if (!optionButton) return;

    setEstablishmentValue(optionButton.dataset.id || '');
    renderEstablishmentPicker(optionButton.dataset.id || '');
    toggleEstablishmentMenu(false);
  });
  addEstablishmentBtn.addEventListener('click', async () => {
    const restaurants = await startAddRestaurantFlow();
    const preferredId = restaurants[0]?.id || '';
    renderEstablishmentPicker(preferredId);
  });
  attachBtn.addEventListener('click', () => filesInput.click());
  filesInput.addEventListener('change', () => {
    const currentToken = ++taskCreateFilesPrepareToken;
    const files = Array.from(filesInput.files || []);
    isTaskCreatePreparingFiles = files.length > 0;
    attachBtn.disabled = isTaskCreatePreparingFiles;
    renderSelectedFiles();
    updateSendButtonState();

    if (!files.length) {
      isTaskCreatePreparingFiles = false;
      attachBtn.disabled = false;
      renderSelectedFiles();
      updateSendButtonState();
      return;
    }

    Promise.all(files.map((file) => file.arrayBuffer().catch(() => null)))
      .finally(() => {
        if (currentToken !== taskCreateFilesPrepareToken) return;
        isTaskCreatePreparingFiles = false;
        attachBtn.disabled = false;
        renderSelectedFiles();
        updateSendButtonState();
      });
  });
  filesList.addEventListener('click', (event) => {
    if (!event.target.closest('.task-create-file-remove')) return;
    taskCreateFilesPrepareToken += 1;
    isTaskCreatePreparingFiles = false;
    attachBtn.disabled = false;
    filesInput.value = '';
    renderSelectedFiles();
    updateSendButtonState();
  });
  descriptionInput.addEventListener('input', updateSendButtonState);
  sendBtn.addEventListener('click', sendTaskHandler);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('click', (event) => {
    if (!modal.classList.contains('hidden') && !event.target.closest('.task-establishment-picker')) {
      toggleEstablishmentMenu(false);
    }
  });
};

/* ==================== ДЕТАЛИ ЗАЯВКИ ==================== */

const setupRequestDetailsView = () => {
  const requestsList = document.getElementById('requests-list');
  const dialogModal = document.getElementById('request-dialog-modal');
  const dialogChat = dialogModal?.querySelector('.request-dialog-chat');
  const input = document.getElementById('request-dialog-input');
  const sendBtn = document.getElementById('request-dialog-send');
  const attachBtn = document.getElementById('request-dialog-attach');
  const fileInput = document.getElementById('request-dialog-file');
  const filePreview = document.getElementById('request-dialog-file-preview');
  const composer = dialogModal?.querySelector('.request-dialog-composer');
  const closedBanner = document.getElementById('request-dialog-closed');
  const dialogRefreshModal = document.getElementById('dialog-refresh-modal');
  const dialogRefreshTitle = document.getElementById('dialog-refresh-title');
  const dialogRefreshText = document.getElementById('dialog-refresh-text');
  const dialogRefreshBtn = document.getElementById('dialog-refresh-btn');

  if (!requestsList || !dialogModal || !dialogChat || !input || !sendBtn || !attachBtn || !fileInput || !filePreview || !composer || !closedBanner || !dialogRefreshModal || !dialogRefreshBtn || !dialogRefreshTitle || !dialogRefreshText) return;
  let isDialogRequestInFlight = false;
  let selectedDialogFile = null;
  let isOpeningFilePicker = false;
  let dialogRefreshContext = 'dialog';

  const hideDialogRefreshModal = () => {
    dialogRefreshModal.classList.add('hidden');
    dialogRefreshModal.setAttribute('aria-hidden', 'true');
  };

  const showDialogRefreshModal = (context = 'dialog') => {
    dialogRefreshContext = context;
    if (context === 'requests') {
      dialogRefreshTitle.textContent = 'Обновить данные?';
      dialogRefreshText.textContent = 'Автообновление заявок остановлено. Нажмите кнопку, чтобы заново получить данные.';
    } else {
      dialogRefreshTitle.textContent = 'Обновить диалог?';
      dialogRefreshText.textContent = 'Автообновление диалога остановлено. Нажмите кнопку, чтобы заново подгрузить сообщения.';
    }
    dialogRefreshModal.classList.remove('hidden');
    dialogRefreshModal.setAttribute('aria-hidden', 'false');
  };

  const stopDialogRefreshReminder = () => {
    hideDialogRefreshModal();
  };

  const getCurrentTimeLabel = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const stopOpenChatPolling = () => {
    if (openChatPollState.timerId) {
      clearTimeout(openChatPollState.timerId);
    }
    openChatPollState.timerId = null;
    openChatPollState.taskId = null;
    openChatPollState.attempt = 0;
  };

  const stopRequestsListOpenChatPolling = () => {
    if (requestsOpenChatPollState.timerId) {
      clearTimeout(requestsOpenChatPollState.timerId);
    }
    requestsOpenChatPollState.timerId = null;
    requestsOpenChatPollState.attempt = 0;
    requestsOpenChatPollState.inFlight = false;
  };

  const stopDeepLinkOpenPolling = () => {
    if (requestDeepLinkState.timerId) {
      clearTimeout(requestDeepLinkState.timerId);
    }
    requestDeepLinkState.timerId = null;
  };

  const closeDialog = () => {
    stopOpenChatPolling();
    stopDialogRefreshReminder();
    dialogModal.classList.add('hidden');
    dialogChat.innerHTML = '';
    requestsState.activeTaskId = null;
    input.value = '';
    clearSelectedDialogFile();

    const bridgeBackButton = tg?.BackButton;
    if (bridgeBackButton) {
      if (typeof bridgeBackButton.offClick === 'function') {
        bridgeBackButton.offClick(closeDialog);
      }
      if (typeof bridgeBackButton.hide === 'function') {
        bridgeBackButton.hide();
      }
    }

    if (document.getElementById('requests')?.classList.contains('active')) {
      syncOpenTasksForKnownEstablishments({ force: true }).then(() => {
        window.startRequestsListOpenChatPolling?.();
      });
    }
  };

  const requestOpenChat = async (task) => {
    if (!window.API?.sendOpenChat || !task) return null;

    try {
      const result = await window.API.sendOpenChat({
        task_id: task.taskId,
        chat_id: task.chatId,
        org: task.org
      }, user, tg);

      if (!result) return null;
      const updatedTask = syncOpenedChatFromResult(result, task.taskId);
      if (updatedTask && updatedTask.taskId === requestsState.activeTaskId) {
        renderDialogChat(updatedTask);
        updateDialogComposerState(updatedTask);
      }
      return updatedTask;
    } catch (error) {
      console.error('❌ Ошибка загрузки open_chat:', error);
      return null;
    }
  };

  const pollRequestsListOpenChats = async () => {
    if (requestsOpenChatPollState.inFlight || !window.API?.sendOpenChat) return;
    if (!document.getElementById('requests')?.classList.contains('active')) return;
    if (!dialogModal.classList.contains('hidden')) return;

    const tasksToPoll = requestsState.tasks.filter((task) => (
      task?.taskId
      && !isTaskClosed(task)
    ));

    if (!tasksToPoll.length) return;

    requestsOpenChatPollState.inFlight = true;
    try {
      for (const task of tasksToPoll) {
        if (!document.getElementById('requests')?.classList.contains('active')) break;
        if (!dialogModal.classList.contains('hidden')) break;
        await requestOpenChat(task);
      }
    } finally {
      requestsOpenChatPollState.inFlight = false;
    }
  };

  const scheduleRequestsListOpenChatPolling = () => {
    stopRequestsListOpenChatPolling();
    requestsOpenChatPollState.attempt = 0;

    const poll = async () => {
      if (!document.getElementById('requests')?.classList.contains('active') || !dialogModal.classList.contains('hidden')) {
        stopRequestsListOpenChatPolling();
        return;
      }

      await pollRequestsListOpenChats();

      const delay = getNextOpenChatPollDelay(requestsOpenChatPollState.attempt);
      if (delay == null) {
        stopRequestsListOpenChatPolling();
        showDialogRefreshModal('requests');
        return;
      }

      requestsOpenChatPollState.attempt += 1;
      requestsOpenChatPollState.timerId = setTimeout(poll, delay);
    };

    const initialDelay = getNextOpenChatPollDelay(requestsOpenChatPollState.attempt);
    if (initialDelay == null) {
      showDialogRefreshModal('requests');
      return;
    }

    requestsOpenChatPollState.attempt += 1;
    requestsOpenChatPollState.timerId = setTimeout(poll, initialDelay);
  };

  const scheduleOpenChatPolling = (taskId) => {
    stopOpenChatPolling();
    openChatPollState.taskId = String(taskId);
    openChatPollState.attempt = 0;

    const poll = async () => {
      if (
        !dialogModal.classList.contains('hidden') &&
        requestsState.activeTaskId === openChatPollState.taskId
      ) {
        const activeTask = requestsState.tasks.find((item) => item.taskId === openChatPollState.taskId);
        await requestOpenChat(activeTask);
      }

      if (
        dialogModal.classList.contains('hidden') ||
        requestsState.activeTaskId !== openChatPollState.taskId
      ) {
        stopOpenChatPolling();
        return;
      }

      const delay = getNextOpenChatPollDelay(openChatPollState.attempt);
      if (delay == null) {
        stopOpenChatPolling();
        showDialogRefreshModal('dialog');
        return;
      }
      openChatPollState.attempt += 1;
      openChatPollState.timerId = setTimeout(poll, delay);
    };

    const initialDelay = getNextOpenChatPollDelay(openChatPollState.attempt);
    if (initialDelay == null) {
      showDialogRefreshModal('dialog');
      return;
    }
    openChatPollState.attempt += 1;
    openChatPollState.timerId = setTimeout(poll, initialDelay);
  };

  const restartDialogRefreshFlow = async () => {
    hideDialogRefreshModal();
    if (dialogRefreshContext === 'requests') {
      await syncOpenTasksForKnownEstablishments({ force: true });
      scheduleRequestsListOpenChatPolling();
      return;
    }
    const activeTask = requestsState.tasks.find((item) => item.taskId === requestsState.activeTaskId);
    if (!activeTask || isDialogRequestInFlight) return;
    await requestOpenChat(activeTask);
    scheduleOpenChatPolling(activeTask.taskId);
  };

  const renderDialogChat = (task) => {
    dialogChat.innerHTML = '';
    const visibleMessages = Array.isArray(task?.chat)
      ? task.chat.filter((message) => !isHiddenSystemTaskComment(message))
      : [];
    if (!task || visibleMessages.length === 0) {
      dialogChat.innerHTML = '<div class="request-chat-empty">Сообщений пока нет</div>';
      return;
    }

    visibleMessages.forEach((message) => {
      const isOutgoing = Boolean(message.isOutgoing);
      const isVenueStaffIncoming = !isOutgoing && message.senderType === 'сотрудник заведения';
      const msg = document.createElement('div');
      msg.className = `request-msg ${isOutgoing ? 'request-msg-right request-msg-outgoing' : 'request-msg-left'}${isVenueStaffIncoming ? ' request-msg-staff' : ''}`;
      const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
      msg.innerHTML = `
        ${isOutgoing ? '' : '<div class="request-msg-author"></div>'}
        <div class="request-msg-body"></div>
        <div class="request-msg-time"></div>
      `;
      const authorElement = msg.querySelector('.request-msg-author');
      if (authorElement) {
        authorElement.textContent = message.author;
      }
      const bodyElement = msg.querySelector('.request-msg-body');
      if (bodyElement) {
        if (hasAttachments) {
          const attachmentsHtml = message.attachments
            .map((attachment) => renderFileChipHtml(attachment))
            .join('');
          bodyElement.innerHTML = `
            ${message.text ? `<div class="request-msg-text">${escapeHtml(message.text)}</div>` : ''}
            <div class="request-file-list">${attachmentsHtml}</div>
          `;
          bodyElement.querySelectorAll('.request-file-chip').forEach((chipElement, index) => {
            const attachment = message.attachments[index];
            if (!attachment) return;
            const hasLocalPending = Boolean(attachment.localCacheKey);
            if (!hasLocalPending && !attachment.id && !attachment.url) return;
            chipElement.dataset.taskId = message.taskId || task.taskId || '';
            chipElement.dataset.commentId = message.commentId || '';
            chipElement.dataset.chatId = task.chatId || '';
            chipElement.dataset.org = task.org || '';
            const openAttachment = (event) => {
              event.preventDefault();
              event.stopPropagation();
              handleAttachmentOpen(chipElement);
            };
            chipElement.onclick = openAttachment;
          });
        } else {
          bodyElement.innerHTML = `<div class="request-msg-text">${escapeHtml(message.text)}</div>`;
        }
      }
      msg.querySelector('.request-msg-time').textContent = formatRequestDate(message.date) || getCurrentTimeLabel();
      dialogChat.appendChild(msg);
    });

    dialogChat.scrollTop = dialogChat.scrollHeight;
  };

  const updateDialogComposerState = (task) => {
    const isClosed = isTaskClosed(task);
    composer.classList.toggle('hidden', isClosed);
    closedBanner.classList.toggle('hidden', !isClosed);
    input.disabled = isClosed;
    sendBtn.disabled = isClosed || isDialogRequestInFlight;
    attachBtn.disabled = isClosed || isDialogRequestInFlight;
    if (isClosed) {
      input.value = '';
      fileInput.value = '';
      selectedDialogFile = null;
      renderSelectedDialogFile();
    }
  };

  const renderSelectedDialogFile = () => {
    if (!selectedDialogFile) {
      filePreview.innerHTML = '';
      filePreview.classList.add('hidden');
      return;
    }

    filePreview.classList.remove('hidden');
    filePreview.innerHTML = `
      <div class="request-composer-file-preview-icon">
        <i class="fas fa-file" aria-hidden="true"></i>
      </div>
      <div class="request-composer-file-preview-meta">
        <div class="request-composer-file-preview-name">${escapeHtml(selectedDialogFile.name || 'Файл')}</div>
        <div class="request-composer-file-preview-size">${escapeHtml(formatFileSize(selectedDialogFile.size))}</div>
      </div>
      <button type="button" class="request-composer-file-preview-remove" aria-label="Убрать файл">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    `;
  };

  const clearSelectedDialogFile = () => {
    selectedDialogFile = null;
    fileInput.value = '';
    renderSelectedDialogFile();
  };

  const openDialog = (taskId) => {
    const task = requestsState.tasks.find((item) => item.taskId === String(taskId));
    if (!task) return;
    requestsState.activeTaskId = task.taskId;
    markTaskAsRead(task.taskId);
    renderRequestsList();
    input.value = '';
    clearSelectedDialogFile();

    const dialogNumber = document.getElementById('request-dialog-number');
    const dialogStatus = document.getElementById('request-dialog-status');
    const dialogTopic = document.getElementById('request-dialog-topic');
    const dialogCompany = document.getElementById('request-dialog-company');

    if (dialogNumber) dialogNumber.textContent = `№${task.taskId} от ${formatRequestDate(task.createdAt)}`;
    if (dialogStatus) {
      dialogStatus.textContent = task.status;
      dialogStatus.className = `request-status ${getStatusClass(task.status)}`;
    }
    if (dialogTopic) dialogTopic.textContent = task.description || 'Без описания';
    if (dialogCompany) dialogCompany.textContent = task.org;

    dialogChat.innerHTML = '<div class="request-chat-empty">Загрузка...</div>';
    updateDialogComposerState(task);
    dialogModal.classList.remove('hidden');
    bindBackButtonToDialog();
    stopRequestsListOpenChatPolling();
    requestOpenChat(task).then((updatedTask) => {
      if (requestsState.activeTaskId === task.taskId) {
        renderDialogChat(updatedTask || task);
      }
    });
    scheduleOpenChatPolling(task.taskId);
  };

  const openDeepLinkedRequest = () => {
    const deepLinkedChatId = requestDeepLinkState.type === 'chat'
      ? String(requestDeepLinkState.value || '').trim()
      : '';
    if (!deepLinkedChatId || requestDeepLinkState.handled) return false;

    const task = requestsState.tasks.find((item) => String(item.chatId || '').trim() === deepLinkedChatId);
    if (!task?.taskId) return false;

    stopDeepLinkOpenPolling();
    requestDeepLinkState.handled = true;

    const requestsNavBtn = document.querySelector('.nav-btn[data-page="requests"]');
    if (!document.getElementById('requests')?.classList.contains('active')) {
      requestsNavBtn?.click();
    }

    openDialog(task.taskId);
    return true;
  };

  const openDeepLinkedRestaurant = async () => {
    const restaurantId = requestDeepLinkState.type === 'add_restaurant'
      ? String(requestDeepLinkState.value || '').trim()
      : '';
    if (!restaurantId || requestDeepLinkState.handled) return false;

    const existingRestaurant = getKnownEstablishments().find((item) => item.id === restaurantId);
    if (existingRestaurant) {
      const dropdown = document.getElementById('main-dropdown');
      if (dropdown) {
        dropdown.value = restaurantId;
      }
      stopDeepLinkOpenPolling();
      requestDeepLinkState.handled = true;
      showPlatformPopup('Заведение', `Заведение добавлено: ${existingRestaurant.name}`);
      return true;
    }

    if (!window.API?.sendQrData || requestDeepLinkState.inFlight) return false;
    requestDeepLinkState.handled = true;
    stopDeepLinkOpenPolling();

    const executeRestaurantDeepLink = async () => {
      requestDeepLinkState.inFlight = true;
      try {
        const qrPayload = `${BOT_DEEP_LINK_BASE}add_restaurant_${restaurantId}`;
        const result = await window.API.sendQrData(qrPayload, user);
        const qrRestaurants = normalizeRestaurantsFromQrResponse(result);
        if (qrRestaurants.length > 0) {
          applyRestaurants(qrRestaurants);
        }

        let refreshedRestaurants = [];
        if (window.API?.sendClientTGSupport) {
          const clientSupportResult = await fetchClientSupport({ force: true, cacheMs: 0 });
          applyClientSupportResponse(clientSupportResult);
          refreshedRestaurants = normalizeRestaurantsFromClientSupportResponse(clientSupportResult);
        }

        const restaurants = mergeRestaurants(getKnownEstablishments(), qrRestaurants, refreshedRestaurants);
        if (restaurants.length === 0) return false;

        const dropdown = document.getElementById('main-dropdown');
        if (dropdown && restaurants.some((item) => item.id === restaurantId)) {
          dropdown.value = restaurantId;
        }
        stopDeepLinkOpenPolling();
        requestDeepLinkState.handled = true;
        const addedRestaurant = restaurants.find((item) => item.id === restaurantId) || restaurants[0];
        showPlatformPopup('Заведение', `Заведение добавлено: ${addedRestaurant?.name || restaurantId}`);
        return true;
      } catch (error) {
        console.error('❌ Ошибка deep link add_restaurant:', error);
        return false;
      } finally {
        requestDeepLinkState.inFlight = false;
      }
    };

    const isAuthorized = await hasAuthorizedClientAccess();
    if (!isAuthorized) {
      requestDeepLinkState.awaitingAuthorization = true;
      schedulePendingAuthorizedAction(executeRestaurantDeepLink, 0);
      setContactShareLoading(false);
      showContactShareModal();
      return false;
    }

    requestDeepLinkState.awaitingAuthorization = false;
    return executeRestaurantDeepLink();
  };

  const scheduleDeepLinkOpen = () => {
    if (!requestDeepLinkState.rawParam || requestDeepLinkState.handled || requestDeepLinkState.awaitingAuthorization) return;

    if (requestDeepLinkState.type === 'chat') {
      if (openDeepLinkedRequest()) return;
    } else if (requestDeepLinkState.type === 'add_restaurant') {
      openDeepLinkedRestaurant();
      return;
    } else {
      return;
    }

    stopDeepLinkOpenPolling();
    if (requestDeepLinkState.attempt >= 20) return;

    const delay = requestDeepLinkState.attempt < 5 ? 400 : 1200;
    requestDeepLinkState.attempt += 1;
    requestDeepLinkState.timerId = window.setTimeout(() => {
      scheduleDeepLinkOpen();
    }, delay);
  };

  requestDeepLinkState.rawParam = getMiniAppStartParam();
  const parsedStartParam = parseMiniAppStartParam(requestDeepLinkState.rawParam);
  requestDeepLinkState.type = parsedStartParam.type;
  requestDeepLinkState.value = parsedStartParam.value;
  window.tryOpenDeepLinkedRequest = scheduleDeepLinkOpen;
  scheduleDeepLinkOpen();

  const sendMessageToMiniappWebhook = async (activeTask, payload, files = []) => {
    if (!window.API?.sendMiniappMessage || !activeTask) return;

    const result = await window.API.sendMiniappMessage({
      task_id: activeTask.taskId,
      chat_id: activeTask.chatId,
      org: activeTask.org,
      text: payload?.text ?? null,
      message_type: payload?.message_type ?? 'text',
      file_name: payload?.file_name ?? null
    }, user, tg, files);

    if (!result) {
      throw new Error('message_miniapp returned empty response');
    }

    return result;
  };

  const formatFileSize = (sizeBytes) => {
    const size = Number(sizeBytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };
  const fileViewerModal = document.getElementById('file-viewer-modal');
  const fileViewerBody = document.getElementById('file-viewer-body');
  const fileViewerTitle = document.getElementById('file-viewer-title');
  const fileViewerDownloadHeader = document.getElementById('file-viewer-download-header');
  let currentFileViewerUrl = '';
  let currentFileViewerName = '';
  let currentFileViewerBlob = null;
  let lastAttachmentOpenAt = 0;

  const updateFileViewerHeaderDownload = () => {
    if (!fileViewerDownloadHeader) return;
    const isReady = Boolean(currentFileViewerUrl && currentFileViewerName);
    fileViewerDownloadHeader.classList.toggle('hidden', !isReady);
    fileViewerDownloadHeader.disabled = !isReady;
  };

  const setFileViewerBodyMode = (mode = 'center') => {
    if (!fileViewerBody) return;
    fileViewerBody.classList.toggle('is-document', mode === 'document');
  };

  const bindBackButtonTo = (handler) => {
    if (!tg?.BackButton) return;
    if (typeof tg.BackButton.offClick === 'function') {
      tg.BackButton.offClick(closeDialog);
      tg.BackButton.offClick(closeFileViewer);
    }
    if (typeof tg.BackButton.onClick === 'function') {
      tg.BackButton.onClick(handler);
    }
    if (typeof tg.BackButton.show === 'function') {
      tg.BackButton.show();
    }
  };

  const bindBackButtonToDialog = () => bindBackButtonTo(closeDialog);
  const bindBackButtonToFileViewer = () => bindBackButtonTo(closeFileViewer);

  const closeFileViewer = () => {
    if (!fileViewerModal || !fileViewerBody || !fileViewerTitle) return;
    fileViewerModal.classList.add('hidden');
    fileViewerModal.setAttribute('aria-hidden', 'true');
    fileViewerBody.innerHTML = '';
    setFileViewerBodyMode('center');
    fileViewerBody.scrollTop = 0;
    fileViewerTitle.textContent = 'Файл';
    currentFileViewerName = '';
    currentFileViewerBlob = null;
    if (currentFileViewerUrl) {
      URL.revokeObjectURL(currentFileViewerUrl);
      currentFileViewerUrl = '';
    }
    updateFileViewerHeaderDownload();
    if (dialogModal && !dialogModal.classList.contains('hidden')) {
      bindBackButtonToDialog();
    }
  };

  const openFileViewerShell = (title = 'Файл') => {
    if (!fileViewerModal || !fileViewerBody || !fileViewerTitle) return;
    fileViewerTitle.textContent = title;
    fileViewerModal.classList.remove('hidden');
    fileViewerModal.setAttribute('aria-hidden', 'false');
    fileViewerBody.scrollTop = 0;
  };

  const setFileViewerLoading = (title = 'Файл') => {
    if (!fileViewerBody) return;
    openFileViewerShell(title);
    fileViewerBody.innerHTML = `
      <div class="file-viewer-state">
        <div class="file-viewer-spinner" aria-hidden="true"></div>
        <div class="file-viewer-state-title">Загружаем файл</div>
        <div class="file-viewer-state-text">Подготавливаем просмотр внутри mini app.</div>
      </div>
    `;
  };

  const setFileViewerError = (title, message) => {
    if (!fileViewerBody) return;
    openFileViewerShell(title);
    fileViewerBody.innerHTML = `
      <div class="file-viewer-state">
        <div class="file-viewer-fallback-icon"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i></div>
        <div class="file-viewer-state-title">Не удалось открыть файл</div>
        <div class="file-viewer-state-text">${escapeHtml(message)}</div>
      </div>
    `;
  };

  const downloadBlobFile = (blobUrl, fileName) => {
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const saveFileFromViewer = async (blob, blobUrl, fileName) => {
    if (blob instanceof Blob && navigator.share && navigator.canShare) {
      try {
        const shareFile = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        if (navigator.canShare({ files: [shareFile] })) {
          await navigator.share({ files: [shareFile], title: fileName });
          return;
        }
      } catch (error) {
        console.warn('⚠️ [FileViewer] Share save failed, fallback to download:', error);
      }
    }
    downloadBlobFile(blobUrl, fileName);
  };

  const getPdfJsLib = () => {
    const lib = window.pdfjsLib || null;
    if (!lib) return null;
    if (typeof lib.GlobalWorkerOptions?.workerSrc !== 'string' || !lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    return lib;
  };

  const renderPdfIntoViewer = async (blob, fileName, blobUrl) => {
    const pdfjsLib = getPdfJsLib();
    if (!pdfjsLib || !fileViewerBody) return false;
    setFileViewerBodyMode('document');
    fileViewerBody.scrollTop = 0;

    fileViewerBody.innerHTML = `
      <div class="file-viewer-state">
        <div class="file-viewer-spinner" aria-hidden="true"></div>
        <div class="file-viewer-state-title">Подготавливаем PDF</div>
        <div class="file-viewer-state-text">Рендерим страницы для просмотра внутри mini app.</div>
      </div>
    `;

    let pdfDocument = null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      pdfDocument = await loadingTask.promise;
      const totalPages = Math.min(pdfDocument.numPages, 12);

      fileViewerBody.innerHTML = `<div class="file-viewer-pdf-pages"></div>`;
      const pagesContainer = fileViewerBody.querySelector('.file-viewer-pdf-pages');
      if (!pagesContainer) return false;

      const containerWidth = Math.min(fileViewerBody.clientWidth || 980, 980);
      const targetWidth = Math.max(320, containerWidth - 8);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const pages = await Promise.all(
        Array.from({ length: totalPages }, (_, i) => pdfDocument.getPage(i + 1))
      );

      for (const page of pages) {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.className = 'file-viewer-pdf-page-canvas';
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) continue;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;

        const pageCard = document.createElement('div');
        pageCard.className = 'file-viewer-pdf-page';
        pageCard.appendChild(canvas);
        pagesContainer.appendChild(pageCard);
      }

      if (pdfDocument.numPages > 12) {
        const note = document.createElement('div');
        note.className = 'file-viewer-pdf-note';
        note.textContent = `Показаны первые 12 страниц из ${pdfDocument.numPages}. Полный файл можно скачать.`;
        pagesContainer.appendChild(note);
      }
      requestAnimationFrame(() => {
        fileViewerBody.scrollTop = 0;
      });

      return true;
    } catch (error) {
      console.warn('⚠️ [FileViewer] PDF render failed:', error);
      fileViewerBody.innerHTML = `
        <div class="file-viewer-fallback">
          <div class="file-viewer-fallback-icon"><i class="fas fa-file-pdf" aria-hidden="true"></i></div>
          <div class="file-viewer-fallback-name">${escapeHtml(fileName)}</div>
          <div class="file-viewer-fallback-size">${formatFileSize(blob.size)}</div>
          <button id="file-viewer-open-pdf" class="file-viewer-download" type="button">Открыть PDF</button>
          <button id="file-viewer-download" class="file-viewer-download file-viewer-download-secondary" type="button">Скачать файл</button>
        </div>
      `;
      fileViewerBody.querySelector('#file-viewer-open-pdf')?.addEventListener('click', () => {
        if (typeof tg?.openLink === 'function') {
          tg.openLink(blobUrl);
          return;
        }
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      });
      fileViewerBody.querySelector('#file-viewer-download')?.addEventListener('click', () => {
        downloadBlobFile(blobUrl, fileName);
      });
      return false;
    } finally {
      if (pdfDocument) {
        try {
          await pdfDocument.destroy();
        } catch (destroyError) {
          console.warn('⚠️ [FileViewer] PDF destroy error:', destroyError);
        }
      }
    }
  };

  const FileViewerModal = {
    open({ blob, fileName = 'file' }) {
      if (!fileViewerModal || !fileViewerBody || !fileViewerTitle) return;
      if (!(blob instanceof Blob) || blob.size <= 0) {
        throw new Error('invalid blob');
      }

      closeFileViewer();
      currentFileViewerBlob = blob;
      currentFileViewerUrl = URL.createObjectURL(blob);
      currentFileViewerName = fileName;
      updateFileViewerHeaderDownload();
      bindBackButtonToFileViewer();
      const blobType = String(blob.type || '').toLowerCase();
      const attachmentKind = classifyAttachmentKind({ name: fileName });
      const isImageFile = blobType.startsWith('image/') || attachmentKind === 'photo';
      const isVideoFile = blobType.startsWith('video/') || attachmentKind === 'video';
      const isPdfFile = blobType === 'application/pdf' || normalizeAttachmentExtension(fileName) === 'pdf';
      fileViewerTitle.textContent = fileName;

      if (isImageFile) {
        setFileViewerBodyMode('center');
        fileViewerBody.innerHTML = `<img class="file-viewer-image" src="${currentFileViewerUrl}" alt="${escapeHtml(fileName)}" />`;
      } else if (isVideoFile) {
        setFileViewerBodyMode('center');
        fileViewerBody.innerHTML = `
          <video class="file-viewer-video" src="${currentFileViewerUrl}" controls playsinline preload="metadata">
            Ваше устройство не поддерживает встроенное воспроизведение видео.
          </video>
        `;
      } else if (isPdfFile) {
        void renderPdfIntoViewer(blob, fileName, currentFileViewerUrl);
      } else {
        setFileViewerBodyMode('center');
        fileViewerBody.innerHTML = `
          <div class="file-viewer-fallback">
            <div class="file-viewer-fallback-icon"><i class="fas fa-file-alt" aria-hidden="true"></i></div>
            <div class="file-viewer-fallback-name">${escapeHtml(fileName)}</div>
            <div class="file-viewer-fallback-size">${formatFileSize(blob.size)}</div>
            <button id="file-viewer-download" class="file-viewer-download" type="button">Скачать файл</button>
          </div>
        `;
        fileViewerBody.querySelector('#file-viewer-download')?.addEventListener('click', async () => {
          await saveFileFromViewer(currentFileViewerBlob, currentFileViewerUrl, fileName);
        });
      }

      openFileViewerShell(fileName);
    }
  };

  fileViewerDownloadHeader?.addEventListener('click', async () => {
    if (!currentFileViewerUrl || !currentFileViewerName) return;
    await saveFileFromViewer(currentFileViewerBlob, currentFileViewerUrl, currentFileViewerName);
  });

  const fetchFile = async (filePayload = {}, fallbackName = 'file') => {
    if (!window.API?.fetchFile) {
      throw new Error('fetchFile api missing');
    }
    const result = await window.API.fetchFile(filePayload, user, tg);
    if (!result) {
      throw new Error('empty response');
    }
    if (result.kind !== 'blob' || !(result.blob instanceof Blob)) {
      throw new Error('invalid blob');
    }
    if (result.blob.size <= 0) {
      throw new Error('empty blob');
    }
    return {
      blob: result.blob,
      fileName: result.fileName || fallbackName
    };
  };

  const handleAttachmentOpen = async (buttonElement) => {
    const now = Date.now();
    if (now - lastAttachmentOpenAt < 700) return;
    lastAttachmentOpenAt = now;
    if (isDialogRequestInFlight) return;
    const attachmentId = String(buttonElement.dataset.attachmentId || '').trim();
    const attachmentName = String(buttonElement.dataset.attachmentName || 'Файл');
    const localCacheKey = String(buttonElement.dataset.attachmentLocalKey || '').trim();
    if (localCacheKey) {
      const localFile = getPendingLocalAttachment(localCacheKey);
      if (localFile?.blob instanceof Blob && localFile.blob.size > 0) {
        FileViewerModal.open({
          blob: localFile.blob,
          fileName: localFile.fileName || attachmentName
        });
        return;
      }
    }
    if (!attachmentId) {
      showPlatformPopup('Ошибка файла', `У файла нет ID: ${attachmentName}`);
      return;
    }
    setDialogRequestInFlight(true);
    buttonElement.classList.add('is-loading');
    setFileViewerLoading(attachmentName);
    try {
      const file = await fetchFile({
        task_id: buttonElement.dataset.taskId || null,
        chat_id: buttonElement.dataset.chatId || null,
        comment_id: buttonElement.dataset.commentId || null,
        org: buttonElement.dataset.org || null,
        attachment_id: attachmentId,
        attachment_md5: buttonElement.dataset.attachmentMd5 || null,
        attachment_name: attachmentName
      }, attachmentName);
      FileViewerModal.open(file);
    } catch (error) {
      if (error?.message === 'empty response' || error?.message === 'empty blob') {
        setFileViewerError(attachmentName, 'Хук files вернул пустой ответ или пустой файл.');
        showPlatformPopup('Ошибка файла', `Файл пустой или не был получен: ${attachmentName}`);
      } else if (error?.message === 'invalid blob') {
        setFileViewerError(attachmentName, 'В ответе пришел некорректный blob. Проверь Content-Type и тело ответа.');
        showPlatformPopup('Ошибка файла', `Получен некорректный файл: ${attachmentName}`);
      } else if (error?.message === 'fetchFile api missing') {
        setFileViewerError(attachmentName, 'Метод API.fetchFile не найден.');
        showPlatformPopup('Ошибка файла', 'Метод API.fetchFile не найден.');
      } else {
        setFileViewerError(attachmentName, 'Запрос к файлу не завершился. Возможны CORS, сеть или ошибка webhook/files/{id}.');
        showPlatformPopup('Ошибка файла', `Не удалось открыть файл: ${attachmentName}`);
      }
    } finally {
      buttonElement.classList.remove('is-loading');
      setDialogRequestInFlight(false);
    }
  };

  const setDialogRequestInFlight = (nextState) => {
    isDialogRequestInFlight = Boolean(nextState);
    const activeTask = requestsState.tasks.find((item) => item.taskId === requestsState.activeTaskId);
    if (activeTask) {
      updateDialogComposerState(activeTask);
    }
  };

  const removeTaskMessage = (task, commentId) => {
    if (!task || !commentId) return;
    task.chat = (task.chat || []).filter((message) => message.commentId !== commentId);
  };

  const syncKeyboardOffset = () => {
    const viewport = window.visualViewport;
    if (!viewport || dialogModal.classList.contains('hidden')) {
      dialogModal.style.setProperty('--dialog-keyboard-offset', '0px');
      dialogChat.style.paddingBottom = '10px';
      return;
    }

    const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    dialogModal.style.setProperty('--dialog-keyboard-offset', `${keyboardOffset}px`);
    dialogChat.style.paddingBottom = `${10 + keyboardOffset}px`;
  };

  const keepComposerVisible = () => {
    requestAnimationFrame(syncKeyboardOffset);
    setTimeout(() => {
      composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
  };

  const focusComposerInput = () => {
    if (input.disabled) return;
    input.focus();
    keepComposerVisible();
  };

  const openFilePicker = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (attachBtn.disabled || fileInput.disabled) return;
    isOpeningFilePicker = true;
    input.blur();
    syncKeyboardOffset();
    fileInput.removeAttribute('accept');
    fileInput.removeAttribute('capture');

    window.setTimeout(() => {
      try {
        if (typeof fileInput.showPicker === 'function') {
          fileInput.showPicker();
        } else {
          fileInput.click();
        }
      } catch (error) {
        fileInput.click();
      }
    }, 180);
  };

  const sendCurrentMessage = async () => {
    const text = input.value.trim();
    const file = selectedDialogFile;
    const messageType = file ? 'file' : 'text';
    const outgoingText = file ? (text || '') : text;
    const payloadText = file ? (text || null) : text;
    const fileName = file?.name || null;
    const hadInputFocus = document.activeElement === input;
    if ((!text && !file) || isDialogRequestInFlight) return;
    const activeTask = requestsState.tasks.find((item) => item.taskId === requestsState.activeTaskId);
    if (!activeTask || isTaskClosed(activeTask)) return;
    const pendingLocalCacheKey = file ? `pending-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : '';
    if (file && pendingLocalCacheKey) {
      registerPendingLocalAttachment(pendingLocalCacheKey, file);
    }

    const pendingMessage = normalizeTaskComment({
      task_id: activeTask.taskId,
      comment_id: `${Date.now()}`,
      author: user?.first_name || user?.username || 'Вы',
      isOutgoing: true,
      text: file ? text : outgoingText,
      date: new Date().toISOString(),
      channel_type: `${platformName}_webapp`,
      message_type: file ? 'FILES' : messageType,
      attachments: file ? [{
        id: `pending-${Date.now()}`,
        name: file.name,
        mime_type: file.type || '',
        isPending: true,
        localCacheKey: pendingLocalCacheKey
      }] : []
    });
    registerPendingOutgoingMessage(activeTask.taskId, pendingMessage);
    activeTask.chat.push(pendingMessage);

    renderRequestsList();
    renderDialogChat(activeTask);
    input.value = '';
    clearSelectedDialogFile();
    setDialogRequestInFlight(true);
    if (hadInputFocus || file) {
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        keepComposerVisible();
      });
    }
    try {
      await sendMessageToMiniappWebhook(activeTask, {
        text: payloadText,
        message_type: messageType,
        file_name: fileName
      }, file ? [file] : []);
    } catch (error) {
      removeTaskMessage(activeTask, pendingMessage.commentId);
      renderRequestsList();
      renderDialogChat(activeTask);
      input.value = text;
      if (file) {
        selectedDialogFile = file;
        renderSelectedDialogFile();
        showPlatformPopup('Ошибка отправки файла', `Не удалось отправить файл: ${file.name}`);
      } else {
        showPlatformPopup('Ошибка отправки', 'Сообщение не удалось отправить. Попробуйте еще раз.');
      }
    } finally {
      setDialogRequestInFlight(false);
      if (hadInputFocus || file) {
        requestAnimationFrame(() => {
          input.focus({ preventScroll: true });
          keepComposerVisible();
        });
      }
    }
  };

  requestsList.addEventListener('click', (event) => {
    const card = event.target.closest('.request-card');
    if (!card?.dataset?.taskId) return;
    openDialog(card.dataset.taskId);
  });
  fileViewerModal?.addEventListener('click', (event) => {
    if (event.target === fileViewerModal) {
      closeFileViewer();
    }
  });
  sendBtn.addEventListener('click', sendCurrentMessage);
  input.addEventListener('focus', keepComposerVisible);
  input.addEventListener('blur', () => {
    if (isOpeningFilePicker) return;
    syncKeyboardOffset();
  });
  composer.addEventListener('click', (event) => {
    if (event.target.closest('.request-composer-attach, .request-composer-send')) return;
    focusComposerInput();
  });
  composer.addEventListener('touchend', (event) => {
    if (event.target.closest('.request-composer-attach, .request-composer-send')) return;
    focusComposerInput();
  });
  filePreview.addEventListener('click', (event) => {
    if (!event.target.closest('.request-composer-file-preview-remove')) return;
    clearSelectedDialogFile();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendCurrentMessage();
    }
  });
  attachBtn.addEventListener('click', openFilePicker);
  window.visualViewport?.addEventListener('resize', syncKeyboardOffset);
  window.visualViewport?.addEventListener('scroll', syncKeyboardOffset);
  fileInput.addEventListener('change', () => {
    isOpeningFilePicker = false;
    const files = Array.from(fileInput.files || []);
    const activeTask = requestsState.tasks.find((item) => item.taskId === requestsState.activeTaskId);
    if (!files.length || !activeTask || isTaskClosed(activeTask) || isDialogRequestInFlight) {
      fileInput.value = '';
      return;
    }
    selectedDialogFile = files[0] || null;
    renderSelectedDialogFile();
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      keepComposerVisible();
    });
  });
  fileInput.addEventListener('cancel', () => {
    isOpeningFilePicker = false;
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      keepComposerVisible();
    });
  });
  dialogRefreshBtn.addEventListener('click', restartDialogRefreshFlow);
  dialogRefreshModal.addEventListener('click', (event) => {
    if (event.target === dialogRefreshModal) {
      hideDialogRefreshModal();
    }
  });
  dialogModal.addEventListener('click', (event) => {
    if (event.target === dialogModal) {
      closeDialog();
    }
  });

  window.startRequestsListOpenChatPolling = scheduleRequestsListOpenChatPolling;
  window.stopRequestsListOpenChatPolling = stopRequestsListOpenChatPolling;

  window.preloadAllChats = async () => {
    if (!window.API?.sendOpenChat) return;
    const tasks = requestsState.tasks.filter((t) => t?.taskId && !isTaskClosed(t));
    for (const task of tasks) {
      if (requestsState.activeTaskId) return;
      await requestOpenChat(task);
    }
  };

  renderRequestsList();
};

/* ==================== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==================== */

const initializeApp = () => {
  try {
    initializeUserData();
    restoreRequestsCacheFromStorage();

    // При входе в WebApp отправляем данные пользователя в вебхук clientTG_support
    if (user?.id && window.API?.sendClientTGSupport) {
      fetchClientSupport({ force: true, cacheMs: 0 }).then((result) => {
        applyClientSupportResponse(result);
        syncOpenTasksForKnownEstablishments().then(() => window.preloadAllChats?.());
        // Если ID пришёл, то всё ок. Если ответ пустой — просим номер телефона.
        if (clientSupportResponseHasId(result)) {
          if (requestDeepLinkState.type === 'add_restaurant' && !requestDeepLinkState.handled) {
            requestDeepLinkState.awaitingAuthorization = false;
            window.tryOpenDeepLinkedRequest?.();
          }
          return;
        }
        clearRequestsStateAndCache();
        if (user?.phone_number || user?.phone) return;
        showContactShareModal();
      });
    }

    setupModal();
    setupContactSharing();
    setupNavigation();
    setupAddRestaurantButton();
    setupMarketButton();
    enhanceMobileUX();
    setupEstablishmentSelection();
    setupTaskCreation();
    setupRequestsFiltersModal();
    setupRequestDetailsView();
    seedLocalPreviewData();

    // Показываем приветственный экран
    //const welcomeScreen = document.getElementById('welcome-screen');
    //welcomeScreen.style.display = 'flex';
    //welcomeScreen.classList.add('fade-in');

    // lk-ps не вызываем при старте (только после сканирования QR)
    setTimeout(() => {
      startAnimation();
    }, 150);

  } catch (error) {
    console.error('❌ Ошибка инициализации приложения:', error);
    const message = `Ошибка запуска: ${error?.message || 'unknown error'}`;
    showPlatformPopup('Ошибка запуска', message);
    setTimeout(() => {
      startAnimation();
    }, 1000);
  }
};

document.addEventListener('DOMContentLoaded', initializeApp);

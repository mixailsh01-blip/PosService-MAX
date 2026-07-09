/* ==================== API MODULE ==================== */
/* Отвечает за все HTTP-запросы к внешним системам */

const API_BASE_URL = 'https://quumahienot.beget.app';

const getBridgeUserWithoutPhoto = (userData) => Object.fromEntries(
  Object.entries(userData || {}).filter(
    ([key]) => !['photo_url', 'photo', 'avatar', 'avatar_url'].includes(key)
  )
);

const getBridgeMeta = (webApp = null) => {
  const platform = webApp?.platform || (window.WebApp ? 'max' : (window.Telegram?.WebApp ? 'telegram' : 'web'));
  const initData = webApp?.initData || window.WebApp?.InitData || null;

  return {
    init_data: initData,
    platform,
    version: webApp?.version || null,
    color_scheme: webApp?.colorScheme || null,
    max_init_data: initData,
    max_platform: platform,
    max_version: webApp?.version || null,
    tg_init_data: initData,
    tg_platform: platform,
    tg_version: webApp?.version || null,
    tg_color_scheme: webApp?.colorScheme || null
  };
};

const API = {
  /**
   * Авторизация через хук
   * @param {Object} userData - Данные пользователя из Telegram
   * @returns {Promise<Array|null>} Массив пользователей или null
   */
  async authorize(userData) {
    const hookUrl = `${API_BASE_URL}/webhook/lk-ps`;
    const payload = {
      date: "auth",
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null
    };

    try {
      console.log('📤 [API] Отправляем запрос авторизации:', payload);
      
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ [API] Ответ от хука:', result);
      return result;

    } catch (error) {
      console.error('❌ [API] Ошибка авторизации:', error);
      return null;
    }
  },

  /**
   * Отправка данных QR-кода в вебхук
   * @param {string} qrData - Строка из QR-кода (обычно URL)
   * @param {Object} userData - Данные пользователя из Telegram
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendQrData(qrData, userData) {
    const hookUrl = `${API_BASE_URL}/webhook/lk-ps`;
    const userDataWithoutPhoto = getBridgeUserWithoutPhoto(userData);

    const payload = {
      date: "qr",
      qr_data: qrData,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto,
      max_user: userDataWithoutPhoto
    };

    try {
      console.log('📤 [API] Отправляем QR в вебхук:', payload);
      
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] QR успешно отправлен, ответ:', result);
      return result;

    } catch (error) {
      console.error('❌ [API] Ошибка отправки QR:', error);
      return null;
    }
  }
  ,

  /**
   * Второй вебхук: передаем массив заведений [{Client, ID}]
   * @param {Array|Object} establishmentsPayload - Массив или один объект {Client, ID}
   * @param {Object|null} userData - Данные пользователя Telegram
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendTaskSupport(establishmentsPayload, userData = null) {
    const hookUrl = `${API_BASE_URL}/webhook/task_support`;
    const basePayload = Array.isArray(establishmentsPayload)
      ? establishmentsPayload
      : (establishmentsPayload ? [establishmentsPayload] : []);
    const payload = basePayload
      .map((item) => {
        const client = item?.Client ?? item?.client ?? item?.name ?? null;
        const id = item?.ID ?? item?.Id ?? item?.id ?? null;
        const number = item?.Nubmer ?? item?.Number ?? item?.number ?? null;

        if (!client || !id) return null;

        return {
          Client: String(client),
          ID: String(id),
          ...(number ? { Nubmer: String(number) } : {}),
          Iduser: userData?.id || null
        };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      console.warn('⚠️ [API] task_support не отправлен: нет валидных Client/ID');
      return null;
    }

    try {
      console.log('📤 [API] Отправляем task_support:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ task_support:', result);
      return result;

    } catch (error) {
      console.error('❌ [API] Ошибка task_support:', error);
      return null;
    }
  }

  ,

  /**
   * Проверка открытых задач по заведениям
   * @param {Array|Object} establishmentsPayload - Массив или один объект {Client, ID}
   * @param {Object|null} userData - Данные пользователя Telegram
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendOpenTask(establishmentsPayload, userData = null) {
    const hookUrl = `${API_BASE_URL}/webhook/open_task`;
    const basePayload = Array.isArray(establishmentsPayload)
      ? establishmentsPayload
      : (establishmentsPayload ? [establishmentsPayload] : []);
    const payload = basePayload
      .map((item) => {
        const client = item?.Client ?? item?.client ?? item?.name ?? null;
        const id = item?.ID ?? item?.Id ?? item?.id ?? null;

        if (!client || !id) return null;

        return {
          Client: String(client),
          ID: String(id),
          Iduser: userData?.id || null
        };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      console.warn('⚠️ [API] open_task не отправлен: нет валидных Client/ID');
      return null;
    }

    try {
      console.log('📤 [API] Отправляем open_task:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ open_task:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка open_task:', error);
      return null;
    }
  }

  ,

  /**
   * Загрузка истории диалога по задаче
   * @param {Object} chatPayload - Данные задачи/чата
   * @param {Object|null} userData - Данные пользователя Telegram
   * @param {Object|null} webApp - Telegram WebApp
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendOpenChat(chatPayload = {}, userData = null, webApp = null) {
    const hookUrl = `${API_BASE_URL}/webhook/open_chat`;
    const payload = {
      task_id: chatPayload?.task_id ?? chatPayload?.taskId ?? null,
      chat_id: chatPayload?.chat_id ?? chatPayload?.chatId ?? null,
      org: chatPayload?.org ?? null,
      Client: chatPayload?.Client ?? chatPayload?.org ?? null,
      ID: chatPayload?.ID ?? chatPayload?.establishment_id ?? null,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      ...getBridgeMeta(webApp)
    };

    try {
      console.log('📤 [API] Отправляем open_chat:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ open_chat:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка open_chat:', error);
      return null;
    }
  }

  ,

  async sendPersonal(establishmentPayload = {}, userData = null, webApp = null) {
    const hookUrl = `${API_BASE_URL}/webhook/personal`;
    const payload = {
      IDREST: establishmentPayload?.IDREST ?? establishmentPayload?.ID ?? establishmentPayload?.id ?? null,
      KК: establishmentPayload?.KК ?? establishmentPayload?.KK ?? establishmentPayload?.Client ?? establishmentPayload?.name ?? null,
      Client: establishmentPayload?.Client ?? establishmentPayload?.name ?? null,
      ID: establishmentPayload?.ID ?? establishmentPayload?.IDREST ?? establishmentPayload?.id ?? null,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      ...getBridgeMeta(webApp)
    };

    try {
      console.log('📤 [API] Отправляем personal:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ personal:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка personal:', error);
      return null;
    }
  }

  ,

  async editUser(userId, firstName, lastName) {
    const hookUrl = `${API_BASE_URL}/webhook/UserEdit`;
    try {
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ user_id: String(userId), first_name: firstName, last_name: lastName })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json().catch(() => null);
      console.log('✅ [API] UserEdit:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка UserEdit:', error);
      return null;
    }
  }

  ,

  async getPersonRights(userId) {
    const hookUrl = `${API_BASE_URL}/webhook/person`;
    try {
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ user_id: String(userId) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      console.log('✅ [API] Данные пользователя:', result);
      const person = Array.isArray(result) ? result[0] : result;
      const заведения = person?.Заведения ?? [];
      const да = v => v === true || v === 'Да';
      const нет = v => v === false || v === 'Нет';
      const счетаЗаведения = заведения.filter(з => да(з.ПРАВА?.['Счета']));
      const запретПросмотра = new Set(
        заведения
          .filter(з => нет(з.ПРАВА?.['Просмотр сотрудников']))
          .map(з => String(з.IDREST))
      );
      return {
        счета:               счетаЗаведения.length > 0,
        просмотрСотрудников: заведения.some(з => да(з.ПРАВА?.['Просмотр сотрудников'])),
        анонимныеЗаявки:     заведения.some(з => да(з.ПРАВА?.['Анонимные заявки'])),
        редактированиеПрав:  заведения.some(з => да(з.ПРАВА?.['Редактирование прав доступа'])),
        счетаЗаведения: счетаЗаведения.map(з => ({ id: з.IDREST, name: з.КК })),
        запретПросмотраСотрудников: запретПросмотра,
      };
    } catch (error) {
      console.error('❌ [API] Ошибка getPersonRights:', error);
      return null;
    }
  }

  ,

  async sendRolesCatalog() {
    const hookUrl = `${API_BASE_URL}/webhook/post`;

    try {
      console.log('📤 [API] Отправляем roles post');

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ roles post:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка roles post:', error);
      return null;
    }
  }

  ,

  /**
   * Отправка сообщения из миниаппа в диалог заявки
   * @param {Object} messagePayload - Данные сообщения/задачи
   * @param {Object|null} userData - Данные пользователя Telegram
   * @param {Object|null} webApp - Telegram WebApp
   * @param {File[]|Array|null} files - Прикрепленные файлы
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendMiniappMessage(messagePayload = {}, userData = null, webApp = null, files = []) {
    const hookUrl = `${API_BASE_URL}/webhook/message_miniapp`;
    const messageType = messagePayload?.message_type ?? messagePayload?.messageType ?? 'text';
    const normalizedMessageType = String(messageType).trim().toLowerCase();
    const rawTextValue = messagePayload?.text ?? null;
    const textValue = normalizedMessageType === 'file' && (rawTextValue == null || rawTextValue === '') ? '' : rawTextValue;
    const fileName = messagePayload?.file_name ?? messagePayload?.fileName ?? null;
    const payload = {
      task_id: messagePayload?.task_id ?? messagePayload?.taskId ?? null,
      chat_id: messagePayload?.chat_id ?? messagePayload?.chatId ?? null,
      org: messagePayload?.org ?? null,
      Client: messagePayload?.Client ?? messagePayload?.org ?? null,
      ID: messagePayload?.ID ?? messagePayload?.establishment_id ?? null,
      text: textValue,
      message: textValue,
      comment: textValue,
      body: textValue,
      message_type: messageType,
      file_name: fileName,
      message_payload: {
        text: textValue,
        message: textValue,
        comment: textValue,
        body: textValue,
        message_type: messageType,
        file_name: fileName
      },
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      ...getBridgeMeta(webApp)
    };

    try {
      console.log('📤 [API] Отправляем message_miniapp:', payload);

      const preparedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
      const hasFiles = preparedFiles.length > 0;
      let response;

      if (hasFiles) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
            return;
          }
          formData.append(key, String(value));
        });
        preparedFiles.forEach((file) => {
          formData.append('files', file, file.name);
        });

        response = await fetch(hookUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json'
          },
          body: formData
        });
      } else {
        response = await fetch(hookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ message_miniapp:', result);
      return result ?? { ok: true };
    } catch (error) {
      console.error('❌ [API] Ошибка message_miniapp:', error);
      return null;
    }
  }

  ,

  /**
   * Загрузка файла по вложению из диалога заявки
   * @param {Object} attachmentPayload - Данные вложения/сообщения
   * @param {Object|null} userData - Данные пользователя
   * @param {Object|null} webApp - Telegram/MAX WebApp
   * @returns {Promise<Object|null>} Результат загрузки
   */
  async fetchFile(filePayload = {}, userData = null, webApp = null) {
    const normalizedId = String(filePayload?.attachment_id ?? filePayload?.attachmentId ?? filePayload?.id ?? '').trim();
    if (!normalizedId) return null;
    const hookUrl = `${API_BASE_URL}/webhook/files`;
    const payload = {
      task_id: filePayload?.task_id ?? filePayload?.taskId ?? null,
      chat_id: filePayload?.chat_id ?? filePayload?.chatId ?? null,
      comment_id: filePayload?.comment_id ?? filePayload?.commentId ?? null,
      org: filePayload?.org ?? null,
      attachment_id: normalizedId,
      attachment_md5: filePayload?.attachment_md5 ?? filePayload?.attachmentMd5 ?? filePayload?.md5 ?? null,
      attachment_name: filePayload?.attachment_name ?? filePayload?.attachmentName ?? filePayload?.name ?? null,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      ...getBridgeMeta(webApp)
    };

    try {
      console.log('📤 [API] Загружаем файл:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const disposition = String(response.headers.get('content-disposition') || '');
      const responseFileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
      const responseFileName = decodeURIComponent(
        responseFileNameMatch?.[1] ||
        responseFileNameMatch?.[2] ||
        payload.attachment_name ||
        `file-${normalizedId}`
      );

      const blob = await response.blob();
      console.log('✅ [API] Ответ files(blob):', { size: blob.size, type: blob.type || contentType });
      return {
        kind: 'blob',
        blob,
        fileName: responseFileName,
        contentType: blob.type || contentType || 'application/octet-stream'
      };
    } catch (error) {
      console.error('❌ [API] Ошибка files:', error);
      return null;
    }
  }

  ,

  /**
   * При открытии страницы отправляем данные пользователя в вебхук
   * @param {Object} userData - Bridge user object
   * @param {Object} webApp - window.WebApp / window.Telegram.WebApp
   * @returns {Promise<any|null>}
   */
  async sendClientTGSupport(userData, webApp) {
    const hookUrl = `${API_BASE_URL}/webhook/clientTG_support`;
    const userDataWithoutPhoto = getBridgeUserWithoutPhoto(userData);

    // Берем максимально полезные данные, но оставляем payload JSON-safe
    const payload = {
      date: 'clientTG_support',
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto,
      max_user: userDataWithoutPhoto,
      ...getBridgeMeta(webApp)
    };

    try {
      console.log('📤 [API] Отправляем clientTG_support:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ clientTG_support:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка clientTG_support:', error);
      return null;
    }
  }

  ,

  /**
   * Регистрация клиента после предоставления номера телефона
   * @param {Object} contact - объект контакта (ожидается phone_number)
   * @param {Object} userData - Bridge user object
   * @param {Object} webApp - window.WebApp / window.Telegram.WebApp
   * @returns {Promise<any|null>}
   */
  async sendRegistrClient(contact, userData, webApp, meta = null) {
    const hookUrl = `${API_BASE_URL}/webhook/registr_client`;
    const userDataWithoutPhoto = getBridgeUserWithoutPhoto(userData);

    const payload = {
      date: 'registr_client',
      phone_number: contact?.phone_number || null,
      meta: meta || null,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto,
      max_user: userDataWithoutPhoto,
      ...getBridgeMeta(webApp)
    };

    try {
      console.log('📤 [API] Отправляем registr_client:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ registr_client:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка registr_client:', error);
      return null;
    }
  },

  /**
   * Создание новой заявки в TaskV2
   * @param {Object} taskData - Данные заявки из UI
   * @param {Object} userData - Bridge user object
   * @param {Object} webApp - window.WebApp / window.Telegram.WebApp
   * @returns {Promise<any|null>}
   */
  async createTaskV2(taskData = {}, userData, webApp, files = []) {
    const hookUrl = `${API_BASE_URL}/webhook/TaskV2`;
    const userDataWithoutPhoto = getBridgeUserWithoutPhoto(userData);

    const payload = {
      date: 'task_v2',
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto,
      max_user: userDataWithoutPhoto,
      ...getBridgeMeta(webApp),
      task: taskData,
      ...taskData
    };

    try {
      console.log('📤 [API] Отправляем TaskV2:', payload);
      const preparedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
      const hasFiles = preparedFiles.length > 0;

      let response;
      if (hasFiles) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
            return;
          }
          formData.append(key, String(value));
        });

        preparedFiles.forEach((file) => {
          formData.append('files', file, file.name);
        });

        response = await fetch(hookUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json'
          },
          body: formData
        });
      } else {
        response = await fetch(hookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ TaskV2:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка TaskV2:', error);
      return null;
    }
  }
};

// Экспортируем модуль
window.API = API;

/* ==================== ОБЩИЕ УТИЛИТЫ ==================== */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatPhoneNumber = (phone) => {
  if (!phone) return '+7 (XXX)-XXX-XXXX';
  const cleaned = phone.toString().replace(/\D/g, '');
  const match = cleaned.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return match
    ? `+7 (${match[1]})-${match[2]}-${match[3]}-${match[4]}`
    : `+7 (${cleaned.substring(0, 3)})-${cleaned.substring(3, 6)}-${cleaned.substring(6, 8)}-${cleaned.substring(8, 10)}`;
};

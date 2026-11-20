# yandex-proxy

Свой сервис вместо n8n-вебхука `yandex/devOps`: принимает запросы мини-приложения и пересылает их в API iiko-интеграции Яндекс Еды (`https://<компания>.iikoweb.ru/api/integrations/yandex-food`). Без зависимостей, нужен только Node 20+ (или Docker).

## Контракт (как у n8n)

| Запрос | Ответ |
|---|---|
| `{type:"auth", baseUrl, client_id, client_secret}` | `{access_token}` |
| `{type:"dev", method, url, headers, body}` | ответ API как есть |
| любая ошибка | `{ok:false, error:{type, status, message}}` |

Типы ошибок: `AUTH_EXPIRED` (токен истёк, клиент сам обновит и повторит), `AUTH_FAILED`, `UPSTREAM_ERROR` (API вернул ошибку, текст в `message`), `PROXY_ERROR` (таймаут, запрещённый адрес), `BAD_REQUEST`.

## Запуск

    docker build -t yandex-proxy .
    docker run -d --name yandex-proxy --restart unless-stopped -p 127.0.0.1:8080:8080 \
      -e ALLOWED_ORIGINS=https://sparko161-droid.github.io yandex-proxy

Дальше перед ним нужен HTTPS (nginx или Caddy на домене): страница на github.io не сможет обращаться к адресу по http.

## Настройки (переменные окружения)

- `ALLOWED_HOSTS` — на какие хосты разрешено ходить, через запятую; по умолчанию `*.iikoweb.ru`.
- `ALLOWED_ORIGINS` — с каких сайтов разрешены запросы из браузера (CORS); по умолчанию `*`, лучше указать адрес приложения.
- `UPSTREAM_TIMEOUT_MS` — таймаут ответа API, по умолчанию 30000.
- `PORT` — порт, по умолчанию 8080.

## Проверка

    node test/test.mjs

## Клиент

В `client/n8nClient.js` — обновлённый файл для приложения. Нужно только подставить адрес сервиса в `PROXY_URL`.

## Обновление раздела и прокси на SPRT API

Из checkout с актуальной веткой:

```bash
sudo bash deploy/update-yandex.sh
```

Собирается небольшой образ `Dockerfile.web`: API и актуальные файлы `yandex-app`.
Сеть, TLS entrypoint и resolver берутся из меток работающего Hoppscotch. Router
с приоритетом 300 обслуживает только `/yandex/devOps` и `/yandex-app/`.
Пересборка/перезапуск Hoppscotch и сервиса обучения не требуются; существующий
`yandex-proxy`, если есть, не удаляется. Новый контейнер — `sprt-yandex-proxy`.
Встроенная копия интерфейса в образе Hoppscotch после установки не используется.

Проверяются публичный `/yandex/devOps/health` (версия `2026.11.20.1`) и POST без
секретов: он должен вернуть HTTP 400 с JSON `BAD_REQUEST`, а не пустой 405.
Команда отката печатается в конце установки.

Base URL берите из **Host / WebHook URL** именно вашей интеграции Яндекс Еды
в iikoWeb, а Client ID/Secret — из той же интеграции. Клиент проверяет URL до
запроса, объясняет пустые/non-JSON ответы и сохраняет вход только после получения
`access_token`. Актуальный клиент — `yandex-app/src/core/n8nClient.js`.
По умолчанию разрешены `*.iikoweb.ru` и `api-ru.iiko.services`;
для других доверенных хостов задайте `SPRT_YANDEX_ALLOWED_HOSTS` установщику.

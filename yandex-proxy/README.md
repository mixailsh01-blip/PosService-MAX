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

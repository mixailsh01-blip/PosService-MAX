# iiko-auth

Выдаёт токен iiko Cloud API сотрудникам СПРТ, которые знают только свой `apiKey`.
`appId` и `clientSecret` приложения хранятся в переменных окружения сервиса и в браузер не попадают.

`POST /token` с телом `{"apiKey": "..."}` возвращает токен iiko. `appId` и `clientSecret` сервис всегда берёт из своих переменных окружения, поэтому они не попадают в браузер. `GET /health` проверяет, что сервис жив.

`/iiko-api/api/...` безопасно фиксирует upstream на `api-ru.iiko.services` и проксирует запросы коллекции. Это нужно для режима Browser в Hoppscotch: прямые запросы к iiko блокируются политикой CORS.

Переменные: `IIKO_APP_ID`, `IIKO_CLIENT_SECRET` (обязательно), `ALLOWED_ORIGINS` (адрес Hoppscotch, по умолчанию `*`), `IIKO_BASE` (по умолчанию `https://api-ru.iiko.services`), `PORT` (по умолчанию 8081).

Секреты хранить только в `.env` рядом с docker-compose, в git их не класть.

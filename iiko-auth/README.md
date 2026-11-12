# iiko-auth

Выдаёт токен iiko Cloud API сотрудникам СПРТ, которые знают только свой `apiKey`.
`appId` и `clientSecret` приложения хранятся в переменных окружения сервиса и в браузер не попадают.

`POST /token` с телом `{"apiKey": "...", "appId": "********", "clientSecret": "********"}` (структура как у iiko) возвращает ответ iiko (`{"token": "..."}`). Значения `appId` и `clientSecret` из тела сервис игнорирует и всегда подставляет свои, поэтому в коллекции там звёздочки. Хватит и одного `apiKey`. `GET /health` проверяет, что сервис жив.

Переменные: `IIKO_APP_ID`, `IIKO_CLIENT_SECRET` (обязательно), `ALLOWED_ORIGINS` (адрес Hoppscotch, по умолчанию `*`), `IIKO_BASE` (по умолчанию `https://api-ru.iiko.services`), `PORT` (по умолчанию 8081).

Секреты хранить только в `.env` рядом с docker-compose, в git их не класть.

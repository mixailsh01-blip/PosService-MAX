# iiko Cloud API для Hoppscotch (СПРТ)

Готовая коллекция методов iiko Cloud API (`https://api-ru.iiko.services`) для импорта в Hoppscotch.

- `iiko-cloud-api.collection.json` — коллекция: папки по разделам, примеры тел запросов, токен берётся автоматически.
- `iiko-cloud-api.environment.json` — окружение: `baseUrl`, `apiLogin`, `token`, `organizationId`, `terminalGroupId`.
- `gen-iiko.ts` — генератор коллекции из OpenAPI-типов.

## Как подключить (один раз, для всей команды)
1. В Hoppscotch создайте командное пространство (например «СПРТ») и переключитесь в него.
2. Коллекции → Импортировать → «Hoppscotch» → выберите `iiko-cloud-api.collection.json`.
3. Окружения → Импортировать → `iiko-cloud-api.environment.json`. Впишите свой `apiLogin` (личный ключ iiko).
4. Выберите окружение «iiko Cloud API», выполните «Авторизация → Получить токен». Токен сохранится сам.

## Как обновить по свежей спецификации iiko
Текущая версия собрана из пакета `@salesduck/iiko-cloud-api` (спецификация 2023 года, 104 метода).
Свежий swagger iiko (страница `https://api-ru.iiko.services/docs`, файл спецификации в формате JSON):

```
npx openapi-typescript swagger.json -o api.d.ts
# рабочая папка: копия packages/hoppscotch-data/src из репозитория Hoppscotch как ./data-src
npm i fp-ts io-ts jose lodash parser-ts uuid verzod zod tsx typescript
npx tsx gen-iiko.ts api.d.ts ./out
```

# iiko Cloud API для Hoppscotch (СПРТ)

Готовая коллекция методов iiko Cloud API (`https://api-ru.iiko.services`) с автоматизацией, чтобы не набирать вручную токены и ID.

- `iiko-cloud-api.collection.json`: коллекция (папка «⚡ Быстрый старт» и разделы по темам, 104 метода, русские названия, готовые тела запросов).
- `iiko-cloud-api.environment.json`: окружение со всеми переменными.
- `scripts/pre-request.js` и `scripts/post-request.js`: скрипты автоматизации (встроены в коллекцию, ниже описано, что они делают).
- `gen-iiko.ts`: генератор коллекции из OpenAPI-типов.

В приложении СПРТ коллекция и окружение появляются сами после первого входа.

## Что нужно сделать вручную
Выбрать окружение «iiko Cloud API» и вписать только `apiLogin` (API-ключ из iikoWeb). `appId` и `clientSecret` приложения хранятся на сервере в сервисе `iiko-auth` (см. `../iiko-auth`), токен запрашивается через него. Если вписать свой `clientSecret` в окружение, токен берётся напрямую из iiko по `/api/v2/access_token`.

## Что происходит автоматически
Перед каждым запросом (`scripts/pre-request.js`):
- получается токен и обновляется, когда ему остаётся меньше 10 минут;
- если тело запроса содержит `<<organizationId>>`, `<<terminalGroupId>>`, `<<productId>>`, `<<productPrice>>`, `<<paymentTypeId>>`, `<<paymentTypeKind>>`, `<<orderTypeId>>`, `<<employeeId>>`, `<<externalMenuId>>`, `<<tableId>>`, а значение ещё не задано, оно запрашивается у iiko и подставляется;
- обновляются даты и идентификаторы: `<<todayStart>>`, `<<todayEnd>>`, `<<weekAgoStart>>`, `<<now>>`, `<<nowPlus1h>>`, `<<guid>>`, `<<orderNumber>>`.

После каждого запроса (`scripts/post-request.js`):
- `orderId` и `correlationId` запоминаются после создания заказа; `orderId` берётся и из списков заказов, если ещё не задан;
- `customerId`, `employeeId`, `externalMenuId`, `paymentTypeId`, `cityId` и другие ID запоминаются из ответов справочников;
- ошибка iiko (`errorDescription`) показывается во вкладке «Тесты»; ответ 401 сбрасывает токен, следующий запрос получит новый.

Если организаций несколько, подставится первая, а список сохранится в `organizationsList`; нужную впишите в `organizationId`.

Методы с пометкой «(создаёт заказ!)» создают реальные заказы на кассе. Для проб есть «Проверить заказ без создания».

## Как обновить по свежей спецификации iiko
Текущая версия собрана из пакета `@salesduck/iiko-cloud-api` (спецификация 2023 года, 104 метода). Свежий swagger iiko берётся со страницы `https://api-ru.iiko.services/docs` (файл спецификации в формате JSON):

```
npx openapi-typescript swagger.json -o api.d.ts
# рабочая папка: копия packages/hoppscotch-data/src из репозитория Hoppscotch как ./data-src
npm i fp-ts io-ts jose lodash parser-ts uuid verzod zod tsx typescript
npx tsx gen-iiko.ts api.d.ts ./out
```

Русские названия лежат в таблице `NAMES` в `gen-iiko.ts`; новые методы получат английское название из спецификации, пока их не добавить туда. Готовые тела для основных методов лежат в `CURATED`.

## Проверка скриптов без Hoppscotch
`node harness.mjs` в папке `scripts/test` запускает оба скрипта на макете iiko API.

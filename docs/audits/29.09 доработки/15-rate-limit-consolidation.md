# 15 · Один механизм fail-closed у лимитера

**Источник:** `RATE-LIMIT-MECHANISM-CONSOLIDATION` (BACKLOG); контекст §10 · **Тип:** рефакторинг · **Объём:** M
**Зависит от:** —

## Что не так

Решение «отказывать ли при обрыве Redis» (инв. #6) принимается тремя способами, и ни один сторож
не знает всех трёх (детектор FIX-B11 знал один — 8 ложных срабатываний из 33):

1. **Префикс пути** `SENSITIVE_ROUTE_PREFIXES` (`lib/rate-limit/index.ts:38`): `isSensitiveRouteKey`
   (`:201`) вынимает путь из ключа — всё от первого `/api/` до конца (`extractApiPathFromKey`, `:195`).
   Работает для ключа прокси `rl:<tier>:<ip>:<method>:<template>` (`src/proxy.ts:509`), где шаблон —
   в конце.
2. **Префикс ключа** `SENSITIVE_KEY_PREFIXES` (`:125`) — 16 строк двух родов: 8 пространств
   собственных лимитеров роутов (`rate:createBooking:`, `rate:publicBooking:`, `rate:packageBook:`,
   `rate:studioPackageBook:`, `rate:guestManage:`, `rate:chatSend:`, `rate:telegramWebhook:`,
   `rl:categories:propose:`) и **8 зеркал префиксов пути** (`rl:/api/studio`, `rl:/api/bookings`, …).
   Зеркала нужны потому, что ключи роутов кладут путь В СЕРЕДИНУ (`rl:/api/studio:user:…` → вынутый
   путь `/api/studio:user:…` не совпадает ни с `/api/studio`, ни с `/api/studio/…`) — то есть есть и
   скрытый четвёртый механизм: чувствительность зависит от того, где в строке ключа стоит путь.
3. **Внутри модуля** `lib/auth/otp-rate-limit.ts` — свои команды, любой отказ → 503 (RES-11).

Ключ — свободная строка: 42 вызова `checkRateLimit` в 35 файлах, форматы `rate:x:…`,
`rl:/api/путь:ось:…`, `rl:hot-slots:feed:…`, `log-error:…`, `support:ip:…`. Попадёт ли новый в
fail-closed, решает то, вспомнил ли автор дописать префикс. Цена видна в замороженном снимке
`fail-open-mutating-routes.json`: в нём числятся `/api/public/bookings`, оба `…/manage/[token]/*`,
оба `…/packages/[id]/…/book` и `/api/telegram/webhook` (строки 64-75) — все шесть на деле
fail-closed по ключу, то есть снимок сообщает о них неправду.

Попутно: сырой телефон в имени ключа Redis (`api/public/bookings/route.ts:69`, оба пакетных роута) —
ПДн в именах ключей, против принципа SEC-04 (там адрес хешируется); комментарий `index.ts:166-172` и
`sensitive-fail-open-known.json` ссылаются на удалённый `NEXT_PUBLIC_TELEGRAM_ENABLED` (ENV-SPLIT-01).

**`GUEST-BOOKING-OUTAGE-CODE-ASYMMETRY` уже закрыт** FIX-C11 (`BACKLOG-DONE.md:866`): четыре гостевых
входа зовут перегрузку с конфигом и отвечают через `resolveRateLimitRefusal` (`lib/rate-limit/refusal.ts`)
503 `RATE_LIMIT_UNAVAILABLE` при обрыве (`api/public/bookings/route.ts:74-81`, `createBooking.ts:86`,
пакеты). Остаток того же класса — legacy-перегрузка с `boolean`: 6 вызовов в 5 файлах (`log-error`,
`master/advisor/refresh`, `support/partnership`, `support/tickets` ×2, `telegram/webhookRateLimit.ts`)
при обрыве отвечают «слишком много запросов».

## Что сделать

Один источник истины — **шаблон пути** (рекомендация BACKLOG: свести (2) к (1)); (3) остаётся.

1. `lib/rate-limit/keys.ts`: брендированный `RateLimitKey` и два конструктора —
   `proxyRateLimitKey(tier, ip, method, pathname)` (нынешний формат) и
   `routeRateLimitKey(req, axis, identity)` → `rl:route:<axis>:<sha256(identity)>:<template>`, где
   `template = toApiRouteTemplate(new URL(req.url).pathname)` — путь берётся из самого запроса,
   ошибиться в нём нельзя; шаблон стоит последним, личность хешируется (ПДн уходят из имён ключей).
   Функции без запроса (`createBooking`, `createClientBooking`, `guestManageRateLimitRefusal`)
   получают готовый ключ от роута.
2. `checkRateLimit(key: RateLimitKey, …)`: сырая строка не компилируется (GUARD-INTEGRITY правило 8 —
   бренд). Перевести все 42 вызова.
3. Чувствительность — только по шаблону: `SENSITIVE_ROUTE_PREFIXES` + новый список ТОЧНЫХ шаблонов
   `SENSITIVE_ROUTE_TEMPLATES`: `/api/public/bookings`, `/api/public/bookings/manage/:id/cancel`,
   `/api/public/bookings/manage/:id/reschedule`, `/api/public/packages/:id/book`,
   `/api/public/packages/:id/studio/book`, `/api/telegram/webhook`. Префикс `/api/public/bookings`
   НЕ годится: под ним `GET /api/public/bookings/[id]` (экран «запись создана» после перезагрузки) —
   он стал бы fail-closed. Оба `propose` остаются fail-open (другие шаблоны; ничего не пишут).
   `SENSITIVE_KEY_PREFIXES` удалить. Сверка «старое пространство → шаблон → чем покрыт» — таблицей в
   шапке `index.ts` и тестом (каждый прежний префикс ключа должен остаться чувствительным).
4. Побочное следствие, принимаемое явно: для шести новых шаблонов fail-closed становится и тир
   ПРОКСИ, то есть при обрыве отказ приходит на хоп раньше — тем же 503 `RATE_LIMIT_UNAVAILABLE`
   (FIX-B12). Исход для пользователя не меняется: роуты и сейчас отказывают.
5. Legacy-перегрузку удалить: шесть вызовов всё равно меняются из-за ключа, переводятся на конфиг +
   `resolveRateLimitRefusal` (telegram-вебхук — тоже, его ретраи от кода не зависят).
6. OTP-модуль не трогать, но закрепить согласие политик: тест, выводящий из дерева роуты, которые
   импортируют `otp-rate-limit`, требует, чтобы их шаблоны были чувствительными по пути.
7. Поправить устаревшие упоминания `NEXT_PUBLIC_TELEGRAM_ENABLED`; из `fail-open-mutating-routes.json`
   уходят шесть строк (снимок начинает говорить правду).

## Решения владельца

Не нужны: политика (кто fail-closed) не меняется, меняется способ её записи. К сведению: имена
ключей меняются, поэтому в момент деплоя все окна лимитов начинаются заново (безопасно, в графиках
заметно как сброс).

## Готово, когда

- `SENSITIVE_KEY_PREFIXES` и legacy-перегрузки нет; `checkRateLimit` принимает только `RateLimitKey`.
- Чувствительность любого ключа выводится из шаблона пути; в именах ключей нет сырых телефонов/id.
- Снимок fail-open-роутов без шести ложных строк; остальные сторожа инв. #6 зелёные.

## Проверка

- `@ts-expect-error` на `checkRateLimit("rate:x:1", …)`; `@probe`: снять бренд → директива
  «неиспользована», `typecheck` красный.
- Поведенческая сверка до/после: для каждого из 16 прежних префиксов ключ добывается из настоящего
  лимитера роута (приём `flag-gated-fail-closed.test.ts` — перехват вызова, а не литерал) и обязан
  остаться чувствительным. Проба: убрать `/api/public/bookings` из точных шаблонов → красный с
  именем роута; обратная — заменить точный шаблон префиксом → красный тест «`GET …/bookings/:id`
  остаётся fail-open».
- Переписать под новые ключи: `sensitive-routes.test.ts`, `sensitive-routes-completeness.test.ts`,
  `sensitive-fail-open-triage.test.ts` (ветка про префиксы ключей `:140-195` уходит), `fail-closed-classes.test.ts`,
  `flag-gated-fail-closed.test.ts`, `refusal.test.ts`, `api/chat/chat-send-refusal.test.ts`,
  `visual-search/sec-04-frequency-policy.test.ts` (ратифицированный fail-open by-photo — сохранить).
- Замер как у FIX-C10: Redis остановлен → четыре гостевых пишущих входа и `/api/chat/threads/:id/messages`
  отвечают 503 и не пишут (дельта строк 0), `propose`, `GET /api/public/bookings/:id` и каталог — 200;
  контроль с поднятым Redis.
- Гейты: `typecheck`, `lint`, `check:encoding`, `check:mojibake`, `check:error-message-lang`.

## Документы

- BACKLOG — удалить пункт; BACKLOG-DONE — строка (упомянуть, что асимметрия 429/503 закрыта FIX-C11,
  а legacy-остаток — этим изменением).
- Контекст (rate-limit, rule 15): §10 — абзац «Fail-closed достигается ТРЕМЯ разными механизмами»
  переписать на «шаблон пути + OTP-модуль»; снять фразу «их путей в `SENSITIVE_ROUTE_PREFIXES` нет и
  быть не должно»; §3 — модуль `lib/rate-limit/keys.ts`.
- `docs/runbooks/redis-down.md` — проверить, что описанное поведение не изменилось.
- DEPLOY-BACKLOG — строка «сброс окон лимитов в момент деплоя, ожидаемо».

## Риски

- Чокпоинт каждого запроса: ошибка в разборе шаблона меняет политику для всех. Сверка «до/после» по
  добытым ключам — обязательна до мержа.
- Роут, лимитирующий по пути, отличному от своего (общий лимитер двух роутов), получит два ведра
  вместо одного — найти при переводе (сейчас: `guest-manage-route.ts` на `cancel` и `reschedule`).

# 11 · Клиент показывает сообщение сервера

**Источник:** `CLIENT-ERROR-MESSAGE-PASSTHROUGH-SWEEP`, `ERROR-MESSAGE-UI-HELPER` (BACKLOG) · **Тип:** доработка · **Объём:** L
**Зависит от:** 10 (тосты — в них уходит выбранная строка на шести поверхностях мастера, где сегодня `window.alert`)

## Что не так

Сервер отдаёт курируемые русские отказы (`AppError.message`, §13 контекста), но клиент во многих местах их не читает и печатает свою догадку. Решение «показать серверное или своё» принимается **посайтово** по правилу FIX-C8: может ли пользователь на этот отказ отреагировать. Инструмент готов — `serverMessageOr(error, fallback)` и признак `ApiClientError.fromServer` (`src/lib/http/client.ts:53`, `:23`), сторож подмножества — `src/lib/http/actionable-refusal-passthrough.test.ts` (9 поверхностей).

Пересчёт на 2026-09-29 тем же детектором, что в BACKLOG (клиентский файл с `"use client"`, содержит сырой `fetch(`, не содержит ни одного из `error?.message|error.message|fetchJson|ApiClientError|getErrorMessageByCode`):

- **Не читают ответ вовсе — 52 файла / 69 сайтов** (было 55/74 на 2026-09-24; в записи BACKLOG 53/71 — та же форма детектора, но по подстроке `fetch(`, которая ловит и `prefetch(`, и упоминания в комментариях). Из 69 — **42 изменяющих** (POST/PATCH/DELETE) и **27 чтений** (GET).
- **Разбирают конверт руками — 49 сайтов в 39 файлах** (`error?.message ?? …` / `|| …`; это и есть `ERROR-MESSAGE-UI-HELPER`, там было 47/37). Они уже показывают серверную строку, но вслепую: без `fromServer`, каждый своим разбором, 22 из 49 — в `features/studio-cabinet`.
- **Слепые формы детектора** (в число выше не входят): `fetchWithAuth(` без чтения — 3 файла / 4 сайта (`features/cabinet/components/marketing-consent.tsx` ×2, `share-profile-section.tsx`, `lib/hooks/use-me.ts`); клиентские модули без директивы `"use client"` (`features/booking/lib/studio-booking.ts`, `booking-config.ts`, `lib/notifications/push/push-client.ts`); и главное — **гранулярность по файлу**: файл, где хоть один сайт читает `error.message`, считается чистым целиком (правило 3 GUARD-INTEGRITY). Всего в клиентском коде 150 файлов / 235 сырых вызовов `fetch(`+`fetchWithAuth(` против 46 вызовов `fetchJson` в 27 файлах.

Действенные серверные отказы, которые сейчас гибнут (проверено по роутам): «Слишком много запросов. Попробуйте позже.» 429 и «Сервис адресов временно недоступен.» 503 (`api/address/suggest/route.ts:26`, `geocode`), «Заявка уже обработана.» 409 (`api/master/model-applications/[applicationId]/propose-time/route.ts:51`), «Город с таким слагом уже существует.» (`api/admin/cities/route.ts:175`), «Лимит нельзя сделать строже, чем у родительского тарифа.» (`api/admin/billing/plans/[id]/route.ts:150`), «В пакет нужно добавить минимум 2 услуги.» (`lib/master/services-mutations.ts:321`, под общим кодом `VALIDATION_ERROR`). Сервер местами формулирует хуже клиента: «Обнаружен цикл наследования тарифов» (`plans/[id]/route.ts:113`, без точки и без действия) против `UI_TEXT` «…— выберите другой родительский тариф.» — такие строки правятся на сервере.

Попутно: `features/booking/lib/studio-booking.ts:186, 210, 245, 306` — русские запасные строки литералами мимо `UI_TEXT`; пять загрузчиков клиентского кабинета бросают `new Error(json.error?.message ?? "load_failed")` (`client-reschedule-modal.tsx:39`, `client-favorites-page.tsx:40`, `client-notifications-page.tsx:71`, `client-profile-page.tsx:88`, `client-reviews-page.tsx:35`) — если такой `message` где-то выводится, пользователь видит `load_failed`.

## Что сделать

### Шаг 0. Один чокпоинт вместо второго помощника (закрывает `ERROR-MESSAGE-UI-HELPER`)

Предложенный в BACKLOG `errorMessageFrom(body, fallbackKey)` не заводить: это был бы второй разбор конверта рядом с `fetchJson`, и 49 сайтов разошлись бы с правилом `fromServer`. Вместо него в `src/lib/http/client.ts`:
- вынести разбор ответа из `fetchJson` в `readApiResponse<T>(res: Response): Promise<T>` (бросает `ApiClientError` с `fromServer`) — для сайтов, которым нужен сам `Response`;
- `fetchJsonWithAuth<T>(input, init)` — тот же разбор поверх `fetchWithAuth` (кабинетам нужен уход на `/login` по 401);
- `fetchJson` — поверх `readApiResponse`, поведение не меняется.
Тест — в `actionable-refusal-passthrough.test.ts`: все три пути дают одинаковый `ApiClientError` на одном и том же конверте (серверные конструкторы `jsonFail`/`otpRateLimitFail`, как уже сделано там).

### Шаг 1. Замороженный инвентарь (сторож, до правок)

`src/lib/http/client-fetch-inventory.test.ts` + `client-fetch-inventory.json` (дельта-базлайн, как `sensitive-fail-open-known.json`): для каждого клиентского файла — число сырых `fetch(`/`fetchWithAuth(` и число ручных разборов `error?.message ??`. Клиентский файл = `"use client"` **или** вызывает `fetch` с относительным `/api/…` (так ловятся модули без директивы). Разбор — через `stripComments` из `lib/testing/source-scan.ts`. Красный: новый файл, рост числа в файле, уменьшение без правки JSON (базлайн не должен молча расходиться с кодом). Контроль машинерии — на фикстуре (сырой вызов с хвостовым комментарием виден, `fetchJson(` и `prefetch(` — нет). В шапке назвать слепую форму: замена одного сырого вызова другим в том же файле при неизменном числе.

### Шаг 2+. По областям, по одному коммиту на область

На каждом сайте — одно из трёх решений, и каждое пиннится в сторожах:
- **серверное** — отказ действенный: `fetchJson`/`fetchJsonWithAuth` + `serverMessageOr(error, UI_TEXT…)`; файл добавляется в `ACTIONABLE_REFUSAL_SURFACES`. Если у поверхности есть более точная строка для конкретного кода — проверить `error.code` до вызова (образец — `reviews-preview.tsx`, `row-menu.tsx` с `SERVICE_HAS_BOOKINGS`);
- **своё** — действия нет (чтение списка, пагинация, подсказки): оставить строку поверхности; строка в новом списке `OWN_STRING_BY_DECISION` того же сторожа с причиной;
- **тихо** — фоновое действие без участия пользователя: только `catch` без сообщения; тот же список, причина «фон».

Порядок (по пользе, как в BACKLOG):

| # | Область | Файлы / сайты | Что там |
|---|---|---|---|
| 1 | Адреса | 3 / 6 | `master/.../profile/editable/address-editor.tsx` (PATCH + подсказки + геокодер), `catalog/components/district-suggest-input.tsx`, `lib/maps/use-address-with-geocode.ts`. 429 и 503 — разные советы («подождите» / «сервис недоступен»), оба видны при вводе. Подсказки — чтения, но отказ лимитера действенный → серверное |
| 2 | Модель-офферы | 6 / 8 | `master/components/model-offers/*`: одобрить/отклонить/предложить время/создать/изменить/закрыть/в архив. «Заявка уже обработана» — гонка двух вкладок → серверное |
| 3 | Кабинет мастера | 12 / 18 | портфолио (`portfolio-card`, `edit-item-modal`), услуги (`bundle-modal`, `row-menu`, `reorder-controls`), сессии, удаление кабинета, профиль (`editable-textarea-row`, `social-editable-row`, `timezone-selector`), уведомления (`mark-read`, `mark-all-read`). Четыре файла здесь и два в области 2 — сайты `window.alert` из спеки 10: там выбранная строка идёт в `toast.error` |
| 4 | Админка | 8 / 13 | `cities-table` (5), `reviews-list` (2), `payments-tab`, `plans-grid`, `subscriptions-table`, `users-table`; `events-feed`/`system-health` — чтения → своё. Сначала поправить серверную строку про цикл тарифов |
| 5 | Кабинет студии | 3 / 3 + ручной разбор 22 | `pause-master-dialog`, `notifications-filters`, `studio-revenue-chart` (чтение); ручной разбор в `studio-cabinet/{services,schedule/components/dialogs,masters,reviews,settings,notifications}` → `fetchJsonWithAuth` + `serverMessageOr` (поведение уже «серверное», меняется только разбор) |
| 6 | Кабинет клиента | ручной разбор 9 | `client-cabinet/{bookings,reviews,favorites,notifications,profile}`; загрузчики с `"load_failed"` — на `fetchJsonWithAuth` |
| 7 | Вход, поддержка, чат, уведомления ВК/Telegram | ручной разбор 13 + 3 файла `fetchWithAuth` | `app/login/login-client.tsx` (4, уже с `getErrorMessageByCode`), `app/support/support-client.tsx`, `cabinet/components/{telegram,vk}-notifications.tsx`, `chat/components/booking-chat.tsx`, `marketing-consent`, `share-profile-section`, `use-me`, `use-plan-features`, `use-telegram-status`, `model-offers/components/*` (2), `use-master-booking-cancel.tsx`. Вход — отдельным коммитом и с живой проверкой обоих каналов |
| 8 | Публичные страницы, каталог, запись | 20 / 21 + ручной разбор 4 (`studio-booking.ts`) | почти всё — чтения → своё; изменяющие: избранное (`catalog-card`, `favorite-toggle-button`: 401 → окно входа, лимит → серверное), `partnership-form` (серверное), выход (`logout-button` — тихо, уход на страницу). `studio-booking.ts` — запасные строки перенести в `UI_TEXT` |

Итого к разбору: 69 сайтов без чтения + 49 ручных разборов + 4 сайта `fetchWithAuth` = **122 сайта**.

## Решения владельца

Не нужны: критерий выбора строки задан правилом FIX-C8 (§13 контекста), серверные формулировки правятся по канону ошибок из `CLAUDE.md`. Если при разборе области найдётся серверная строка, смысл которой меняется (а не формулировка), — вопрос владельцу в отчёте этой области, а не в спеке.

## Готово, когда

- Детектор BACKLOG находит 0 файлов; `client-fetch-inventory.json` содержит только сайты с решением «своё»/«тихо», и у каждого есть строка в `OWN_STRING_BY_DECISION`.
- Ручных разборов `error?.message ??` в клиентском коде нет (кроме `lib/http/client.ts`).
- Все действенные отказы из списка выше доходят до пользователя дословно (проверка — тест на серверном конструкторе, как в существующем стороже).
- `studio-booking.ts` без русских литералов; `"load_failed"` не может попасть в разметку.

## Проверка

- Тесты: расширить `actionable-refusal-passthrough.test.ts` семействами «адреса 429/503», «гонка отклика модели», «город со слагом», «лимит тарифа», «пакет меньше 2 услуг» — каждый на серверном конструкторе ответа + контр-кейс «500 без тела оставляет строку поверхности»; новый `client-fetch-inventory.test.ts`.
- Пробы (@probe, правдоподобная форма): в уже переведённом файле вернуть `const res = await fetch(url); if (!res.ok) throw new Error(T.x);` рядом с существующим `fetchJson` — должен краснеть инвентарь (рост числа), хотя файл «читает `fetchJson`» (ровно та файловая амнистия, которую прежний детектор давал). Вторая ось: тот же вызов через `fetchWithAuth(` — тоже красный.
- Гейты: `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake && npm run check:ui-text && npm run check:error-message-lang`.
- Живая на каждую область: вызвать отказ (DevTools → блок запроса / подмена ответа или реальное условие: 6+ быстрых запросов подсказки адреса, отклик модели, одобренный во второй вкладке) и сверить текст на экране; роли — мастер (1–3), админ (4), студия (5), клиент (6), гость (8); телефон и ПК, обе темы для сообщений в новых местах.

## Документы

- BACKLOG: удалить оба пункта; BACKLOG-DONE — по строке на пункт (числа «до/после»).
- `docs/QUALITY-GATES.md` — абзац про клиентский инвентарь рядом с `check:error-message-lang` (слепая зона гейта теперь видима с двух сторон).
- Контекст §13 «Ошибки» — заменить «63 клиентских файла / 88 сайтов» и ссылку на `CLIENT-ERROR-MESSAGE-PASSTHROUGH-SWEEP` на итог и имя сторожа; упомянуть `readApiResponse`/`fetchJsonWithAuth` (изменение чокпоинта — триггер правила 15).

## Риски

- Меняется видимый текст на ~50 экранах: это копирайт, а не дефект. Поэтому — по области за коммит и с живой сверкой, а не одним свипом.
- `fetchJsonWithAuth` при 401 уводит на `/login` (как `fetchWithAuth`); на публичных страницах его не использовать — там 401 значит «покажи окно входа».
- Часть серверных строк рассчитана на форму, а не на тост (длинные, с перечислением полей). Если строка не помещается в тост — вывод в форме, не обрезать.
- Зависимость от 10: на шести поверхностях мастера делать после тостов, иначе серверная строка уйдёт в `window.alert`.

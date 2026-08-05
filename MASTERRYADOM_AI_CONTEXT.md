# МастерРядом — Контекст проекта для ИИ

> Дата аудита: **3 августа 2026** (CONTEXT-REFRESH-V3 — полная пересинхронизация после RKN/pre-launch волны из 9 коммитов: AUTH-GATE-01, PAY-SEC-01, LOGIN-WOW-01, RKN-AUDIT-01, RKN-FIX-01/-02/-03-A/-06/-12. Предыдущие: DOCS-CONTEXT-REFACTOR-01 — 8 июля, R2 — 23 июня, V3 — 29 мая, V2 — 13 мая 2026).
>
> **Что это.** Снапшот текущего состояния проекта: (а) рабочий гайд для ИИ-агента (грузится в каждую сессию через `@`-импорт в `CLAUDE.md`), (б) обзор продукта и его состояния для человека. **Это НЕ changelog** — история коммитов живёт в git + [`BACKLOG-DONE.md`](BACKLOG-DONE.md).
>
> **Ведение.** Файл правится **только** при структурных триггерах (schema / routes / env / core-flows) — таблица в [`docs/QUALITY-GATES.md`](docs/QUALITY-GATES.md) § «Обновление контекста». Рутинные bugfix/UI/refactor-коммиты файл **не трогают** (DOCS-LEDGER-01). Раз в ~2 недели / после большого спринта — полный CONTEXT-REFRESH. **Держим лаконичным: истории тут не место.**
>
> **Смежные документы (этот файл их НЕ дублирует, а ссылается):** правила кода — [`CLAUDE.md`](CLAUDE.md); чеклист коммита — [`docs/QUALITY-GATES.md`](docs/QUALITY-GATES.md); мета-уроки процесса — [`docs/SPRINT-PATTERNS.md`](docs/SPRINT-PATTERNS.md); дизайн — `.claude/skills/ui-ux-pro-max/SKILL.md`; открытые задачи — [`BACKLOG.md`](BACKLOG.md); QA-ledger — [`QA-FINDINGS.md`](QA-FINDINGS.md).
>
> **Счётчики (пересчитаны 2026-08-03):** моделей **68** · enum'ов **38** · миграций **30** (последняя `20260803230000_booking_drop_legacy_time_columns`; источник — `prisma/schema/migrations/`) · test-файлов **167** (**1544** теста; 166 в `src/` + 1 в `scripts/`) · error-codes **139** (`src/lib/api/errors.ts`) · инвариантов **38** (§12) · API-роутов **287** · страниц **88**.
>
> **Стадия:** MVP-plus, активная pre-launch подготовка. Рабочая ветка — **`main`** (волна RKN влита туда решением владельца; про `predeploy`-дисциплину в смежных доках — см. §8 «Расхождения в доках»). Round 1 + Round 2 self-QA пройдены (booking / billing / catalog / timezone / auth-CSP закрыты). Остаток до launch — преимущественно **operational** (deploy/ops — см. §8) плюс юридический пакет (§8).
>
> **Построено и живо:** Cabinet Master · Cabinet Client · Cabinet Studio · Admin Panel · публичные профили мастера/студии + booking-widget (гостевой checkout) · чат · мультигород · trial-подписки · email-OTP · package-booking (solo + studio) · Yandex/VK OAuth (Telegram-login gated OFF, см. §1) · available-today pipeline · opt-in renewal · **правовой слой** (согласия по целям на всех путях регистрации + гостевой брони, версионируемые документы `/terms` `/privacy` `/consent`, cookie-уведомление) · **error-tracking (GlitchTip)**.
> **В работе / отложено:** SMS-шлюз (код готов — нужен prod-env), полный per-viewer-tz рендеринг, visual-search reactivation, retention-политика (RKN-FIX-04), отзыв согласия (RKN-FIX-18).

## Оглавление

1. Продукт и бизнес-модель (+ зафиксированные продуктовые решения)
2. Технический стек
3. Архитектура кода
4. Модель данных
5. Реализованная бизнес-логика (core flows)
6. Маршруты и API
7. Переменные окружения
8. Текущее состояние: открытые риски и pre-launch
9. Тестирование
10. Безопасность
11. Производительность, AI-провайдер, инфраструктура
12. Инварианты — что нельзя ломать
13. Правила при работе с кодом
14. Быстрый старт для ИИ
15. История и changelog (указатель)
16. Seed / showcase-аккаунты

---

## 1. ПРОДУКТ И БИЗНЕС-МОДЕЛЬ

**Продукт:** МастерРядом — маркетплейс-агрегатор онлайн-записи к бьюти-мастерам (маникюр, стрижки, массаж и пр.). Кодовое имя в репозитории — **BeautyHub**. Домен — **МастерРядом.online** (кириллический IDN = punycode `xn--80aic0adlmagk0m.online`; для OAuth redirect_uri значение должно byte-match консоли провайдера).

**Тезис.** Спрос-первичен: клиенты находят мастера/студию, смотрят портфолио и записываются онлайн; мастера и студии — сторона предложения, управляют расписанием, бронированием, профилем. Монетизация — с провайдеров (SaaS-подписка), не с клиентов.

**Рынок: только Россия** (решение владельца 2026-08-04, RF-ONLY-SCOPE-01 — см. §8). Showcase-данные — RF-only (Москва + Екатеринбург). Timezone: `DEFAULT_TIMEZONE = Europe/Moscow` (он же schema `@default`); рабочая tz провайдера **derived из города** (`City.timezone`) при сохранении адреса, с явным cabinet-селектором для override. Цены в рублях, **хранятся в копейках**; на всех поверхностях форматируются ÷100.

**Роли:**
| Роль | Описание |
|------|----------|
| CLIENT | Клиент, записывается к мастерам |
| MASTER | Мастер-одиночка, свой кабинет |
| STUDIO | Студия с командой мастеров |
| STUDIO_ADMIN | Администратор студии |
| ADMIN | Администратор платформы |
| SUPERADMIN | Суперадмин платформы |

**Монетизация (SaaS для провайдеров):**
- Тарифы FREE / PRO / PREMIUM; периоды 1/3/6/12 мес (скидка 20% за год); платежи через **ЮКасса (YooKassa)**; grace-period 7 дней при просрочке (`PAST_DUE_GRACE_DAYS = 7`).
- **Цена — единый `resolvePlanPrice`** (`src/lib/billing/pricing.ts`): один источник для checkout / renewal / cabinet / marketing `/pricing`. Сохранённая цена ≤0 → fallback monthly×N (12 мес со скидкой 20%), **никогда не бесплатно** для платного плана.
- Лимит команды студии `maxTeamMasters` — **ACTIVE-only счёт** (только принятые+опубликованные; pending/INVITED/DISABLED место не занимают). Guard `ensureStudioTeamLimit(studioId)` резолвит cap из плана владельца и enforce'ит на всех seat-becomes-ACTIVE точках.

**Уникальные фичи:** «Горячие слоты» (HotSlot — скидочный слот в последний момент), «Модель-офферы» (ModelOffer — поиск моделей для практики), визуальный поиск по фото (embeddings + pgvector, dormant).

### Зафиксированные продуктовые решения

Не выводятся из кода — решены продуктом, менять только с согласованием:
- **Cap команды (BC-CAP):** FREE=2 / PRO=6 / PREMIUM=20, `null`=unlimited — канон `STUDIO_TEAM_CAP_BY_TIER` (`billing/constants.ts`, single source); admin-managed для PRO/PREMIUM; счёт ACTIVE-only.
- **Opt-in renewal при росте цены:** если на renewal новая цена > последнего платежа — cron **не** авто-списывает, а открывает **2-дневное opt-in-окно** (PAST_DUE + graceUntil + reminders 24h/2h). Равная/меньшая цена → авто-renew как обычно.
- **Trial:** оплата mid-trial структурно чистит trial-флаги (не выбирается trial-cron'ом); повторный trial не выдаётся.
- **Telegram (152-ФЗ / FZ-199):** user-facing Telegram (login + delivery) **погашен pre-launch** через env hard-ceiling `NEXT_PUBLIC_TELEGRAM_ENABLED` (default OFF; admin-toggle не может перебить env-off). Ops-monitoring Telegram (`MONITORING_TELEGRAM_*`) — отдельная система, не gated. **Deploy-note:** держать флаг unset/false в prod до юридического ревью.
- **Auth-провайдеры:** OTP (SMS-шлюз pending) + Yandex ID OAuth + VK OAuth. Telegram-login gated OFF.
- **Цена платного плана никогда не 0** (0/≤0 stored → fallback, см. `resolvePlanPrice`).
- **Package booking:** отмена только целиком (all-or-none), не по частям.
- **Studio masters** не показывают индивидуальный PREMIUM-бейдж (подписка шарится на команду — инв. #20).

---

## 2. ТЕХНИЧЕСКИЙ СТЕК

### Версии и зависимости
Источник — `package.json`. Пины, которые нельзя менять без согласования: **Next.js — только внутри 16.x** (webpack, не turbopack; на 2026-08-05 стоит **16.3.0**), **Prisma не до v7**.

> **Апгрейд Next 16.1.6 → 16.3.0 (SEC-07, решение владельца 2026-08-05).** Пин «не апгрейдить» держался с эпохи webpack-миграции и получил цену: адвизори покрывало диапазон `9.3.4-canary.0 – 16.3.0-preview.10`, а в списке — *middleware/proxy bypass через segment-prefetch и через инъекцию динамического параметра*, *XSS при CSP-nonce*, *cache poisoning редиректов прокси*. У проекта И рейт-лимит-тиры, И CSP живут в `src/proxy.ts`, то есть обход прокси снимал оба слоя разом. Апгрейд сделан **отдельным изолированным коммитом**, чтобы регрессия читалась однозначно; проверен полным `check`, прод-билдом и рантайм-смоуком собранного артефакта (заголовки, уникальность nonce, срабатывание тира). Побочно ушла вложенная уязвимая копия `sharp@0.34.5` внутри `next`.
>
> **Новое предупреждение линтера от 16.3.0:** правило `@next/next/no-location-assign-relative-destination` подсвечивает 5 существующих мест с `window.location` на внутренние маршруты (`logout-button`, `vk-notifications`, `client-profile-page`, `hot-slots-subscribe-button`, `fetch-with-auth`). Это warning, не error; заведено в BACKLOG как `NEXT163-LOCATION-ASSIGN`.

> **Security-бампы SEC-07 (2026-08-05).** `sharp` 0.34.5 → **0.35.3** (CVE-2026-33327/33328/35590/35591 в libvips; sharp обрабатывает пользовательские загрузки), `nodemailer` 8.0.2 → **9.0.4** (SMTP command injection / CRLF — почта уходит с пользовательским телом в `/api/support/*`), `prisma` + `@prisma/client` 6.19.2 → **6.19.3** (остаёмся в v6, пин не нарушен). Все три — существующие зависимости, не новые. БД — PostgreSQL + pgvector (dev-образ `pgvector/pgvector:pg16`), кэш/очередь — Redis, валидация — Zod, стили — Tailwind (только токены, см. дизайн-скилл).

> ⚠️ **Токен живёт в ДВУХ местах** (HARDENING-MISC-01): CSS-переменная в `src/app/globals.css` **и** мост в `tailwind.config.js`. Переменная без моста — это класс, который компилируется **в ничто**: разметка выглядит правильной, стиля нет, ошибки нет. Так «пропала» точка статуса на `/login`, и так же молча не работали `shadow-brand` (7 сайтов) и `bg/text-destructive` (3). Добавляя состояние или тень — проверяйте обе половины.

### Интеграции
YooKassa (платежи) · Яндекс S3 / Геокодер / Suggest (медиа, адреса) · Yandex ID OAuth · VK OAuth · Telegram Bot API (gated OFF, + monitoring) · YandexGPT (chat AI, §11) · Yandex AI Studio (visual-search vision `qwen3.6-35b-a3b` + `text-search` embeddings, §11; dormant) · web-push VAPID (push) · nodemailer SMTP (email) · SMSC.ru (SMS, код готов — не подключён) · Sharp (изображения) · AWS SDK S3. *(OpenAI полностью удалён из кодбазы — VISUAL-SEARCH-YANDEX-MIGRATION-01 2026-07-13.)*

### CI/CD и запуск
CI-гейты — `.github/workflows/quality-gates.yml`, деплой — `.github/workflows/deploy.yml` (Docker → Yandex Container Registry → SSH). Не выводится из конфигов: **воркер очереди (`npm run worker`) — отдельный процесс**, его надо поднимать рядом с Next-приложением.

---

## 3. АРХИТЕКТУРА КОДА

### Структура `src/`
Раскладка выводится из `ls src/` (`app/` · `components/` · `features/` · `hooks/` · `lib/` · `types/`). Что из дерева НЕ видно:
- `src/proxy.ts` — middleware-class, в Next 16 переименован из `middleware.ts`; делает CORS/CSP/rate-limit-tier.
- `src/worker.ts` — воркер очереди задач + периодические джобы (available-today sweep, price-optin cron, …), **отдельный процесс**.
- `src/features/studio/` удалён — актуальный слайс `studio-cabinet`.

### Ключевые паттерны
- **Thin API routes** — бизнес-логика в `src/lib/`, `route.ts` — тонкая обёртка.
- **UTC-first** — все даты хранятся в UTC (`startAtUtc`/`endAtUtc`), локальное только для отображения (см. §12 инв. #1, §13 «Время»).
- **Dual storage** — Redis primary, memory-fallback в dev (rate-limit / queue / notifier).
- **RBAC** — `requireAuth()` / `requireRole()` / `hasAnyRole()` (`src/lib/auth/guards.ts`); fail-closed rate-limit для чувствительных роутов.
- **Централизованные UI-тексты** — `UI_TEXT` из `src/lib/ui/text.ts` (хардкод русских строк запрещён, проверяется скриптом).
- **Server/Client boundary** — client-компоненты не импортируют server-only модули даже транзитивно; runtime-хелперы для клиента — в `*-shared.ts` (образец: `schedule/editor.ts` server ↔ `editor-shared.ts` client). См. §12 инв. #15.
- **Env только через `src/lib/env.ts`** (Zod) — `process.env.*` напрямую запрещён (исключения — CLAUDE.md rule 11).
- **Public-id opaque** — внутренние CUID не утекают в публичные API (`src/lib/public-id.ts`, инв. #29).
- **Deep-link focus** — booking/review/notification CTA используют единый `?focus=<id>` + shared `useFocusHighlight()` / `<FocusHighlighter/>` (скролл к `[data-focus-id]` + transient highlight, reduced-motion-gated).

> Конвенции именования / ошибок / auth / Prisma / schema-discipline — в [`CLAUDE.md`](CLAUDE.md). Cabinet-специфичные UI-паттерны (`MasterPageHeader`, `AppShellContent`, auto-save) — §13 + дизайн-скилл.

---

## 4. МОДЕЛЬ ДАННЫХ

> Источник истины — `prisma/schema/*.prisma`. Схема меняется **только** через `npx prisma migrate dev` (`db push` запрещён — CLAUDE.md rule 16). Ниже — карта, не автогенерация.

Модели (67), enum'ы (37), поля, связи и индексы **читаются из `prisma/schema/*.prisma`** — не дублируем их здесь. Центральные модели: `UserProfile`, `Provider` (+ `MasterProfile` / `Studio`), `Booking` (+ `BookingPackage` / `BookingServiceItem`), `Service` / `MasterService` / `ServicePackage`, `UserSubscription` / `BillingPlan` / `BillingPayment`, `Schedule*`, `Review`, `MediaAsset`, `City`, **`UserConsent`**.

### Заметки, которых в схеме не видно
- **`StudioMember` / `StudioMembership`** — обе таблицы популируются для совместимости; canonical state-machine — **Membership**.
- **`BillingPlan.code`** — canonical codes UPPERCASE; фичи наследуются через `inheritsFromPlanId`.
- **`MrrSnapshot`** — «paid-and-current» = `ACTIVE` + `!isTrial` + `currentPeriodEnd > now`.
- **`City`** — auto-grow из геокодера (`autoCreated`); `Provider.cityId` — `onDelete: Restrict`.
- **`Provider`** — дублирующие rating-поля (`rating`/`ratingAvg`, `reviews`/`ratingCount`) — техдолг, см. §8.
- **`Booking.startAt`/`endAt`** — **удалены** (BOOKING-TIME-COLUMNS-01, 2026-08-03; миграция `20260803230000_booking_drop_legacy_time_columns`). Канон и единственный источник — `startAtUtc`/`endAtUtc` (инв. #1). Пинится `bookings/single-time-source.test.ts` в двух слоях (схема + payload-форма, область обхода включает `prisma/seeds/` — там жили три пропущенных сайта). **Не путать** с `TimeBlock.startAt/endAt` и `ScheduleBreak.endAt` (их собственные канонические колонки), `Booking.proposedStartAt/proposedEndAt` (предложение переноса, инв. #32) и DTO-полем `CalendarBooking.startAt` в публичном ответе, которое наполняется из `startAtUtc`.
- **`UserConsent`** (RKN-FIX-01, миграция `20260801223527_rkn_fix_01_consent_purposes`) — доказательство согласия по 152-ФЗ ст. 9. Уникальность (RKN-FIX-18) — **partial unique в сыром SQL**: `UNIQUE(userId, consentType, documentVersion) WHERE "revokedAt" IS NULL` (`UserConsent_active_unique_idx`, реестр `scripts/raw-sql-objects.mjs`). БД гарантирует «не более одной **АКТИВНОЙ** строки на цель+версию», отозванных может быть сколько угодно. Прежний полный `@@unique` это запрещал и тем самым **вынуждал оживлять** отозванную строку при повторном согласии — что стирало исходный `agreedAt` и сам факт отзыва, т.е. предмет доказывания. Теперь: bump версии даёт новую строку при следующем входе; отзыв ставит `revokedAt` и строку не трогает; повторное согласие вставляет **новую** строку. Повторный вход на неизменной версии не пишет ничего. Цель **`ConsentType.PD_PROCESSING`** — отдельная от `PRIVACY`: политика **информирует**, согласие на обработку — самостоятельный акт против отдельного документа `/consent`. `PRIVACY` больше не пишется вообще. Пишет ТОЛЬКО `src/lib/legal/consent.ts` (§10).
- **`PdAccessLog`** (RKN-FIX-10, миграция `20260803105142`) — append-only след **массовых чтений ПДн**, для scoping инцидента (152-ФЗ ст. 21 ч. 3.1: 24 ч на уведомление, 72 на расследование). Мутации аудировались (инв. #16/#18/#19), чтения — нет. 🔴 **Прочитанных данных в таблице НЕТ**: только актор (+`actorType`: в каком качестве читал — ADMIN/MASTER/STUDIO/SYSTEM), ключ поверхности, тип сущности, **счётчик** и **форма** фильтра (`filterFingerprint` — имена фильтров, не значения), scope-якорь, requestId, IP. Иначе журнал защиты ПДн сам стал бы их второй копией. Одно событие **на ответ**, не на строку. `actorUserId` → `SetNull` при удалении аккаунта (см. карту диспозиций). **Это scoping, не детект** — пороги/алерты отдельной задачей в BACKLOG. Пишет только `lib/audit/pd-access.ts`.
- **`RefreshSession.familyId`** (SEC-13, миграция `20260805091533`) — «семья» сессий, то есть один вход/устройство. Ротация создаёт НОВУЮ строку и помечает старую `revokedAt`, поэтому привязывать access-токен к `RefreshSession.id` нельзя: он умирал бы при каждом обновлении сессии. Семья наследуется по цепочке ротации и гибнет только от явного отзыва — на этом держится немедленное действие «завершить остальные сессии» (§10). Nullable: строки до миграции семьи не имеют и трактуются как legacy; такая цепочка получает семью со следующей ротации (fallback — собственный id claimed-строки).
- **`VkLink` / `YandexLink` — токенов провайдера НЕ хранят** (RKN-FIX-12, миграция `20260803094523`). Только identity: `vkUserId` + `deviceId` / `yandexUserId` + `isEnabled`. Токен из code-exchange живёт в локальной переменной callback'а (им дёргается профиль) и никуда не пишется. Возвращать колонки нельзя — пин `src/lib/auth/provider-tokens-at-rest.test.ts`.
- Уникальности и каскады, на которые опираются инварианты: #2 `OtpCode.codeHash` · #3 `RefreshSession.jti` · #4 `BillingPayment.idempotenceKey` · #7 `MasterService` · #8 `UserSubscription` · #9 `HotSlot` · #12 `MediaAssetEmbedding.vector(256)` · #16 `AdminAuditLog.adminUserId onDelete Restrict` · #17 `Review` soft-delete. Полные определения — §12 + схема.

---

## 5. РЕАЛИЗОВАННАЯ БИЗНЕС-ЛОГИКА (core flows)

### Аутентификация
`src/lib/auth/{jwt,otp,session,guards}.ts`. Кастомный JWT HS256 (без библиотек, `timingSafeEqual` — инв. #10). Access-token 2ч (cookie `bh_session`), refresh 30д (cookie `bh_refresh`, ротация цепочкой через `rotatedToSessionId`, single-use jti).

**Методы входа резолвит ОДНО место — `resolveAuthMethods()` (`src/lib/auth/auth-methods.ts`)**; клиентские поверхности получают результат пропом с сервера, сами флаги не читают (AUTH-GATE-01). Методы:
- **phone-OTP** — за server-only tri-state `PHONE_AUTH_ENABLED` (§7): в проде по умолчанию **выключен**. OFF = нет вкладки телефона на `/login` и `POST /api/auth/otp/{request,verify}` → 503 `SYSTEM_FEATURE_DISABLED` **до** генерации кода. Гейтится только **выпуск**, не валидация/refresh/logout.
- **email-OTP** (`EMAIL_AUTH_ENABLED` килсвитч, дефолт **ON**, + SMTP; вход резолвит **только подтверждённый** адрес — `emailVerifiedAt != null`, а первый успешный код сам ставит отметку владения — FIX-SEC-EMAIL-IDENTITY-01), **Yandex ID OAuth** (`src/lib/yandex/*`, account-linking зеркалит VK: session-link / new-vs-existing-by-yandexUserId / anti-hijack 409; PKCE S256 + HMAC-signed state/verifier cookies), **VK OAuth**. **Telegram-login gated OFF** (`NEXT_PUBLIC_TELEGRAM_ENABLED`); при re-enable — CSRF-defence через single-use signed `tg_login_state` cookie + nonce (см. §10).

**Согласия (RKN-FIX-01) — часть флоу регистрации, не UI-деталь.** Три независимые цели (оферта + обработка ПДн — обязательные, маркетинг — опциональный и регистрацию не гейтит) снимаются на **всех** путях создания пользователя: phone-OTP, email-OTP, VK, Yandex, Telegram. Без обязательных — **аккаунт не создаётся** (`assertRequiredConsents` → 400 `CONSENT_REQUIRED` / редирект `/login?error=consent`). Через OAuth-round-trip флаги едут в **подписанной state-bound cookie** (`lib/legal/oauth-consent-cookie.ts`: HMAC над `AUTH_JWT_SECRET` + привязка к `state`, single-use) — подделать/переставить в чужой флоу нельзя. Версии документов — из `lib/legal/documents.ts` (единственный источник), они же попадают в `UserConsent.documentVersion` (§4).

**Жизненный цикл согласия (RKN-FIX-18).** «Согласился → отозвал → согласился снова» — это ТРИ строки, а не одна изменяемая: строки `UserConsent` **никогда** не мутируются обратно в живые. Отзыв доступен пользователю только для **маркетинга** (`/cabinet/settings`, один компонент на все роли, `PATCH /api/me/consents/marketing`); отзыв ПДн/оферты — по существу запрос на удаление аккаунта, поэтому интерфейс его **маршрутизирует** (удаление + поддержка), а сервер отказывает (`isSelfRevocable` → `CONSENT_NOT_SELF_REVOCABLE`) — решение по существу за FIX-03-B. Маркетинговое согласие **не управляет сервисными уведомлениями**: подтверждения записей и напоминания идут независимо, и текст тумблера это прямо говорит. У гостя (RKN-FIX-02) UI отзыва нет — нет сессии; его путь к отзыву — регистрация либо поддержка.

### Бронирования
`src/lib/bookings/{createBooking,booking-core,flow,policy-enforcement}.ts`, `src/lib/studio/bookings.service.ts`.
- **Гостевой checkout:** четыре эндпоинта принимают гостя — `POST /api/bookings`, `POST /api/public/bookings`, `POST /api/public/packages/[id]/book`, `…/studio/book`. **Гость больше не создаёт бронь с `clientUserId: null`** (RKN-FIX-02): все четыре резолвят один и тот же passive-профиль по телефону (иначе согласию не к чему привязаться); конечное состояние то же, что раньше давал пост-signup link.
- **Согласие гостя — server-enforced на всех четырёх** (RKN-FIX-02): без `consent: {terms, pdProcessing, marketing}` → 400 `CONSENT_REQUIRED` **до** создания профиля и брони. Поле опционально в схеме — авторизованные клиенты его не шлют и чекбоксов не видят. **Anti-forgery:** аноним пишет согласие ТОЛЬКО на профиль, который никогда не был аккаунтом (`isGuestClassProfile`, §10) — телефон зарегистрированного пользователя даёт 0 строк.
- **Единая in-tx Serializable conflict-дисциплина на ВСЕХ write-путях** (funnel · solo-master manual · studio create/move · reschedule): `ensureNoConflicts`/exclude-self re-check **внутри** `$transaction` (`isolationLevel: Serializable`) + commit-time P2034/P2002 → чистый 409 `SLOT_CONFLICT` (инв. #31).
- **Policy enforcement** (`policy-enforcement.ts`): `assertBookingWindow` (minBookingHoursAhead / maxBookingDaysAhead / acceptNewClients / visibleSlotDays — defense-in-depth на slots-endpoint + `resolveBookingCore`); `assertMasterPerformsService` (same-service при move); studio work-hours guard в **salon-tz** (`resolveSalonLocalParts`, engine-matching — не `getUTCHours`).
- **Reschedule = two-sided approval (инв. #32):** сторона предлагает → `CHANGE_REQUESTED` + `proposedStartAt` + `actionRequiredBy`; другая сторона confirm (`/confirm`) или decline (`/decline-reschedule`, revert). Solo-master и studio-admin делят один backend (`requireBookingConfirmAccess` → `actor:"MASTER"`). Studio-admin **Move** — отдельное direct-authority действие (инв. #22).
- **Package booking (инв. #34):** атомарный пакет N услуг в одной Serializable-транзакции (BookingPackage + N Booking + N BookingServiceItem; all-or-none; proportional discount Σ-exact). Solo (`package-booking.ts`, один мастер, sequential) + studio multi-master (`package-booking-studio.ts`, мастер на каждый компонент, sequential по timeline клиента, by-client overlap). Cancel — только целиком; reschedule части — обычный move (grouping survives).
  - **Placement — per-component, выбирает клиент** (PACKAGE-SOLO-WIZARD-01): оба фронта — визарды «дата→время на каждый компонент, контакты один раз в конце», брони материализуются только на `/book`. Компоненты могут быть в **разные дни**. `/propose` (solo + studio) — per-component, advisory (цена review-экрана); solo single-anchor auto-sequencer удалён.
  - **Порядок компонентов держит ВИДЖЕТ, не бэкенд** — сервер enforce'ит только non-overlap (`intraPackageOverlap` / `…MultiMaster`), не sortOrder-порядок. Курсор следующего компонента: solo (один мастер) = `prevEnd + buffer` — `nextComponentEarliestStart` (`package-cursor.ts`, пиннится тестом к границе приёма guard'а); studio = `prevEnd` (разные мастера ⇒ buffer 0; same-master-twice — известный зазор, `PACKAGE-STUDIO-SAME-MASTER-BUFFER` в BACKLOG).
- Идемпотентность через `x-idempotency-key` + Redis-lock (инв. #28); rate-limit; инвалидация кэша слотов.
- **Напоминания 24ч/2ч** через очередь. Время во всех уведомлениях/поверхностях — **salon-tz с меткой** «(Город, GMT+N)» через `formatBookingWhenLabel` / `formatLocalHm` (никогда сырой UTC).

### Расписание
`src/lib/schedule/{engine,engine-core,slots}.ts`. `ScheduleEngine` вычисляет `DayPlan` из шаблонов/overrides/breaks; режимы FLEXIBLE / FIXED; кэш `DayPlan` в Redis (ключ providerId+dateKey+timezone+scheduleVersion); `buildSlotsForDay` учитывает брони. Единый bookable-slot primitive `listBookableSlots` (min-ahead cutoff + фильтр) для slots-endpoint и `/availability`. Менять расписание — **только** через `editor.ts` + обязательная инвалидация кэша.

### Платежи и биллинг
`src/lib/payments/yookassa/*`, `src/lib/billing/*`.
- **Webhook authenticity = worker API re-fetch (инв. #5):** YooKassa **не подписывает** уведомления. Route делает дешёвые pre-filter (optional `?token=` + IP-allowlist log-only) и enqueue'ит только `{event,objectId}`; **worker re-fetch'ит объект из API** и действует ТОЛЬКО по API-reported `status`/`amount`/`metadata`. Идемпотентно (early-return на SUCCEEDED); период/план из authoritative DB-payment-row, не из mutable metadata.
- **Единый `resolvePlanPrice`** (инв. #30): display==signup==renewal; ≤0 → fallback, никогда не бесплатно.
- **Opt-in renewal при росте цены** (`price-optin.ts` + `price-optin-cron.ts`): вход в 2-дневное окно вместо авто-charge; accept = checkout на новую цену → re-anchor; lapse → grace-cron экспайрит.
- **Trial-конверсия:** success-webhook + FREE-checkout чистят trial-флаги; `downgradeTrialToFree` skip+warn при payment-evidence.
- **Stale-cancel guard:** `payment.canceled/failed` для renewal-платежа не клоббирует уже re-anchored подписку.
- **Grace даёт доступ** (`isSubscriptionActive`, единый предикат для get-current-plan + analytics guards): активна если в оплаченном периоде ИЛИ PAST_DUE в grace-окне.
- **Admin refund** (`decideRefund`): только `SUCCEEDED`, только полный возврат, детерминированный idempotency-key; аудит `REFUND_REQUESTED` + `PAYMENT_REFUNDED` ровно один раз.
- `BILLING_PERIODS = [1,3,6,12]`; фичи наследуются через `inheritsFromPlanId`; `BillingAuditLog` — журнал. `MrrSnapshot` — daily cron через `/api/billing/mrr/snapshot/run`.

### Уведомления
`src/lib/notifications/*`. Три канала: in-app (`Notification`) + push (web-push VAPID, per-user gated `pushNotificationsEnabled`, gesture-gated permission) + Telegram (gated OFF). Notifier: Redis Pub/Sub в prod, EventEmitter в dev; SSE `/api/notifications/stream`. `sendPushToUser` structurally не reject'ит (весь body в try/catch + `.catch` на fire-and-forget call-site'ах — иначе `unhandledRejection` роняет воркер). In-app CTA централизованы (`resolveNotificationOpenHref` → единый `?focus=<id>`). 55+ типов.

### Прочие домены
- **Горячие слоты** (`hot-slots/*`): anti-fraud rebook-block, подписки, динамическая скидка.
- **Очередь задач** (`queue/*`, `worker.ts`): Redis Lists `queue:{jobs,processing,dead}` + heartbeat side-hash; **atomic dequeue + lease** (краш-safe, `recoverStuckJobs` adopt по staleness 5мин, heartbeat 30с); до 3 попыток → dead-letter. Джобы: telegram.send, booking.reminder, visual_search_index, yookassa.webhook, media.cleanup, mrr.snapshot.daily. Health `/api/health/worker` (`WORKER_SECRET`).
- **Визуальный поиск** (`visual-search/*`, ⚠️ dormant): Yandex AI Studio vision (`qwen3.6-35b-a3b`) + `text-search-doc`/`text-search-query` embeddings (256, native) + pgvector `vector(256)` cosine; chokepoint `provider.ts`. `VISUAL_SEARCH_ENABLED=false`, 0 векторов. Включение: `migrate deploy` + `scripts/backfill-visual-embeddings.mts --apply` + флаг on.
- **CRM** (`crm/*`): ClientCard/ClientNote, мастер видит только своих (инв. #25).
- **Удаление аккаунта** (`deletion/{delete-account,user-data-disposition}.ts`): `DELETE /api/me/delete` чистит связи, анонимизирует профиль и **явно отзывает сессии** (`revokedAt`, строки `RefreshSession` НЕ удаляются намеренно — ПДн в них нет, а их наличие держит маркер «это был аккаунт» для `isGuestClassProfile`). RKN-FIX-03-A закрыл 5 пропущенных связей (`yandexLink`, `UserFavorite`, `HotSlotSubscription`, `StudioMembership`/`StudioMember`) и сделал класс невозможным: **карта диспозиций** `user-data-disposition.ts` (DELETED / ANONYMIZED / RETAINED / POLICY_PENDING на каждую связь `UserProfile`) + DMMF-guard, который валит CI на неклассифицированной связи (инв. #35). `POLICY_PENDING`-строки — готовый input для юриста (RKN-FIX-03-B). **DELETION-02:** (а) медиа теперь удаляется и **из хранилища** — снимок ключей делается до транзакции, после коммита ставится задача очереди `media.purge`, воркер удаляет объект и только затем строку (порядок важен: строка — последний указатель на объект); покрываются `AVATAR` (USER) и `AVATAR`/`PORTFOLIO` кабинета, остальные виды едут за своими POLICY_PENDING-связями; (б) появилась **вторая карта диспозиций — `provider-data-disposition.ts`** со своим DMMF-guard'ом: удаление кабинета **анонимизирует** строку `Provider`, поэтому объявленные `onDelete: Cascade` не срабатывают НИКОГДА, и связи надо чистить явно (так нашлись `hotSlotSubscription`, `userFavorite` и — уже самим guard'ом — `discountRule`).
- **Правовые документы и cookie** (`lib/legal/*`, `features/legal/content/*`): `/terms` · `/privacy` · `/consent`, версии — из `documents.ts`, страницы рендерят «Версия N · Последнее обновление» оттуда же. Cookie-баннер — **информационное уведомление**, не согласие (аналитики в проекте нет, гейтить нечего): `lib/legal/cookie-notice.ts` владеет механикой (first-party cookie `mr_cookie_notice`, версионированное значение, category-API где `necessary` всегда true), SSR подавляет баннер подтвердившему посетителю. Первый сторонний скрипт обязан пройти через этот гейт — триггер в BACKLOG.
- **Аналитика** (`api/analytics/*`): dashboard/revenue/clients/cohorts/bookings; единый tenant-scope `buildScopeWhere` (§10); plan-gated фичами.
- **Model Offers / Советник (Advisor, AI)** — офферы моделям; AI-рекомендации мастеру (YandexGPT, кэш Redis).
- **Provider socials** (`providers/social-links.ts`): free-text VK + Instagram community-links (НЕ OAuth) для обеих ролей; server нормализует + reconstruct'ит из hardcoded `https://<allowed-host>/` base (host-allowlist vk.com/instagram.com) → `INVALID_SOCIAL_LINK` на hostile input; рендер на публичных профилях master + studio.
- **Available-today pipeline** (`schedule/available-today.ts` + `recompute-available-today.ts` + worker): worker пересчитывает `Provider.availableToday` при старте + каждые 30 мин (+ precise per-mutation invalidation) → catalog filter `?availableToday=true` / card-chip / studio-badge. Trigger `/api/catalog/available-today/run` (`AVAILABILITY_CRON_TOKEN`).

---

## 6. МАРШРУТЫ И API

Полный список страниц и эндпоинтов выводится из `ls src/app/` (группы `(public)` / `(cabinet)` / `(admin)` + `api/**/route.ts`). Ниже — только то, что из дерева не читается.

### Кабинеты — устройство
- **Master** (`/cabinet/master/*`, роль MASTER) — sidebar shell + per-page `MasterPageHeader` + full-width. Schedule settings — 5 табов, auto-save.
- **Studio** (`/cabinet/studio/*`, STUDIO/STUDIO_ADMIN) — Settings это **7 разделов через `?section=`**, не отдельные routes.
- **User/Client** — `/cabinet` это редирект по роли; страницы клиента лежат в route-группе `(user)`.
- **Admin** (`/admin/*`) — все мутирующие действия audit-logged (инв. #18/#19).

### Правовые страницы
`/terms` · `/privacy` · `/consent` — три **отдельных** документа. `/consent` (RKN-FIX-01) — согласие на обработку ПДн, намеренно НЕ политика конфиденциальности (§4). Все три версионируются из `lib/legal/documents.ts` и на 2026-08-03 несут плашку «Черновик» до юрревью (§8).

### API — заметки, которых в дереве нет
- **Cron/секретные эндпоинты** (fail-closed по токену): `/api/billing/renew/run` · `/api/billing/mrr/snapshot/run` · `/api/catalog/available-today/run` · `/api/health/worker`.
- **`/api/payments/yookassa/webhook`** — тело untrusted; authenticity держит worker API re-fetch (инв. #5), не подпись.
- **Публичные пакеты:** `/api/public/packages/[id]/{propose,book}` + `…/studio/{propose,book}` — `propose` advisory, брони материализуются только на `/book`.
- **Reschedule** — `/api/bookings/[id]/{confirm,decline-reschedule}`, общий backend для solo-мастера и studio-admin (инв. #32).
- **Четыре гостевых booking-эндпоинта требуют `consent`** (§5, RKN-FIX-02) — 400 `CONSENT_REQUIRED` без него. Клиенты вне веба (мобильные) должны его слать: `MOBILE-API` в BACKLOG.
- **`POST /api/auth/otp/{request,verify}`** — 503 `SYSTEM_FEATURE_DISABLED` при `PHONE_AUTH_ENABLED` off (§5/§7), до генерации кода.
- **`GET`/`PATCH /api/me/consents/marketing`** (RKN-FIX-18) — единственная поверхность **отзыва** согласия. Только цель `MARKETING`; `enabled:false` = отзыв (строка остаётся, ставится `revokedAt`), `enabled:true` = **новая** строка. Отзыв ПДн/оферты здесь невозможен — 400 `CONSENT_NOT_SELF_REVOCABLE` (§5).
- **Auth-провайдеры гейтятся и на `start`, и на `callback`** (AUTH-KILLSWITCH-ENFORCE-01, §10) — `unlink`/`status` намеренно нет.

> Волна RKN добавила один роут (`/consent`); RKN-FIX-18 добавил `/api/me/consents/marketing`. Остальные её изменения — модификации существующих (сверено `git diff --name-status` по девяти коммитам).

---

## 7. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

> Все env-вары идут через **`src/lib/env.ts`** (Zod). Правило 11 теперь **проверяется гейтом** `check:env-discipline` (SEC-14) — до этого оно держалось только на дисциплине ревьюера, и четыре нарушения прожили в `telegram/config.ts` незамеченными, потому что скобочная нотация `process.env[VAR]` невидима для грепа `process\.env\.`. Гейт ловит обе нотации, список исключений в нём — дословный перенос из CLAUDE.md rule 11 точными путями. `process.env.*` напрямую запрещён в `src/` (исключения: `env.ts`, Prisma-config, тесты, `startup.ts`, `proxy.ts`) — CLAUDE.md rule 11. Computed-флаги (`isPushEnabled`, `isPaymentsEnabled`, `isTelegramEnabled`, `isYandexAuthEnabled`, `isVkAuthEnabled`, `isSmsConfigured`, `isProduction` и пр.) — из того же модуля.

Полный список переменных (их **78** на 2026-08-03) с типами и дефолтами — **`src/lib/env.ts`** (Zod-схема) + templates `.env.example` / `.env.production.example`. **Ниже — НЕ инвентарь, а только семантика, которой в схеме нет.** Обычные креды (`S3_*`, `SMTP_*`, `VAPID_*`, `YANDEX_*_API_KEY`, `*_REDIRECT_URI` и пр.) сюда намеренно не попадают — их назначение читается из имени и Zod-описания.

**Обязательные (иначе Error на старте):** `AUTH_JWT_SECRET`, `OTP_HMAC_SECRET`, `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY`, `DATABASE_URL`.

**Флаги с нетривиальным поведением:**
- **`PHONE_AUTH_ENABLED` (AUTH-GATE-01) — tri-state и 🔴 SERVER-ONLY.** unset → `!isProduction` (в dev ON, **в проде OFF**); `"true"` → ON; всё остальное → OFF. Намеренно отсутствует в `clientEnv`: в клиентском бандле выражение выродится в `!isProduction` и разойдётся с сервером → hydration mismatch. Никогда не импортировать из `"use client"` — клиент получает результат `resolveAuthMethods()` пропом. **Порядок флипа в проде ПРИНУДИТЕЛЬНЫЙ (QA-003):** `PHONE_AUTH_ENABLED=true` в production при ненастроенном SMS-провайдере → **отказ на старте** (env-refine). Причина не в UX: без провайдера подставляется mock, который логирует тело сообщения **вместе с plaintext-OTP**, а выбирается он по конфигу (`!isSmsConfigured`), а не по окружению — то есть до сих пор от утечки защищал только дефолт самого tri-state. Override-флага нет: сначала `SMS_PROVIDER_ENABLED` + логин/пароль, потом флаг.
- **`EMAIL_AUTH_ENABLED` — килсвитч email-входа, ЗЕРКАЛЬНЫЙ телефонному, но с обратным дефолтом (FIX-SEC-EMAIL-IDENTITY-01, 2026-08-04).** unset/пусто → **ON**; `"false"` → OFF; всё остальное → ON. Дефолт **ON** намеренно: email — единственный рабочий канал входа закрытого деплоя (phone off tri-state'ом), и забытая переменная не должна гасить вход всем. Резолвер — `isEmailAuthEnabled` (`env.ts`), гейт стоит в **обоих** роутах (`request` и `verify`) до генерации/записи/логирования кода → 503 `SYSTEM_FEATURE_DISABLED`. Второй, независимый гейт — `isEmailConfigured` (SMTP): «можем ли физически отправить», тогда как этот — «разрешён ли канал». ⚠️ **До 2026-08-04 эта строка лгала:** переменная была объявлена в `env.ts` и **не имела ни одного потребителя** — килсвитча email-входа не существовало (SEC-02).
- **`TELEGRAM_WEBHOOK_SECRET` (SEC-14) — теперь в Zod-схеме.** Раньше её (и ещё три telegram-переменных) читал `telegram/config.ts` **скобочной нотацией** `process.env[VAR]`, то есть мимо валидации и мимо ручного грепа, которым правило 11 и держалось. Цена конкретна: опечатка в имени даёт `null`, а вебхук трактует `null` как «секрет не настроен» и пропускает ВЕСЬ блок проверки подлинности. Сегодня не эксплуатируется только из-за kill-switch FZ-199 выше по коду.
- `NEXT_PUBLIC_TELEGRAM_ENABLED` — **legal kill-switch (152-ФЗ / FZ-199)**, unset → `false`, hard-ceiling над admin-toggle. НЕ влияет на `MONITORING_TELEGRAM_*` (ops-алерты — отдельная система).
- `SMS_PROVIDER_ENABLED` — default OFF → mock, OTP пишется в логи. В prod: включить + пополнить баланс SMSC.
- `VISUAL_SEARCH_ENABLED` — dormant, default false; требует `YANDEX_API_KEY` + `YANDEX_FOLDER_ID`.
- `REDIS_URL` — без него memory-fallback (в dev). Sensitive-роуты при этом fail-closed (инв. #6).
- **`YOOKASSA_WEBHOOK_TOKEN` — обязателен в production, когда включены платежи** (заданы `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY`): без него приложение **не стартует** (HARDENING-MISC-01; раньше молча деградировало до одного warn'а). Это URL `?token=`, **не подпись**: authenticity держит worker re-fetch (инв. #5), а требование существует, чтобы дешёвый pre-filter не выключался незаметно. Рефайн гейтится по `NODE_ENV=production` — в dev платёжные креды заданы, и безусловное требование сломало бы локальную разработку, ничего не улучшив.
- **`YOOKASSA_IP_ALLOWLIST_ENFORCED` — остаётся `false` в проде (ратифицировано PAY-SEC-01, 2026-07-31).** Это не «ещё не включили», а принятая позиция: подлинность вебхука якорится worker API re-fetch (инв. #5), а не source-IP; за ALB enforce хрупок и зависит от proxy-chain. Возврат к нему как defense-in-depth — после launch (`PAY-SEC-01-REVISIT` в BACKLOG).
- `TRUSTED_PROXY_HOPS` / `TRUSTED_REAL_IP_HEADER` — client-IP берётся из XFF **справа** (default hops=1); выставить под prod-edge (влияет на rate-limit, не на вебхук).
- `GLITCHTIP_DSN` (сервер) / `NEXT_PUBLIC_GLITCHTIP_DSN` (браузер) — **два независимых гейта**: без DSN SDK не инициализируется и в браузере даже не догружается (динамический импорт за build-time флагом, чтобы ~90KB не ехали каждому посетителю). `GLITCHTIP_SAMPLE_RATE`, `NEXT_PUBLIC_GLITCHTIP_{ENVIRONMENT,RELEASE}` — опциональны. Tracing и session-replay намеренно выключены.
- `STORAGE_PROVIDER` + `MEDIA_LOCAL_ROOT` / `MEDIA_LOCAL_PUBLIC_URL` — переключение S3 ↔ локальный диск для медиа; `MEDIA_DELIVERY_SECRET` подписывает delivery-токены.
- `AI_FEATURES_ENABLED` — общий выключатель AI-поверхностей (§11) поверх наличия `YANDEX_API_KEY`.
- `NEXT_PUBLIC_LEGAL_INN` — ИНН в футере; без него блок реквизитов деградирует. **В проде до сих пор не задан** (§8).
- `BILLING_RENEW_SECRET` / `MRR_SNAPSHOT_SECRET` / `AVAILABILITY_CRON_TOKEN` / `WORKER_SECRET` — fail-closed cron/health эндпоинты.
- `VK_CLIENT_ID` имеет alias `VK_ID_CLIENT_ID` — оба имени читаются в `env.ts`, и гейт, и резолвер берут **один** резолв (`vkClientId`), рассинхрон невозможен.
- Дефолты: tz `Europe/Moscow`, cookie `bh_session`.

> **Удалён:** `AI_PROVIDER` (был vestigial; `ai/client.ts` — Yandex-only).

---

## 8. ТЕКУЩЕЕ СОСТОЯНИЕ: открытые риски и pre-launch

> Живой список задач — [`BACKLOG.md`](BACKLOG.md). Операционное/деплойное — [`DEPLOY-BACKLOG.md`](DEPLOY-BACKLOG.md). Закрытое — `BACKLOG-DONE.md`. Ниже — что важно знать агенту как «ещё не закрыто / осознанно отложено».

### 🚦 Запуск в две стадии (стратегический факт, BACKLOG-TRIAGE-01 2026-08-03)

Проект запускается **не одним событием, а двумя**, и от этого зависит приоритет любой задачи:

1. **Закрытый деплой** — прод-окружение поднято и работает, публичного доступа нет. Гейтится **только операционным**: площадка + юрисдикция Postgres + pgvector, env (в т.ч. `YOOKASSA_WEBHOOK_TOKEN` **до** первого старта — иначе отказ на старте by design), снимок БД, `migrate deploy`, cron + воркер. **Открытых code-блокеров нет.**
2. **Публичное открытие** — по явному сигналу владельца. Гейтится **юридическим пакетом**: тексты `/privacy` `/terms` `/consent` (сейчас с плашкой «Черновик»), уведомление РКН, вердикты по Web Push / ОРИ / несовершеннолетним, сроки retention. Из него вытекают код-задачи RKN-FIX-03-B / -04 / -05 — они ждут ответов юриста, а не разработки.

**Практический вывод для агента:** «до launch» — неоднозначная формулировка, всегда уточнять, какая стадия. Юрпакет **не** блокирует закрытый деплой. Deploy/ops-пункты в `BACKLOG.md` не заводятся (CLAUDE.md rule 15) — им место в `DEPLOY-BACKLOG.md`.

### 🇷🇺 География: только РФ (стратегический факт, RF-ONLY-SCOPE-01 2026-08-04)

Решение владельца: продукт ориентирован **только на Россию**. Казахстан и любая другая международная экспансия — вне скоупа; упоминания других регионов как целевых вычищены из продуктовой копии, кода и планирования этим свипом. **Агент не предлагает KZ/международные сценарии** — ни в бэклоге, ни в дизайне, ни в юрвопросах.

Знание не уничтожено, а законсервировано: «выход за пределы РФ (любая страна)» живёт **спящим триггером** в `BACKLOG.md` (§ ⏳ Спящие триггеры). Просыпаются вместе: уведомление РКН о трансграничной передаче **до** её начала (152-ФЗ ст. 12), пересмотр локализации/юрисдикций в юрдокументах, гео-вопросы (+7-префиксы, валюта, гео-фильтр геокодера).

**Что свип НЕ менял (осознанно, флаги владельцу — см. отчёт RF-ONLY-SCOPE-01):** валидация телефона `^\+7\d{10}$` (пространство `+7` общее у РФ и KZ — отказ казахстанским префиксам стоит ложных отказов, это отдельное продуктовое решение); auto-grow геокодера без country-фильтра (`detect-city.ts` — «любая locality, которую знает Яндекс»); CIS-зоны в `timezone-options.ts` / `TZ_CITY_RU` (удаление деградирует метку существующего провайдера до offset-only). Валюта — **RUB-only, подтверждено грепом** (ноль KZT/тенге во всём дереве). Датированные артефакты (`RKN-COMPLIANCE-REPORT.md`, `QA-FINDINGS*.md`, `EXPLORATORY-FINDINGS.md`, `BACKLOG-DONE.md`, миграции) — **не ретушируются**: это фотографии на дату.

**Pre-launch / deploy-чеклист (operational):**
- **SMS-шлюз** — код готов (`src/lib/sms/`, fail-soft 503), нужно в prod-env: `SMS_PROVIDER_ENABLED=true` + login/password, пополнить SMSC-баланс, smoke-test RU-операторы + IP-whitelist.
- **Применить миграции на проде** через `prisma migrate deploy` — держать порядок; после — regen seed-snapshot. **Среди них есть деструктивные** (`vector(256)` и `20260803094523_rkn_fix_12_drop_oauth_tokens` — `DROP COLUMN`), поэтому снимок БД перед прогоном обязателен: точка невозврата. Актуальный список и порядок — в BACKLOG (PRE-DEPLOY-CHECKLIST).
- **VAPID prod-ключи** для push; **backfill-trial-conversion** (`scripts/backfill-trial-conversion.ts --apply` на staging/prod до launch); **cleanup-duplicate-billing-plans** (если в prod есть дубликаты low-case планов).
- **Telegram** — держать `NEXT_PUBLIC_TELEGRAM_ENABLED` unset/false до юр-ревью privacy/terms.
- **`PHONE_AUTH_ENABLED`** — в проде по умолчанию OFF; включать **после** SMS-провайдера (§7).
- **`NEXT_PUBLIC_LEGAL_INN`** в проде не задан — футер деградирует без реквизитов.
- **Юридический пакет (блокирует launch, не код):** `/terms`, `/privacy`, `/consent` опубликованы с плашкой «Черновик» — нужно юрревью и снятие плашки (RKN-FIX-05); уведомление РКН об обработке ПДн (ст. 22); вердикт по трансграничности Web Push; retention-политика (RKN-FIX-04). Подробности — `RKN-COMPLIANCE-REPORT.md` + BACKLOG.
- **Инфра-решения (DevOps, не Claude):** Postgres hosting, TLS termination, DB backup target, deploy rollback policy. Блокируют runbooks DR-2/3/6. *(Supabase не используется — в `.env` остались только неиспользуемые `SUPA*`-строки; целевая площадка деплоя — вопрос к владельцу, см. «Расхождения в доках».)*

**Открытые технические риски:**
- Rate-limit **fail-open в dev** при отсутствии Redis (в prod sensitive-роуты fail-closed — приемлемо).
- Воркер — отдельный процесс; авто-рестарт зависит от docker/supervisor конфигурации деплоя.
- Нет явного глобального auth-middleware — каждый route проверяет сам (`proxy.ts` делает CORS/CSP/rate-limit-tier).
- JWT реализован вручную (HS256, `timingSafeEqual`); нет kid / ротации нескольких секретов.
- **Error-tracking есть** (GlitchTip, `lib/observability/*` + `instrumentation{,-client}.ts`; §11). Чего нет: APM/tracing (намеренно — `tracesSampleRate` выключен), source-maps для читаемых prod-стеков (нужен DevOps-шаг).
- **Fingerprint'ы compliance-сбоев (HARDENING-MISC-01) — контракт с alert-rules.** Три ветки намеренно глотают ошибку записи ради доступности запроса, и каждая шлёт сгруппированное событие со **стабильным** именем: `compliance.consent-write-failed` · `compliance.pd-access-write-failed` · `compliance.media-purge-enqueue-failed`. Плюс уже существовавший `job.deadLetter` (тег `jobType`) покрывает провал самой задачи `media.purge` после ретраев. **Переименование fingerprint'а осиротит alert-rule в GlitchTip** — молчание будет выглядеть как «всё хорошо». Значения зафиксированы в `lib/observability/compliance.ts`, менять только вместе с правилами.
- **Deploy-порядок:** прод-инстанс с платежами и без `YOOKASSA_WEBHOOK_TOKEN` теперь **падает на старте** (§7). Это и есть цель, но провизионить токен надо **до** деплоя.
- **Известных красных гейтов нет** (GATES-FIX-01, 2026-08-03): `npm run check` проходит целиком на чистом дереве. До этого два гейта краснели на HEAD — `check:schema-drift` (с 13 июля) и `check:openapi-routes`, — то есть «✅»-таблицы в отчётах несли два молчаливых ❌. Устройство фикса и почему это важно — §9.

**Технический долг (компактно):** legacy `createClientBooking` slotLabel-путь; deprecated `Booking.startAt/endAt`; `VkLink.deviceId` (единственный потребитель удалён в RKN-FIX-12 — мёртвые данные); дублирующие rating-поля Provider (`rating`/`ratingAvg`, `reviews`/`ratingCount`); ~22 `eslint-disable`; OpenAPI/smoke не в CI; `slotPrecision` полный per-viewer-tz рендеринг (частично); `lateCancelAction="fine"` без enforcement (нет платёжных штрафов).

**Расхождения в доках (решает владелец, не doc-sync):**
- **Ветка.** Волна RKN влита в **`main`**. `CLAUDE.md` и `docs/QUALITY-GATES.md` про ветки вообще не говорят (проверено — 0 упоминаний), так что дисциплину они не навязывают. `predeploy` остаётся в футерах двух **скиллов** (`playwright-qa`, `timezone-correctness`: «ссылки verified против кода ветки `predeploy`») — это живые справочники, и там строка вводит в заблуждение. В датированных аудитах (`QA-FINDINGS-*`, `RKN-COMPLIANCE-REPORT`, `WALKTHROUGH-AUDIT`, `VISUAL-SEARCH-AUDIT`) `predeploy` **корректен** — это фотография на дату, её не трогаем.
- **Площадка деплоя.** Реестр образов в `.github/workflows/deploy.yml` — **`cr.yandex`** (Yandex Container Registry), деплой оттуда по SSH; §11 это и описывает. Но `RKN-COMPLIANCE-REPORT.md` (§ локализация) называет прод-VM **cloud.ru**. Регистри и хостинг VM — разные вещи, так что формального противоречия может и не быть, но для ответа РКН про 152-ФЗ ст. 18 ч. 5 нужно **одно** подтверждённое утверждение о том, где физически стоит Postgres. Вопрос к владельцу/DevOps.

---

## 9. ТЕСТИРОВАНИЕ

- Framework: **Vitest** (v4), env node, alias `@/` через vite-tsconfig-paths. Запуск в CI (`quality-gates.yml`).
- **158 test-файлов / 1478 тестов** (2026-08-03; 157 в `src/` + `scripts/check-include-where.test.ts`). Плотность в `src/lib/`: booking, schedule, billing (pure helpers), sms, chat/media, cities, **legal/deletion**.
- **Покрыто:** booking state-machine (`flow.test.ts`) + policy/reschedule enforcement + action-state; billing pure helpers (features/marketing/trial/utils/guards/mrr); schedule pure logic (slots/overlap/dateKey/booking-days/studio-slot-aggregation); auth pure (jwt/otp); sms + masking; package-math; **правовой слой** — consent-flags/OAuth-cookie/recorder + route-level отказ без согласия на каждом пути, guest anti-forgery, cookie-notice (формат/версия/миграция); **инварианты regression** — #25 CRM privacy (`client-privacy.test.ts`), #26 chat ACL (`chat-attachment-acl/token.test.ts`), **#35 disposition-map DMMF-guard** (`user-data-disposition.test.ts`), **no-token-columns** (`provider-tokens-at-rest.test.ts`).
- **Гейты (`npm run check`) — 15 шагов, все зелёные на чистом дереве.** Два узла, про которые надо знать:
  - **Сырые SQL-объекты.** Prisma умеет не всё: pgvector-индекс `hnsw` не выражается в датамодели (`type: Hnsw` → `P1012` на 6.19.2), а колонка объявлена `Unsupported("vector(256)")`. Такие объекты перечислены в `scripts/raw-sql-objects.mjs` — **точными именами**. `check:schema-drift` берёт дифф в форме SQL и вычитает их (иначе он красный всегда и его перестают читать); `check:migration-drops` **отдельно** валит CI, если `DROP` такого объекта уехал в файл миграции без явного `-- ALLOW-DROP: <имя> — причина`. Второй гейт важнее первого: `prisma migrate dev` дописывает `DROP INDEX` в **каждую** новую миграцию, и дважды его снимали руками при ревью. Добавляете объект, который Prisma не выражает, — впишите его в реестр.
  - **OpenAPI-спека** (`src/lib/openapi/spec.ts`) — не автогенерация: роут либо описан там, либо waived в `scripts/openapi-route-allowlist.txt` с причиной. Гейт считает и то, и другое.
- **Прод-билд как отдельная среда проверки (QA-003, 2026-08-03).** Собранный артефакт впервые прогнан вживую и получил базовый смоук (см. `DEPLOY-BACKLOG.md` §3.1). Две особенности, которые стоят времени, если делать это снова: запуск только через `node .next/standalone/server.js` (при `output: standalone` `next start` не работает, и рядом нужны `.next/static` + `public/`), и **service worker живой в прод-билде** — для повторяемых прогонов контекст создавать с `serviceWorkers: "block"`, иначе precache отравляет итерации. Отдельно: dev и prod отдают **разные каналы входа** (dev — phone по умолчанию, prod — email, потому что phone off tri-state'ом), поэтому QA-сценарии должны брать канал из страницы, а не хардкодить.
- **Live-QA харнесс (`.qa/`).** `smoke.spec.ts` — единственное место, которое логинится вхолодную (все роли, каждый прогон) и сохраняет `storageState` в `.qa/auth/<role>.json`; остальные спеки берут состояние через `.qa/session.ts` (`contextForRole`) и OTP не тратят. Холодный логин в smoke оставлен намеренно: переиспользование состояния везде замаскировало бы регрессию самого логина. Логин-шаг устойчив к гонке гидратации `/login` (QA-003) тем, что «идентичность → согласия → отправка → OTP-шаг» — **одна** retry-единица; частичный успех не засчитывается.
- **Оба OTP-канала — первого класса (QA-HARNESS-EMAIL-01).** `recoverOtp` принимает phone ИЛИ email; идентичность нормализуется как в продукте (email — `.trim().toLowerCase()`, плюс фильтр `channel = 'EMAIL'`, потому что строки с тем же email пишет ещё и кабинетная верификация почты). `loginAs` берёт канал **со страницы** (`channel: "auto"|"phone"|"email"`) — dev открывается на телефоне, prod на email (`PHONE_AUTH_ENABLED` off), и захардкоженный канал ломал бы спеку по причине, к её предмету не относящейся. **Ключи рейт-лимита у каналов РАЗНЫЕ:** verify-тир email лежит под `otp:verify:email:{lock,fail}:`, а request/IP-ключ (5/60 с) — **общий на оба канала**, поэтому смешанный прогон упирается в 429 быстрее ожидаемого. **Dev-стек включает синк почты** (mailpit, `docker-compose.dev.yml`, SMTP `localhost:1025`, UI `:8025`): роут пишет `OtpCode` до отправки, но `await sendEmail` держит **ответ**, а UI переключает шаг только по нему — без синка каждый холодный email-логин стоил ~21 с. Харнесс письма **не читает** — код по-прежнему восстанавливается из `codeHash` в Postgres, то есть не зависит ни от логов, ни от почтового ящика.
- **Паттерн «guard, доказанный не-вакуумным»:** для структурных инвариантов (#35, no-token-columns) тест не только проверяет текущее состояние, но и был прогнан с намеренно сломанным входом, чтобы убедиться, что он падает. Новые guard-тесты писать так же.
- **НЕ покрыто (нужна integration-инфра):** createBooking/cancelBooking integration, rate-limit/session/role-guards (Prisma/Redis-bound), OAuth flows, аналитика/платежи end-to-end. Нет coverage-tooling (c8), нет E2E (Playwright/Cypress) — ожидаемо для MVP. Live-QA — через Playwright MCP + `.qa/` harness (см. `playwright-qa` skill).

---

## 10. БЕЗОПАСНОСТЬ

- **Rate limiting** (`rate-limit/index.ts`): Redis + memory-fallback; **чувствительные роуты (auth/bookings/payments/delete/studio/reviews) fail-closed** при недоступности Redis (инв. #6); OTP-лимит по phone+IP; Telegram-алерт при 3+ Redis-ошибках/мин.
- **Расход хранилища ограничен сверху на аккаунт** (SEC-17): штучные лимиты были только у портфолио (план) и аватара (замена по месту). Фото клиентской карточки ограничены тремя **на карточку**, а карточка заводится из `clientKey`, который присылает сам вызывающий (`ensureClientCard` создаёт её для любой невиданной идентичности) — то есть лимит обходится добавлением карточек, и байтового учёта не было нигде. Теперь `enforceUserStorageQuota` в единственном чокпоинте `uploadMediaAsset` сверяет `SUM(sizeBytes)` живых ассетов аккаунта плюс входящий файл с `MEDIA_USER_STORAGE_QUOTA_BYTES` (10 ГБ, `media/types.ts`) → 409 `MEDIA_STORAGE_QUOTA_EXCEEDED`. Якорь — `createdByUserId`, а не провайдер: злоупотребляет аккаунт, у него уже есть индекс, и он единственный общий знаменатель для всех поверхностей загрузки, тогда как `entityType`/`entityId` у них разные. Считаются только живые строки (`deletedAt: null`) — `deleteAssetById` удаляет объект из хранилища следом за пометкой, и держать удалённое в сумме значило бы наказывать за уборку. Проверка стоит **после** веток замены и вытеснения аватара: они освобождают байты, и на границе квоты замена файла обязана проходить. Квота по тарифам — продуктовое решение, в BACKLOG (`MEDIA-STORAGE-QUOTA-BY-PLAN`).
- **Размер тела запроса ограничен сверху, и лимит стоит до разбора** (SEC-16): тело разбиралось без каких-либо границ — `req.json()` буферизует сколько прислали, Zod ограничивает поля только ПОСЛЕ разбора, `next.config.ts` лимита не задаёт (`serverActions.bodySizeLimit` к Route Handlers не применяется). На `/api/support/partnership` было хуже: рейт-лимит стоял **после** `req.json()`, то есть 429 выдавался уже после того, как произвольно большой JSON прочитан и разобран, — ограничитель не ограничивал самую дорогую часть запроса. Планка — `MAX_JSON_BODY_BYTES` = 1 МБ (`lib/http/body-limit.ts`), заведомо выше любого продуктового тела: самый крупный JSON — снапшот расписания (десятки КБ), base64 в JSON-телах нет вообще. Два слоя, как у CSRF: **заявленный** размер (`exceedsDeclaredBodyLimit`, `Content-Length`) отсекается в `src/proxy.ts` до входа в обработчик и до обновления сессии; **фактические** байты считает `readBodyTextCapped` на потоке — без него слой 1 остаётся вежливой просьбой, потому что `Content-Length` можно не прислать (chunked) или занизить. **multipart из проверки исключён намеренно** — загрузки легитимно крупнее (10 МБ), у них своя проверка в роутах; всё остальное, включая `text/plain`, считается по общей планке, потому что `req.json()` на content-type не смотрит. Потребители — `parseBody` (72 файла) + два роута с собственной формой ответа (`log-error`, `partnership`).
- **Лента горячих слотов за кэшем и своим тиром** (SEC-15): `GET /api/hot-slots` прогонял вложенный цикл «провайдеры × услуги × до 14 дней», материализовывал весь набор, сортировал в памяти и отдавал срез — а пагинация по курсору пересчитывала ВСЁ заново. Ни auth, ни своего лимита, ни кэша: дешёвый анонимный запрос покупал дорогую работу, растущую линейно с числом провайдеров. Теперь расчёт вынесен в `buildHotSlotFeed` и кэшируется на 120 с (как у `booking-days`), тир `hotSlotsFeed` 30/60с. **Ключ кэша строится только из параметров, влияющих на результат** (`from`/`to` округлены до сетки TTL + `category`): `tag` и `geo` схема принимает, но обработчик не использует, и попадание их в ключ дало бы бесплатный обход кэша через `?tag=<random>` — то есть фикс отменил бы сам себя.
- **Отзыв сессии действует немедленно, а не через 2 часа** (SEC-13): access-токен не нёс идентификатора сессии, а проверка сводилась к `userProfile.findFirst({ id, isDeleted: false })` — поэтому «завершить остальные сессии» и logout гасили только строки `RefreshSession`, а украденный access-токен работал до конца своего TTL. Теперь access-токен несёт `fid` — **семью** сессий (`RefreshSession.familyId`, миграция `20260805091533`), и `loadActiveSessionUser` требует живую строку этой семьи в том же единственном запросе (индекс `[userId, familyId, revokedAt]`). Привязка именно к семье, а не к `RefreshSession.id`: ротация помечает старую строку `revokedAt` и создаёт новую, поэтому привязка к строке обнуляла бы живой токен при каждом обновлении сессии; семья наследуется по цепочке ротации и умирает только от явного отзыва. Токены без `fid` (до миграции) проходят как legacy — иначе деплой разлогинил бы всех разом. **`getSessionUserId` тоже ходит в БД**: он возвращал `sub` прямо из токена, мимо и проверки семьи, и проверки удаления аккаунта (нашёл живой смоук — `/api/me` отдавал профиль только что отозванному устройству).
- **Курсоры пагинации и id категорий — непрозрачные** (SEC-12): `encodeCursor`/`decodeCursor` жили приватными функциями внутри `catalog.service.ts`, поэтому соседние списки отдавали курсором **сырой CUID** — `providers/queries.ts` и `/api/hot-slots` (там курсором служила склейка из двух CUID). Задокументированное исключение rule 12 для `/api/providers/[id]` на курсор **не распространяется** — это был отдельный недосмотр. Курсорные хелперы вынесены в `lib/pagination/cursor.ts` и переиспользуются всеми тремя. Отдельно: из автокомплита убран `id` провайдера (потребителя не было — переход идёт по `publicUsername`), а `id` категорий в автокомплите и `/api/catalog/global-categories` кодируется через `encodePublicId` и декодируется единственной точкой `resolveGlobalCategoryIds`; старые ссылки с сырым CUID продолжают работать (`decodePublicId` backward-compatible). Booking-флоу не тронут — он в исключениях rule 12 дословно.
- **Публичный `booking-config` гейтится публикацией** (SEC-11): `getPublicServiceBookingConfig` звал `service.findUnique` без единого условия — то есть любой CUID услуги отдавал анониму авторские тексты вопросов к записи, включая услуги черновых и приостановленных кабинетов (мастерский близнец на том же загрузчике вызывающего авторизует). Теперь публичная ветка требует `provider.isPublished` + `service.isActive`, а отказ отдаёт тот же 404 `SERVICE_NOT_FOUND`, что и несуществующая услуга — отдельный код разгласил бы факт существования скрытой услуги.
- **`?mt=`-ветка отдачи медиа: токен + сессия + ACL** (SEC-10): ветка отдавала приватный актив по одному лишь signed-токену, без `getSessionUser` и без `ensureCanReadMedia`, — то есть утёкшая ссылка (referrer, скриншот, лог прокси) открывала файл кому угодно на срок жизни токена (до 15 мин). Сам токен сделан корректно (HMAC-SHA256 + `timingSafeEqual`, привязка к активу, `exp`, purpose с обеих сторон) — проблема была в модели доверия: **токен отвечает «какой актив», сессия и ACL — «кому можно»**, ровно как в соседнем чат-роуте, который на том же механизме токенов сессию требовал. Теперь модель одна. Флоу не задет: `?mt=`-ссылки выдаются только кабинету мастера на фото откликов модели, а ACL `MODEL_APPLICATION` пускает и заявителя, и владельца оффера.
- **`POST /api/auth/profile/ensure` удалён** (SEC-09): роут делал `userProfile.upsert` по `sub` из access-токена и писал `phone` оттуда же, **не фильтруя `isDeleted`** — то есть удаление аккаунта переставало быть окончательным (токен живёт 2 ч и серверной отзывной проверки не имеет: удалился → в течение двух часов дёрнул роут → телефон снова в базе, 152-ФЗ). Вторая дыра — `create`-ветка заводила `UserProfile` в обход единственного writer'а согласий, то есть в обход инв. #37. Роут был мёртв (ноль вызывающих в `src/`/`.qa/`/`scripts/`, только запись-исключение в openapi-allowlist), поэтому удалён целиком вместе с этой записью; возврат сторожит тест.
- **CSRF — второй слой поверх `SameSite=Lax`** (SEC-08): `shouldRejectCrossSiteMutation` (`src/proxy.ts`) отклоняет мутирующие запросы к `/api/*` с 403 по `Sec-Fetch-Site`, а при его отсутствии — по `Origin`. Ключевой кейс — **`same-site`, а не `cross-site`**: `SameSite=Lax` не различает поддомены, поэтому любой поддомен `мастеррядом.online` (staging, маркетинговый, скомпрометированный) мог делать аутентифицированные мутации, а второго слоя не было вообще. **Запрос без обоих заголовков пропускается намеренно** — так выглядит вебхук ЮКассы, cron-эндпоинты и будущий мобильный клиент; браузер при межсайтовой мутации обязан прислать хотя бы один. Проверка стоит ДО обновления сессии, чтобы чужой запрос не провоцировал ротацию refresh-токена. Третий слой (требование `Content-Type: application/json` в `parseBody`) отложен — `CSRF-CONTENT-TYPE-LAYER` в BACKLOG.
- **Загруженный файл валидируется по магическим байтам, а не по `File.type`** (SEC-06): `readValidatedImageUpload` (`lib/media/validate-image-upload.ts`) — общий примитив: размер → `fileTypeFromBuffer` → allowlist → `sharp` re-encode → размер после переупаковки. Оба роута фото клиентской карточки (master + studio) клали в хранилище СЫРЫЕ байты с `mimeType: fileValue.type`, то есть строкой от клиента, а `validateUploadBasics` сверяет с allowlist'ом только её — произвольный файл (HTML, SVG, ZIP) сохранялся под заявленным `image/png`, и от исполнения в origin защищал ровно один заголовок `nosniff`. Re-encode важен отдельно от sniff'а: полиглот «валидный PNG + дописанный в хвост скрипт» проходит распознавание, но не переживает переупаковку. `quality` — параметр (95 на мастерских поверхностях, 90 на вложениях), потому что это видимое пользователю качество. Три исторические инлайн-копии того же блока остаются в `api/media`, `chat/upload-attachment`, `bookings/upload-reference` — дедуп заведён как `MEDIA-UPLOAD-DEDUP` в BACKLOG.
- **`GET /api/masters/[id]/availability` — публикация обязательна для чужих** (SEC-05): роут ходил в `provider.findUnique` без `isPublished`, хотя оба соседних публичных эндпоинта (`/slots`, `/booking-days`) передают `requirePublished: true` — любой, кто знает CUID, читал живое расписание чернового кабинета. Гейт нельзя было поставить «в лоб»: у роута ДВЕ аудитории — анонимный виджет записи в студию и кабинетное окно переноса брони, а мастер, снявший профиль с публикации, обязан продолжать переносить существующие брони. Поэтому публичный резолв идёт с `requirePublished`, а своя сторона (владелец кабинета + админ студии) проходит по общему `requireProviderOwner`, без собственной копии правила.
- **Платные внешние API за собственными тирами + кэшем** (SEC-04): `address/geocode` и `address/suggest` — анонимные прокси к платному Яндексу, и до фикса их защищал только общий `publicApi` (120/60с), а ходили они с `cache: "no-store"` — то есть повторный ввод того же адреса стоил денег заново. Теперь: кэш ответов на сутки (`lib/maps/address-cache.ts`, ключ — sha256 от нормализованного запроса: адрес это ПДн-содержащая строка, в имени ключа Redis ей не место; ненайденный адрес кэшируется тоже, поэтому значение обёрнуто в объект — `null` внутри это ответ, `null` из кэша это промах) + отдельные тиры `addressSuggest` 60/60с и `addressGeocode` 30/60с (размер взят от дебаунса ввода 220–300 мс). Сессию требовать нельзя — `suggest` дёргает публичный каталог у гостя. У vision-запроса визуального поиска появился `max_tokens` (был только таймаут 30 с — верхней границы цены ответа не существовало).
- **Ключ прокси-лимита — ШАБЛОН роута, не URL** (SEC-03): `rl:<tier>:<ip>:<method>:<template>`, где template даёт `toApiRouteTemplate` (`rate-limit/route-template.ts`). Раньше в ключ шёл сырой `pathname` со значениями динамических сегментов — то есть `/api/public/bookings/AAA` и `…/BBB` были разными ключами Redis, и перечисление по id не throttled вообще (счётчик на каждый id = 1). Схлопывание идёт **не по форме значения** («похоже на cuid»), а по составу дерева роутов: сегмент, которого нет среди литеральных сегментов `src/app/api/**`, — динамический по построению, поэтому ловятся и словоподобные `[slug]`/`[code]`/`[clientKey]`, неотличимые эвристикой. Список литералов приколочен к дереву guard-тестом (`route-template.test.ts`), забытая запись деградирует безопасно (общее ведро = лимит строже). Нормализация обязана сохранять `/api/...`-префикс: `isSensitiveRouteKey` достаёт путь обратно из ключа — пиннится тем же тестом.
- **RBAC** (`auth/guards.ts`, `access.ts`, `admin.ts`, `ownership.ts`): проверка ролей в каждом handler; ownership; cross-tenant — `ensureStudioRole({studioId,userId,allowed})` (client-supplies-id / server-authorizes).
- **Analytics tenant-scope** — единый `buildScopeWhere(context)` (`analytics/domain/helpers.ts`): MASTER → свои брони; STUDIO → conditional studioId/providerId (**никогда `{studioId: undefined}`** в OR).
- **Валидация** — весь input через Zod (`parseBody`); file-upload = MIME-allowlist + size + magic-byte sniff + Sharp re-encode.
- **YooKassa webhook** — authenticity через worker API re-fetch (инв. #5), не HMAC.
- **Client-IP** — единый `extractClientIp`/`getClientIp` (`http/ip.ts`), берёт IP из XFF **справа** (peel `TRUSTED_PROXY_HOPS`), никогда leftmost → закрывает spoof per-IP лимитов.
- **PII в логах** — phone/email через `maskPhone`/`maskEmail`; OTP/secrets в prod-логах никогда (guard `isProduction`). См. §13.
- **Telegram-login CSRF** (до re-enable): single-use signed `tg_login_state` cookie + nonce round-trip + `getTelegramEnabled()` gate.
- **Auth-provider enabled-flag route enforcement (AUTH-KILLSWITCH-ENFORCE-01)** — все mechanism-invoking auth-entry-points (VK/Yandex OAuth `start`+`callback`, VK integrations connect, Telegram connect `link`) отказывают server-side, когда provider disabled (`isVkAuthEnabled` / `isYandexAuthEnabled` / `getTelegramEnabled()`), **до** любого cred-read/OAuth/session — не только скрыты в UI. Callback гейтится вместе со start (session-issuing leg — иначе gate на start обходится). Removal (`unlink`) и read/pref (`status`/`settings`) намеренно НЕ гейтятся (не invoke механизма). FZ-199 kill-switch теперь route-level, не только UI.
- **Согласия — единственный writer + anti-forgery (RKN-FIX-01/-02).** Строки `UserConsent` пишет ТОЛЬКО `src/lib/legal/consent.ts` (`recordUserConsents` / `recordGuestConsents`) — с реальными версиями документов, IP/UA, идемпотентно. Два правила, которые нельзя ослаблять: (1) **enforcement до создания** — `assertRequiredConsents` отказывает **прежде** чем появится профиль/бронь, UI-гейтинга недостаточно; (2) **нельзя фабриковать доказательство за другого** — анонимный гость пишет согласие только на профиль, который никогда не был аккаунтом (`isGuestClassProfile`: нет `RefreshSession`, нет email/verified-email, нет Telegram/VK/Yandex-линка, роли ровно `[CLIENT]`); телефон зарегистрированного пользователя → 0 строк, бронь при этом проходит. Через OAuth флаги едут в подписанной **state-bound** cookie (HMAC + привязка к `state`, single-use) — не в query-параметре callback'а. **Отзыв (RKN-FIX-18)** — отдельный явный акт со своим UI, никогда побочный эффект формы: снятая на регистрации галочка маркетинга это НЕ отзыв (отсутствие согласия ≠ отказ). Отзыв **сохраняет историю**: строка получает `revokedAt` и остаётся, повторное согласие вставляет новую — оживление строк запрещено (раньше оно стирало доказательства). Гарантия «одна активная строка на цель+версию» — на уровне БД (partial unique, §4), поэтому две быстрые перекладки тумблера физически не могут оставить два активных согласия. Самостоятельно отзывается только `MARKETING`; ПДн/оферта маршрутизируются в удаление аккаунта.
- **След массовых чтений ПДн (RKN-FIX-10, инв. #35-соседний по духу).** Мутации аудируются, чтения — теперь тоже: `PdAccessLog` + единственный writer `lib/audit/pd-access.ts` (`recordPdAccess`). Инструментированы четыре bulk-поверхности: `admin.users.list` (телефоны+email **всех**, поиск + курсор — главный вектор), `master.clients.list`, `studio.clients.list` (обе — CRM-база арендатора), и через них же — счётчики объёма. **Публичный каталог и опубликованные профили НЕ инструментируются**: это данные, опубликованные самим провайдером, их чтения — шум, который утопил бы сигнал. Детальные чтения одного человека за неугадываемым id — не вектор перечисления, тоже вне. **Назначение — scoping, не детект**: таблица отвечает «что читал актор X в окне Y», порогов и алертов в ней нет (отдельный 🟡 в BACKLOG). Провал записи никогда не роняет запрос — но и не молчит (`logError`; наблюдаемость обоих writer'ов — `CONSENT-WRITE-OBSERVABILITY`).
- **Секреты at-rest** — см. отдельную строку ниже (перепись RKN-FIX-12).
- **Timezone validation** — write-time `.refine(isValidTimeZone)` на studio/master PATCH; read-time fallback `Europe/Moscow` (закрывает stored-DoS через пустую tz).
- **Идемпотентность** — bookings (`x-idempotency-key`+Redis lock), `BillingPayment.idempotenceKey` (@unique), YooKassa Idempotence-Key.
- **P2002 re-read-on-conflict** — параллельные create'ы на `@unique` полях восстанавливаются re-read'ом winner-строки, не падают: `detect-city` · `conversation-slug` · email-OTP login (`resolveEmailLoginProfile`, 6-й site — `UserProfile.email`) · phone-OTP login (`resolvePhoneLoginProfile`, 7-й site — `UserProfile.phone`; идемпотентно, mirror email — QA-PREP-01).
- **Security headers / CSP** (`next.config.ts` + `proxy.ts`): X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; prod — HSTS + CSP (nonce + strict-dynamic, без unsafe-inline/eval); JSON-LD экранирует `<` (`safeJsonLd`).
- **Секреты** — JWT/OTP HMAC-SHA256; refresh в БД (jti), cookie httpOnly+SameSite=lax+secure.
- **Секреты at-rest (RKN-FIX-12, перепись всех колонок)** — **OAuth-токенов провайдеров в БД нет вообще**: `VkLink`/`YandexLink` держат только identity, токен из code-exchange не персистится (минимизация вместо шифрования — колонки дропнуты, а не зашифрованы; guard `provider-tokens-at-rest.test.ts`). Остальное: `OtpCode.codeHash` HMAC (инв. #2) · `TelegramLinkToken.tokenHash` SHA-256 от 32 случайных байт, TTL 20 мин · `RefreshSession.jti` — идентификатор, не bearer · `PushSubscription.{p256dh,auth}` — сырые по необходимости web-push (p256dh публичный; `auth` нужен на каждое сообщение), импакт утечки — спуфинг push на устройство, не доступ к аккаунту.
- Остаточно: нет kid/ротации JWT-секрета; IP-allowlist webhook пока log-only.

---

## 11. ПРОИЗВОДИТЕЛЬНОСТЬ, AI-ПРОВАЙДЕР, ИНФРАСТРУКТУРА

**Кэширование:** Redis — rate-limit windows, schedule DayPlan, slots cache, session, idempotency locks, notifier pub/sub. Инвалидация слотов после любого save в Schedule Settings (`invalidateSlotsForMaster`; cache-version по `updatedAt` provider/override/template/weeklyConfig). Клиент — SWR. Service Worker — шрифты/картинки.

**Прочее:** пагинация cursor-based (feed, catalog); изображения через `next/image` (`storage.yandexcloud.net`) + Sharp; SSR публичных профилей + parallel `Promise.all`; очередь — polling-воркер (один процесс, нет горизонтального масштабирования). N+1 к контролю: `resolveStudioIdForUser` на каждый API-запрос, analytics-handlers.

**AI-провайдер (chat surfaces):** **Yandex Cloud Foundation Models** (single provider), endpoint `https://llm.api.cloud.yandex.net/v1` (OpenAI-compatible), модель YandexGPT 5 Lite для 4 surfaces (review-summary / review-reply / service-description / advisor). Chokepoint — `src/lib/ai/client.ts` (`aiChat()`, Yandex-only); auth через `YANDEX_API_KEY` + `YANDEX_FOLDER_ID`. Плюс — native RU-доступ, без VPN. **Visual-search** (dormant, `VISUAL_SEARCH_ENABLED=false`, 0 векторов) — **тоже на Yandex** (VISUAL-SEARCH-YANDEX-MIGRATION-01 2026-07-13): vision `qwen3.6-35b-a3b` через AI Studio OpenAI-compat endpoint (`https://ai.api.cloud.yandex.net/v1`, `project=<folder>`) + `text-search-doc`/`text-search-query` embeddings (native **256**, **без `dim`-параметра** — Yandex 400-ит на `dim`), doc/query split; chokepoint `src/lib/visual-search/provider.ts`, те же `YANDEX_API_KEY`+`YANDEX_FOLDER_ID`. OpenAI полностью удалён. История/verdict — `docs/AI-MIGRATION-STRATEGY.md` + `docs/VISUAL-SEARCH-AUDIT.md`.

**Инфраструктура (pending DevOps):** Postgres hosting (Yandex Managed vs self-hosted; **Supabase не используется**), TLS termination, DB backup target, deploy rollback policy — блокируют DR-runbooks. Local dev: `docker-compose.dev.yml` + `pgvector/pgvector:pg16`.

---

## 12. ИНВАРИАНТЫ — ЧТО НЕЛЬЗЯ ЛОМАТЬ

| # | Инвариант | Файл | Обоснование |
|---|----------|------|------------|
| 1 | **Booking.startAtUtc/endAtUtc — UTC** | `prisma/schema` booking | Все вычисления расписания и отображение основаны на UTC. Локальное время в этих полях хранить нельзя. |
| 2 | **OtpCode.codeHash — HMAC, не plaintext** | `src/lib/auth/otp.ts` | HMAC с секретом. Смена алгоритма инвалидирует все существующие коды. |
| 3 | **RefreshSession.jti — unique** | `prisma/schema` auth | Single-use refresh token (каждая сессия используется один раз). |
| 4 | **BillingPayment.idempotenceKey — unique** | `prisma/schema` billing | Предотвращает дублирование платежей. |
| 5 | **YooKassa webhook authenticity = worker API re-fetch** | `webhook/route.ts` + `webhook-processor.ts` | YooKassa **не подписывает** уведомления — тело untrusted hint. Worker re-fetch'ит объект из API и действует ТОЛЬКО по API-reported `status`/`amount`/`metadata`. **Нельзя** «чинить» обратно на HMAC. IP-allowlist пока log-only; `?token=` — optional URL secret. |
| 6 | **Чувствительные роуты — fail-closed** | `src/lib/rate-limit/index.ts` | При недоступности Redis `/api/auth`, `/api/bookings` и пр. → 429. Нельзя менять на fail-open. |
| 7 | **MasterService.@@unique([masterProviderId, serviceId])** | `prisma/schema` | Нет дублирующихся связей мастер↔услуга. |
| 8 | **UserSubscription.@@unique([userId, scope])** | `prisma/schema` | Одна подписка на scope (MASTER/STUDIO). |
| 9 | **HotSlot.@@unique([providerId, startAtUtc, endAtUtc])** | `prisma/schema` | Нет дубликатов горячих слотов. |
| 10 | **timingSafeEqual для JWT-подписи** | `src/lib/auth/jwt.ts` | Защита от timing-атак; нельзя заменять на обычное сравнение. |
| 11 | **Booking overlap check** | `booking-core.ts` (`ensureNoConflicts`) | Обязательная проверка пересечения перед созданием. |
| 12 | **MediaAssetEmbedding.embedding: vector(256)** | `prisma/schema` | Native-размерность Yandex `text-search-doc`/`query` (256, симметрична, `dim`-param запрещён). Смена → переиндексация всех активов через `scripts/backfill-visual-embeddings.mts`. Было `vector(1536)` (OpenAI) до VISUAL-SEARCH-YANDEX-MIGRATION-01. |
| 13 | **UI_TEXT — единственный источник текстов** | `src/lib/ui/text.ts` | Все UI-строки отсюда; хардкод русских строк запрещён (есть скрипт-проверка). |
| 14 | **Workspace pages — full-width layout** | `layout/app-shell-content.tsx` | `/cabinet` или `/admin` → без `max-w-screen-2xl`; marketing — constrained. Pathname-based решение; менять нельзя. |
| 15 | **Client components не импортируют server-only модули** | граница `editor.ts` ↔ `editor-shared.ts` | Транзитивный импорт Prisma/Redis/Node API в client-компонент роняет build (`Module not found: 'net'`). Pure helpers/types — в `*-shared.ts`; типы — `import type`. |
| 16 | **AdminAuditLog.adminUserId onDelete: Restrict** | `prisma/schema/audit.prisma` | Нельзя удалить UserProfile пока есть его audit-записи (защита compliance-истории). |
| 17 | **Review soft-delete: `deletedAt: null` в публичных запросах** | `reviews/soft-delete.ts` (`ACTIVE_REVIEW_FILTER`) | Все queries активных отзывов используют фильтр (public catalog / кабинеты / ratings recalc / AI summary / модерация). Новый review-query без фильтра = потенциальная утечка. Исключения: `kpis deletedLastWeek`, account-wide cascade. |
| 18 | **AdminAuditLog внутри транзакций (atomicity)** | `audit/admin-audit.ts` (`createAdminAuditLog`) | Audit-запись admin-действия — в той же транзакции; при fail бизнес-мутация откатывается. Cancel-sub, plan-edit/change, city-CRUD, review-approve/delete, settings-flag/SEO. |
| 19 | **AdminAuditLog safe variant вне транзакций (resilience)** | `audit/admin-audit.ts` (`createAdminAuditLogSafe`) | Когда external state уже мутирован (refund → YooKassa API) и rollback невозможен. Failure → `logError`, не 500. Сейчас: `/api/admin/billing/refund`. |
| 20 | **Studio masters никогда не показывают PREMIUM badge** | global UI rule | Подписка scope=STUDIO шарится на команду; индивидуальный мастер не «оплачивает PREMIUM». `PremiumBadge` suppressed везде, где рендерится studio master. Helper `isStudioMaster(provider) → studioId !== null`. |
| 21 | **Studio masters permissions — по default правилам (no toggles)** | UX rule | В detail-панели нет permission-toggles: schedule — через approval flow, services — по studio policy, notifications — user-level. Permission-gating в будущем = новые schema-поля + UI. |
| 22 | **Studio admin booking CRUD — direct, не approval** | `studio/bookings.service.ts` + `bookings/[id]/cancel` | Создать/перенести/отменить запись — напрямую через Booking CRUD (admin has authority). `ScheduleChangeRequest` approval — **отдельный концепт** только для master-initiated working-hours/day-off изменений. |
| 23 | **Category visibility: APPROVED = public; PENDING = creator scope only** | `services-data.service.ts` / `services-view.service.ts` / `/api/catalog/global-categories` / `catalog.service.ts` | `status=APPROVED AND visibleToAll=true` → видна везде; `PENDING` → только создателю в его picker. Public catalog **строго** фильтрует `APPROVED + visibleToAll`. **Write-path lockstep:** каждый status-write держит `visibleToAll` в синхроне (approve→true / reject→false / PATCH→= APPROVED). Никогда `OR:[APPROVED, own-PENDING]` на публичных поверхностях. |
| 24 | **Studio master eligibility: INVITED не назначается / не принимает записи** | `studio/master-eligibility.ts` (`isStudioMasterActive`, `requireActiveStudioMaster`) | Предикат ACTIVE: `ownerUserId !== null && isPublished === true`. INVITED и DISABLED блокируются от назначения/приёма (409 `MASTER_NOT_ACTIVE`). UI-pickers фильтруют INVITED at source; schedule-grid рендерит DisabledMasterOverlay. |
| 25 | **Master CRM private fields никогда не в client-facing API/DTO/SSR** | `bookings/dto.ts`, `bookings/list.ts`, `client-cabinet/bookings.service.ts`, `/api/cabinet/user/*`, `/api/bookings/my` — explicit-list select; guarded `client-privacy.test.ts` | `Booking.notes`, `ClientCard.notes/tags/photos`, `ClientNote.text` — **никогда** клиенту (152-ФЗ: данные обработки мастером). НЕ master-private (легитимно в client DTO): `Booking.comment` (клиент сам написал), `Booking.changeComment`. Защита двумя слоями: type-level `extends keyof` + source-level regex. Расширение privacy-полей → расширить оба массива в тесте. |
| 26 | **Chat attachment ACL = участники беседы (1:1 client↔master); studio admins/outsiders denied** | `media/access.ts` (`ensureCanReadMedia` CHAT_MESSAGE + `canReadChatAttachmentMedia`); `/api/chat/attachment/[token]` | Читают ТОЛЬКО `booking.clientUserId` и `booking.masterProvider.ownerUserId`. Studio admin/owner — НЕТ (152-ФЗ, same boundary как `resolveChatAccess`). URL — opaque token (assetId не в URL; signed payload `aid`+`exp`+`purpose:"chat-attachment-read"`, distinct purpose против cross-replay). Tests: `chat-attachment-acl/token.test.ts`. |
| 27 | **ModalSurface + Drawer enforce WCAG (focus trap / initial+return focus / reduced-motion)** | `components/ui/use-modal-a11y.ts` (`useReturnFocus`/`useInitialFocus`/`useFocusTrap`/`decideFocusTrap`) → `modal-surface.tsx` + `drawer.tsx` | Все модалы/drawer'ы: focus trap (Tab cycles), initial focus (first focusable / `initialFocusRef` / контейнер), return focus at close, `useReducedMotion`. 50+ callers наследуют без per-caller кода. Custom trap (~50 LOC). Stories-viewer-overlay — независимый trap. Tests: `use-modal-a11y.test.ts`. |
| 28 | **Booking state-change endpoints идемпотентны (`x-idempotency-key` + Redis lock)** | `bookings/idempotency.ts` (`resolveBookingIdempotency`/`storeBookingIdempotency`/`clearBookingIdempotency`), TTL 600s | Key namespaced by `clientUserId ?? guest:${clientPhone}`. Lock-then-create + on-failure cleanup. Duplicate POST → cached booking либо `DUPLICATE_REQUEST 409`. Тест: `idempotency-key.test.ts`. |
| 29 | **Публичные id — opaque через `src/lib/public-id.ts`** | `public-id.ts` (`encodePublicId`/`decodePublicId`, base64url, prefix `e_`) | Внутренние CUID не утекают в `/api/public/*`, `/api/catalog/*`, `/models/*`, reviews. Route декодирует через `decodePublicId` ПЕРЕД Prisma lookup. Backward-compatible (без префикса → raw). Исключение: booking-flow (id нужен клиенту). |
| 30 | **Цена плана — единый `resolvePlanPrice`; 0/≤0 → fallback, никогда не бесплатно** | `billing/pricing.ts` (`resolvePlanPrice`, `isPriceable`) | Один резолвер на всех путях → display==signup==renewal. Row учитывается только `kopeks > 0`; иначе fallback monthly×N (12mo = floor(monthly·12·0.8)) либо `null`. Платный план при `null`/≤0 → checkout 404 (не бесплатно); FREE до резолвера. Никогда не показывать stored 0 / «0 ₽ −100%». |
| 31 | **Все booking-write пути: salon-tz work-hours guard + in-tx Serializable conflict re-check** | `bookings/policy-enforcement.ts` (`resolveSalonLocalParts`, `assertMasterPerformsService`, `assertBookingWindow`) + `createBooking.ts` / `confirm.service.ts` / `studio/bookings.service.ts` | Funnel · solo manual · studio create/move · reschedule — conflict-check **внутри** `$transaction` Serializable (commit-time P2034/P2002 → 409, exclude-self на move). Work-hours в **salon-tz** (не `getUTCHours`). Override-дата — `parseDateKeyToUtcStart`. |
| 32 | **Reschedule = two-sided approval; solo-master и studio-admin делят один путь** | `confirmBooking.ts` + `decline-reschedule.ts` + `requireBookingConfirmAccess` — `/confirm` + `/decline-reschedule` | Перенос вступает при согласии обеих сторон (`actionRequiredBy === actor`). Один backend для solo+studio (auth admits обоих как `actor:"MASTER"`) — нельзя дублировать в studio-копию. Studio-admin **Move** (#22) — отдельное direct-action. |
| 33 | **Self-review запрещён server-side** | `reviews/service.ts` (`isBookingProviderSide` в `createReview`, 403 `REVIEW_NOT_ALLOWED`) | Отзыв отклоняется, если `authorId` — provider-side ЭТОЙ брони (solo master / master-in-studio / studio owner-admin). Ключ — linkage конкретной брони, не глобальный «is a provider». |
| 34 | **Package booking атомарен (all-or-none) + proportional discount Σ-exact + cancel целиком** | `bookings/package-booking.ts` + `package-booking-studio.ts` + `package-math.ts` + `cancelBooking` guard | Пакет — ОДНА Serializable-транзакция: per-component `resolveBookingCore` + `ensureNoConflicts(tx)` + intra-package pairwise overlap → BookingPackage + N Booking + N BookingServiceItem; конфликт → весь rollback; P2034/P2002→409. Σ child `priceSnapshot` == `totalKopeks` точно (largest-remainder). Cancel только целиком; lone-child → 409 `PACKAGE_CANCEL_WHOLE`; reschedule части — обычный move (`bookingPackageId` не трогается). Studio (multi-master): мастер на компонент (только assigned), sequential по timeline клиента, by-client `intraPackageOverlapMultiMaster`. |
| 35 | **Каждая связь `UserProfile` классифицирована при удалении аккаунта; неклассифицированная связь валит CI** | `deletion/user-data-disposition.ts` (`USER_RELATION_DISPOSITION`) + DMMF-guard `user-data-disposition.test.ts` | Ручной список связей в `delete-account.ts` дважды протухал незаметно (`yandexLink` с токенами пережил удаление; `UserFavorite`, `HotSlotSubscription`, `StudioMembership`). Ни один тест не падал, потому что никто не сравнивал список со схемой. Теперь guard обходит Prisma DMMF: **новая модель `SomethingLink` не пройдёт CI**, пока человек не выберет диспозицию (DELETED / ANONYMIZED / RETAINED / POLICY_PENDING) — а `POLICY_PENDING` фиксирует «ждёт юриста», а не «забыли». Инвариант — не про конкретный список, а про **невозможность молча его недосмотреть**. |
| 38 | **Каждая связь `Provider` классифицирована при удалении кабинета; неклассифицированная валит CI** | `deletion/provider-data-disposition.ts` + DMMF-guard `provider-data-disposition.test.ts` | Близнец #35 для второй «долгоживущей» сущности. Ключевой факт, из которого он следует: удаление кабинета **анонимизирует** строку `Provider`, а не удаляет её (на ней висит история броней), поэтому объявленные у почти всех связей `onDelete: Cascade` **не срабатывают никогда** — и это создаёт ложное ощущение, что о них позаботятся. Забытая связь молча остаётся указывать на мёртвый кабинет. Guard нашёл `discountRule`, которого не было ни в одном списке из аудита. |
| 36 | **Токены сторонних провайдеров не хранятся; появление такой колонки требует шифрования at-rest и явного решения** | `prisma/schema/auth.prisma` (`VkLink`/`YandexLink`) + guard `auth/provider-tokens-at-rest.test.ts` (DMMF + source-level) | Плейнтекстовые `accessToken`/`refreshToken` означали: дамп БД = живой доступ к VK/Yandex-аккаунтам пользователей. Аудит RKN-FIX-12 показал, что читать их было неоткуда — профиль в callback'е берётся **свежим** токеном из code-exchange, а единственный читатель (`logoutVkSession`) отзывал ровно тот токен, который мы сами и хранили. Колонки удалены. Инвариант **не запрещает** будущую фичу, которой токен реально нужен, — он запрещает **тихую** плейнтекстовую колонку: вернуть можно только вместе с шифрованием (AES-256-GCM, версионированный конверт, AAD к строке) и явным решением в отчёте. |
| 37 | **`UserConsent` пишет только `lib/legal/consent.ts`; enforcement — до создания сущности; аноним не пишет согласие на established-профиль** | `legal/consent.ts` (`recordUserConsents` / `recordGuestConsents` / `assertRequiredConsents` / `isGuestClassProfile`) + guard `legal/consent-single-writer.test.ts` | Строка `UserConsent` — единственное доказательство законности обработки (152-ФЗ ст. 9), и ценна ровно постольку, поскольку известно, что её породило: реальная версия документа из `documents.ts`, реальные IP/UA, реальный affirmative act. Три части неразделимы. **Один writer** — иначе где-нибудь появится `documentVersion: "1.0"` руками, и журнал станет недоказуемым. **Enforcement до создания** — UI-гейтинга мало: отказывать обязан роут, создающий аккаунт/бронь, и **до** их появления. **Anti-forgery** — аноним, назвавший чужой телефон в гостевой брони, не должен сфабриковать согласие за владельца аккаунта (`isGuestClassProfile`: ни `RefreshSession`, ни email, ни OAuth-линка, роли ровно `[CLIENT]`). Обход writer'а обходит и это. |

---

## 13. ПРАВИЛА ПРИ РАБОТЕ С КОДОМ

> **Каноничные правила кода** — [`CLAUDE.md`](CLAUDE.md) (именование, ошибки, auth, UTC, Prisma/schema-discipline, server/client boundary, rate-limit, public-id, env). **Чеклист коммита** — [`docs/QUALITY-GATES.md`](docs/QUALITY-GATES.md). **Мета-уроки процесса** (audit-first, trace-parallel-channels, redesign-checklist, defense-layering) — [`docs/SPRINT-PATTERNS.md`](docs/SPRINT-PATTERNS.md). Ниже — только код-специфика, которую агент должен помнить и которой нет в CLAUDE.md.

**Деньги — branded `Kopeks`** (`src/lib/money/kopeks.ts`): все суммы в копейках (integer), тип `Kopeks` (erased at runtime). Конструировать на границе (`toKopeks`), единицы менять один раз на display/YooKassa границе. **Display ₽ — только ÷100 formatters** (`UI_FMT.priceLabel`/`totalLabel` из `ui/fmt.ts` или `moneyRUBFromKopeks` из `format.ts`); non-÷100 `moneyRUB` удалены (рендерили копейки 100×). Никогда не форматировать копейки без ÷100.

**Время / отображение** (см. §12 инв. #1 + timezone-correctness skill): HH:MM брони/слота/расписания — **ТОЛЬКО** через `formatLocalHm(date, timeZone)` (client-safe `schedule/timezone.ts`, tz обязателен) в **salon-tz** с меткой «(Город, GMT+N)». Дата «сегодня» в tz сущности — `toLocalDateKey(now, entityTz)`. Нельзя `getUTCHours()`/`getHours()`/сырой `toLocale*` для display.

**Ошибки:** `AppError` + `toAppError` (`api/errors.ts`, ~130 кодов SCREAMING_SNAKE_CASE); `AppError.message` — курируемая русская строка клиенту, raw Prisma/stack — только в `logError`. Логирование — `logInfo`/`logError` (не `console.log`).

**PII / secrets в логах:** phone/email через `maskPhone`/`maskEmail` (`logging/masking.ts`) — raw PII в prod = 152-ФЗ. OTP/tokens/secrets в prod-логах никогда: паттерн `{ ..., ...(isProduction ? {} : { code }) }`.

**Billing:** доступ к фичам — `getBillingFeatures()`; не делать прямых запросов к `BillingPlan` (через `src/lib/billing/`).

**Cabinet-паттерны (redesign sprint):** `MasterPageHeader` (sticky per-page header, первый элемент content-area); `AppShellContent` (full-width cabinet/admin vs constrained marketing); snapshot-based settings (единый PATCH со `ScheduleEditorSnapshot`); auto-save (debounce 500мс + `<SaveStatusProvider>`); reference-driven редизайн (`.claude/references/{page}.png|js` → gap-analysis до кода); RSC serialization (Server → Client props только сериализуемы; иконки = string id + lookup map).

---

## 14. БЫСТРЫЙ СТАРТ ДЛЯ ИИ

### Ключевые файлы по областям
| Область | Файлы |
|---------|-------|
| Понять продукт | `prisma/schema/*.prisma`, `src/lib/ui/text.ts`, `.env.example`, этот файл |
| Авторизация | `src/lib/auth/{jwt,session,guards,otp}.ts`, `src/lib/yandex/*`, `src/lib/vk/*` |
| Бронирование | `src/lib/bookings/{createBooking,booking-core,policy-enforcement,idempotency}.ts`, `src/app/api/bookings/route.ts` |
| Package booking | `src/lib/bookings/{package-booking,package-booking-studio,package-math}.ts` |
| Расписание/слоты | `src/lib/schedule/{engine,engine-core,slots,bookable-window,editor,editor-shared}.ts` |
| Платежи/биллинг | `src/lib/payments/yookassa/*`, `src/lib/billing/{pricing,get-current-plan,subscription-active,price-optin,feature-catalog}.ts`, `webhook/route.ts` |
| AI (chat) | `src/lib/ai/client.ts` (Yandex-only chokepoint) + `src/lib/env.ts` |
| Уведомления | `src/lib/notifications/{notifier,delivery,booking-notifications,format-booking-when}.ts` |
| Очередь | `src/lib/queue/{types,queue}.ts`, `src/worker.ts` |
| Available-today | `src/lib/schedule/{available-today,recompute-available-today}.ts` |
| Rate-limit / IP | `src/lib/rate-limit/{index,configs}.ts`, `src/lib/http/ip.ts` |
| CRM / studio | `src/lib/crm/*`, `src/lib/studio/{bookings.service,master-eligibility}.ts` |
| Добавить API route | похожий `route.ts` + `src/lib/api/response.ts` + `src/lib/auth/guards.ts` |

### Команды
Скрипты — в `package.json`; чеклист проверок — скилл `quality-gates`. Неочевидное: `npm run worker` — отдельный процесс; схема меняется только через `npx prisma migrate dev --name <descriptive>` (`db push` запрещён).

### Knowledge graph (Graphify)
Read-only структурный слой для навигации (tree-sitter, 0 LLM-cost). Артефакты в `graphify-out/` (gitignored). Команды: `graphify update .` (rebuild после структурных фаз) · `graphify query "<question>"` · `graphify path "<A>" "<B>"` · `graphify explain "<symbol>"`. Для больших вопросов по кодбазе — быстрее grep.

### Типичные задачи
- **Новый тип уведомления:** enum `NotificationType` → `notifications/constants.ts` → функция в `*-notifications.ts` → `presentation.ts`.
- **Новая billing-фича:** `FEATURE_CATALOG` (`feature-catalog.ts`) → `DEFAULT_FEATURES` (`features.ts`) → seed → `getBillingFeatures()`.
- **Новый job:** payload+Job в `queue/types.ts` → factory → handler в `worker.ts`.
- **Изменить расписание:** через `schedule/editor.ts` + инвалидация кэша.

---

## 15. ИСТОРИЯ И CHANGELOG (указатель)

Полная commit-by-commit история проекта **жила в этом разделе до 8 июля 2026** и вынесена наружу (рефактор DOCS-CONTEXT-REFACTOR-01) по правилу DOCS-LEDGER-01 (`docs/QUALITY-GATES.md` § «Обновление контекста»): этот файл — снапшот, не changelog.

- **Хронология коммитов / фиксов** → git-история + [`BACKLOG-DONE.md`](BACKLOG-DONE.md) (append-only ledger завершённого).
- **QA-находки (Round 1 + Round 2, fixed / dev-only / flagged / deploy-checklist)** → [`QA-FINDINGS.md`](QA-FINDINGS.md).
- **Открытые задачи** → [`BACKLOG.md`](BACKLOG.md).
- **Мета-уроки процесса** → [`docs/SPRINT-PATTERNS.md`](docs/SPRINT-PATTERNS.md).

Последние крупные фазы (для контекста): Cabinet Master → Cabinet Studio (19 коммитов) → Cabinet Client → Admin Panel → публичные профили + booking-widget → package-booking (solo+studio) → Yandex OAuth → Telegram killswitch → available-today pipeline → pre-launch hardening (HARDENING-01…10) → opt-in renewal.

---

## 16. SEED / SHOWCASE-АККАУНТЫ

Для ручного и авто-тестирования есть 5 фикс-аккаунтов (идемпотентный seed через `ensureUserByPhone`). **OTP-код** в dev пишется в логи сервера (SMS-шлюз off; `SMS_PROVIDER_ENABLED=false` → mock логирует код).

| Телефон | Роль / вход | Кто |
|---------|-------------|-----|
| `+7 999 100 00 00` | MASTER → `/cabinet/master` | **Анна Соколова** — solo-мастер, Москва (`Europe/Moscow`) |
| `+7 999 200 00 00` | STUDIO → `/cabinet/studio` | **Виктория Алмазова** — владелец **Vision Beauty Studio** (PREMIUM), Екатеринбург (`Asia/Yekaterinburg`, +5 — намеренный non-MSK tz-anchor) |
| `+7 999 300 00 00` | MASTER → `/cabinet/master` | **Марина** (`vision-marina-lebedeva-1`) — мастер-член студии Vision (не studio-admin) |
| `+7 999 400 00 00` | ADMIN → `/admin` | Администратор платформы |
| `+7 999 500 00 00` | CLIENT → `/cabinet/(user)` | **Елена Петрова** — клиент (email `elena.petrova.91@yandex.ru`); есть Vision↔Елена брони + отзыв |

**Vision-фикстура (rich data):** ~7 ACTIVE мастеров · 35 услуг · 56 броней · 15 отзывов · 3 VIP-клиента · 3 пакета · 2 PENDING-категории · 12 уведомлений (+ 3 Vision↔Елена брони для reschedule/self-review E2E). Данные RF-only, salon-local времена (`dateAtLocalUtc`, tz-aware).

**Запуск:** `npm run seed:test:reset` (рекомендуется один раз после pull) → `npm run seed:test`. Идемпотентно (повторный `seed:test` без reset не бросает P2002). Seed-маркеры: email-домен `@test.masterryadom.local` + phone-префиксы `+79991…+79995`. QA-baseline snapshot — `.qa/snapshots/post-seed.dump` (pg_dump -Fc, ~67 таблиц).

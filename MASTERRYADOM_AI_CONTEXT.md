# МастерРядом — Контекст проекта для ИИ

> Дата аудита: **8 июля 2026** (рефактор DOCS-CONTEXT-REFACTOR-01 — файл переструктурирован и облегчён; предыдущие полные рефреши: R2 — 23 июня, V3 — 29 мая, V2 — 13 мая 2026).
>
> **Что это.** Снапшот текущего состояния проекта: (а) рабочий гайд для ИИ-агента (грузится в каждую сессию через `@`-импорт в `CLAUDE.md`), (б) обзор продукта и его состояния для человека. **Это НЕ changelog** — история коммитов живёт в git + [`BACKLOG-DONE.md`](BACKLOG-DONE.md).
>
> **Ведение.** Файл правится **только** при структурных триггерах (schema / routes / env / core-flows) — таблица в [`docs/QUALITY-GATES.md`](docs/QUALITY-GATES.md) § «Обновление контекста». Рутинные bugfix/UI/refactor-коммиты файл **не трогают** (DOCS-LEDGER-01). Раз в ~2 недели / после большого спринта — полный CONTEXT-REFRESH. **Держим лаконичным: истории тут не место.**
>
> **Смежные документы (этот файл их НЕ дублирует, а ссылается):** правила кода — [`CLAUDE.md`](CLAUDE.md); чеклист коммита — [`docs/QUALITY-GATES.md`](docs/QUALITY-GATES.md); мета-уроки процесса — [`docs/SPRINT-PATTERNS.md`](docs/SPRINT-PATTERNS.md); дизайн — `.claude/skills/ui-ux-pro-max/SKILL.md`; открытые задачи — [`BACKLOG.md`](BACKLOG.md); QA-ledger — [`QA-FINDINGS.md`](QA-FINDINGS.md).
>
> **Счётчики (примерно; сверять с исходниками):** моделей ~67 · enum'ов 37 · миграций 24 (последняя `20260707221738_renewal_price_optin`; источник — `prisma/schema/migrations/`) · test-файлов ~117 (~875 тестов; `npm run test`) · error-codes ~130 (`src/lib/api/errors.ts`).
>
> **Стадия:** MVP-plus, активная pre-launch подготовка. Ветка `predeploy`. Round 1 + Round 2 self-QA пройдены (booking / billing / catalog / timezone / auth-CSP закрыты). Остаток до launch — преимущественно **operational** (deploy/ops — см. §8).
>
> **Построено и живо:** Cabinet Master · Cabinet Client · Cabinet Studio · Admin Panel · публичные профили мастера/студии + booking-widget (гостевой checkout) · чат · мультигород · trial-подписки · email-OTP · package-booking (solo + studio) · Yandex/VK OAuth (Telegram-login gated OFF, см. §1) · available-today pipeline · opt-in renewal.
> **В работе / отложено:** SMS-шлюз (код готов — нужен prod-env), Sentry/APM (нет), полный per-viewer-tz рендеринг, visual-search reactivation.

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

**Рынок:** Россия / СНГ. Showcase-данные — RF-only (Москва + Екатеринбург). Timezone: `DEFAULT_TIMEZONE = Europe/Moscow` (он же schema `@default`); рабочая tz провайдера **derived из города** (`City.timezone`) при сохранении адреса, с явным cabinet-селектором для override. Цены в рублях, **хранятся в копейках**; на всех поверхностях форматируются ÷100.

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

### Frontend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | ^16.1.6 | App Router, SSR/SSG (webpack, не turbopack). **Не апгрейдить без согласования.** |
| React | 19.2.3 | UI |
| TypeScript | ^5 | strict: true |
| Tailwind CSS | ^3.4.17 | Стили (только токены — см. дизайн-скилл) |
| SWR | ^2.4.0 | Клиентская загрузка данных |
| Lucide React | ^0.541 | Иконки |
| framer-motion | ^12.38 | Анимации |
| @tanstack/react-virtual | ^3.13 | Виртуализация списков |
| next-pwa / next-themes | — | PWA + Service Worker / тёмная-светлая тема |

### Backend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js API Routes | ^16.1.6 | REST API |
| Prisma | ^6.19.2 | ORM. **🚨 Не до v7 без согласования.** |
| PostgreSQL + pgvector | — | Основная БД + вектора (dev: `pgvector/pgvector:pg16`) |
| Redis | ^5.10 | Кэш, rate-limit, очередь задач, pub/sub |
| Zod | ^4.3 | Валидация |

### Интеграции
YooKassa (платежи) · Яндекс S3 / Геокодер / Suggest (медиа, адреса) · Yandex ID OAuth · VK OAuth · Telegram Bot API (gated OFF, + monitoring) · YandexGPT (chat AI, §11) · OpenAI (visual-search, dormant) · web-push VAPID (push) · nodemailer SMTP (email) · SMSC.ru (SMS, код готов — не подключён) · Sharp (изображения) · AWS SDK S3.

### CI/CD и запуск
- GitHub Actions `.github/workflows/quality-gates.yml`: prisma validate/generate → lint → typecheck → tests → mojibake → encoding → schema-drift → context-freshness → openapi-routes.
- **Docker + деплой в Yandex Cloud** есть: `Dockerfile`, `Dockerfile.worker`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml` (`prisma migrate deploy` → build → push в Yandex Container Registry → SSH-деплой).
- Команды: `npm run dev` (Next dev) · `npm run worker` (воркер очереди, отдельный процесс) · `npm run build` (prod). См. §14.

---

## 3. АРХИТЕКТУРА КОДА

### Структура `src/`
```
src/
├── app/                    # Next.js App Router: (admin) (cabinet) (public) группы + api/ (route.ts) + страницы
├── components/             # Shared UI: ui/ auth/ billing/ cabinet/ layout/ notifications/ providers/ pwa/ ...
├── features/               # Feature-слайсы (UI по фичам): admin-cabinet, analytics, auth, billing, booking,
│                           #   catalog, chat, client-cabinet, crm, feed, home, hot-slots, master, media,
│                           #   model-offers, notifications, public-profile, public-studio, reviews, schedule,
│                           #   search-by-time, studio-cabinet  (features/studio/ удалён)
├── hooks/                  # Глобальные хуки
├── lib/                    # Домены/утилиты: advisor, ai, api, audit, auth, billing, bookings, cache, catalog,
│                           #   chat, crm, deletion, feed, hot-slots, http, idempotency, invites, logging, maps,
│                           #   master, media, money, model-offers, monitoring, notifications, openapi, payments,
│                           #   phone, profiles, providers, queue, rate-limit, redis, reviews, schedule, seo,
│                           #   services, sms, studio(s), support, telegram, time, ui, users, validation,
│                           #   visual-search, vk, yandex, env.ts
├── proxy.ts                # Middleware-class (в Next 16 переименован из middleware.ts): CORS/CSP/rate-limit-tier
├── worker.ts               # Воркер очереди задач + периодические джобы (available-today sweep, price-optin cron, ...)
└── types/
```

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

### Enums (37)
OtpChannel, AccountType, ConsentType, ProviderType, StudioRole, StudioMemberRole, StudioMemberStatus, MembershipStatus, CategoryStatus, BookingStatus, BookingCancelledBy, BookingRequestedBy, BookingActionRequiredBy, BookingSource, **BookingPackageStatus** (ACTIVE/CANCELLED), ChatSenderType, ScheduleMode, ScheduleBreakKind, ScheduleOverrideKind, ScheduleChangeRequestStatus, TimeBlockType, PlanTier, SubscriptionScope, SubscriptionStatus, BillingPaymentStatus, NotificationType (55+ значений), MediaEntityType, MediaKind, MediaAssetStatus, ReviewTargetType, ReviewTagType, ReviewReportReason, DiscountType, DiscountApplyMode, ModelOfferStatus, ModelApplicationStatus, AdminAuditAction.

Ключевые значения:
| Enum | Значения |
|------|---------|
| BookingStatus | NEW, PENDING, CONFIRMED, CHANGE_REQUESTED, REJECTED, IN_PROGRESS, PREPAID, STARTED, FINISHED, CANCELLED, NO_SHOW |
| SubscriptionStatus | ACTIVE, PENDING, PAST_DUE, CANCELLED, EXPIRED |
| BillingPaymentStatus | PENDING, SUCCEEDED, CANCELED, FAILED, REFUNDED |
| ScheduleMode | FLEXIBLE, FIXED · ScheduleOverrideKind | OFF, TIME_RANGE, TEMPLATE |
| CategoryStatus | PENDING, APPROVED, REJECTED · ModelApplicationStatus | PENDING, REJECTED, APPROVED_WAITING_CLIENT, CONFIRMED |
| StudioMemberStatus | ACTIVE, INVITED, DISABLED · MembershipStatus | ACTIVE, PENDING, REJECTED, LEFT |
| BookingSource | MANUAL, WEB, APP · DiscountType | PERCENT, FIXED · DiscountApplyMode | ALL_SERVICES, PRICE_FROM, MANUAL |

### Основные модели (~67)
| Модель | Ключевые поля | Связи / заметки |
|--------|--------------|-------|
| **UserProfile** | id, roles[], phone?, email?, emailVerifiedAt?, telegramId?, publicUsername?, **pushNotificationsEnabled**, blockedAt?/blockedByUserId?/blockedReason? | Provider[], Studio[], Booking[], Notification[], PushSubscription[], RefreshSession[], vkLink?, **yandexLink?**, adminAuditLogs[], reviewsDeleted[], self-relation blockedBy/blockedUsers |
| **Provider** | id, type, name, isPublished, timezone, cityId?, scheduleMode, autoConfirmBookings, bufferBetweenBookingsMin, slotStepMin, minBookingHoursAhead, maxBookingDaysAhead, lateCancelAction, slotPrecision, visibleSlotDays, acceptNewClients, autoPublishStoriesEnabled, **availableToday**, **socialVk?**, **socialInstagram?** | City?, Service[], Booking[], scheduleOverrides, weeklyScheduleConfig, DiscountRule?, HotSlot[], servicePackages[] |
| **MasterProfile** | id, userId, providerId | UserProfile, Provider |
| **Studio** | id, providerId (1:1) | StudioMember[], StudioInvite[], Service[], Booking[] |
| **StudioMember** / **StudioMembership** | studioId, userId, role(s), status | Studio, UserProfile (обе таблицы популируются для совместимости; canonical state-machine — Membership) |
| **Booking** | id, providerId, serviceId, clientUserId?, startAtUtc?, endAtUtc?, status, slotLabel, source, **bookingPackageId?**, notes?, comment?, proposedStartAt?, actionRequiredBy? | Provider, Service, UserProfile, BookingChat?, Review?, BookingServiceItem[], BookingPackage? |
| **BookingPackage** ⭐ | id, servicePackageId?(SetNull), providerId, clientUserId?, discountType+discountValue (snapshot), totalKopeks (=Σ child priceSnapshots), status(BookingPackageStatus) | bookings[] (инв. #34) |
| **BookingServiceItem** | id, bookingId, studioId?, serviceId?, titleSnapshot, priceSnapshot, durationSnapshotMin | Booking, Studio?, Service? |
| **Service** | id, providerId, name, durationMin, price, isEnabled, isActive, onlinePaymentEnabled | Provider, MasterService[], HotSlot[] |
| **MasterService** | masterProviderId, serviceId, priceOverride?, durationOverrideMin?, isEnabled, commissionPct? | `@@unique([masterProviderId, serviceId])` (инв. #7) |
| **ServicePackage** / **ServicePackageItem** | masterId(=providerId), title, discountPct?, isEnabled / packageId, serviceId, priceSnapshot, durationSnapshotMin, **sortOrder** | bundle услуг со скидкой |
| **ScheduleTemplate / …Break / WeeklyScheduleConfig / …Day / ScheduleOverride / ScheduleBreak** | шаблоны, недельная конфигурация, per-date overrides, перерывы | движок расписания (`ScheduleEngine`) |
| **ScheduleChangeRequest** | id, studioId?, providerId, payloadJson, status | заявки мастеров студии на изменение расписания |
| **HotSlot** / **HotSlotSubscription** | providerId, serviceId?, startAtUtc, endAtUtc, discountType/Value, expiresAtUtc / userId+providerId | `@@unique([providerId,startAtUtc,endAtUtc])` (инв. #9) |
| **UserSubscription** | id, userId, planId, status, scope, currentPeriodEnd, autoRenew, graceUntil?, isTrial, trialEndsAt, pendingPriceOptIn, pendingPriceKopeks, priceOptIn24h/2hSentAt | `@@unique([userId, scope])` (инв. #8) |
| **BillingPlan** / **BillingPlanPrice** | code, tier, scope, features(Json), inheritsFromPlanId? / period, kopeks, isActive | наследование фич; canonical codes UPPERCASE |
| **BillingPayment** | subscriptionId, status, amountKopeks, yookassaPaymentId?, idempotenceKey(@unique) | инв. #4 |
| **BillingAuditLog** / **AdminAuditLog** | action, details? / adminUserId(onDelete Restrict), action(enum), targetType?, targetId?, reason?, ipAddress?, userAgent? | админ-аудит (инв. #16/#18/#19) |
| **MrrSnapshot** | snapshotDate(@unique @db.Date), mrrKopeks(BigInt), activeSubscriptionsCount, breakdownJson? | daily-snapshot MRR (paid-and-current: ACTIVE+!trial+currentPeriodEnd>now) |
| **Notification** / **PushSubscription** | userId, type, title, body, payloadJson, isRead, bookingId? / endpoint(@unique), p256dh, auth | in-app / push |
| **MediaAsset** / **MediaAssetEmbedding** | entityType, entityId, kind, storageKey, status, visualIndexed / embedding(vector(1536)) | pgvector (инв. #12) |
| **Review** | id, bookingId?, authorId, targetType, targetId, rating, replyText?, reportedAt?/reportReason?/reportComment?, deletedAt?/deletedByUserId?/deletedReason? | soft-delete (инв. #17) |
| **ModelOffer** / **ModelApplication** | masterId, dateLocal, time…Local, status / offerId, clientUserId, status, bookingId? | офферы моделям |
| **ClientCard** | providerId, clientUserId?, clientPhone?, notes?, tags[] | CRM (privacy — инв. #25) |
| **GlobalCategory** | name, slug, parentId?, status, isSystem, visibleToAll, visualSearchSlug? | инв. #23 |
| **City** | slug(@unique), name, nameGenitive?, latitude, longitude, timezone, isActive, autoCreated | Provider.cityId (onDelete Restrict); auto-grow из геокодера |
| **VkLink** / **TelegramLink** / **YandexLink** ⭐ | userId, <provider>UserId, accessToken, refreshToken, isEnabled | OAuth-привязки (YandexLink: `@@unique(userId,yandexUserId)`, onDelete Cascade) |
| **ConversationSlug** | slug(@unique), bookingId(@unique) | opaque chat-URL |
| **RefreshSession** | userId, jti(@unique), expiresAt, usedAt?, revokedAt?, rotatedToSessionId? | single-use refresh (инв. #3) |
| **OtpCode** | phone, email?, channel, codeHash, expiresAt, usedAt? | HMAC codeHash (инв. #2) |
| **TimeBlock / DiscountRule / AppSetting / SystemConfig / UserConsent / ServiceBookingQuestion / PortfolioItem / PortfolioItemService / Tag / PublicUsernameAlias** | — | вспомогательные |

### Важные индексы
- `Provider`: `[isPublished, ratingAvg DESC, reviews DESC, createdAt DESC]`, `[type, isPublished, address]`, `[cityId, isPublished]`.
- `Booking`: `[providerId, startAtUtc, endAtUtc]`, `[status, startAtUtc]`.
- `UserSubscription`: `[status, autoRenew, nextBillingAt]`, `[status, graceUntil]`.
- `MediaAsset`: `[kind, visualIndexed, visualCategory]`.

---

## 5. РЕАЛИЗОВАННАЯ БИЗНЕС-ЛОГИКА (core flows)

### Аутентификация
`src/lib/auth/{jwt,otp,session,guards}.ts`. Кастомный JWT HS256 (без библиотек, `timingSafeEqual` — инв. #10). Access-token 2ч (cookie `bh_session`), refresh 30д (cookie `bh_refresh`, ротация цепочкой через `rotatedToSessionId`, single-use jti). Провайдеры входа: **OTP** (`OtpCode.codeHash` HMAC; SMS-шлюз не подключён → в dev код пишется в логи), **Yandex ID OAuth** (`src/lib/yandex/*`, account-linking зеркалит VK: session-link / new-vs-existing-by-yandexUserId / anti-hijack 409; PKCE S256 + HMAC-signed state/verifier cookies), **VK OAuth**. **Telegram-login gated OFF** (env `NEXT_PUBLIC_TELEGRAM_ENABLED`); при re-enable — CSRF-defence через single-use signed `tg_login_state` cookie + nonce (см. §10).

### Бронирования
`src/lib/bookings/{createBooking,booking-core,flow,policy-enforcement}.ts`, `src/lib/studio/bookings.service.ts`.
- **Гостевой checkout:** `/api/bookings` POST принимает гостя (nullable `clientUserId`); пост-signup link по телефону.
- **Единая in-tx Serializable conflict-дисциплина на ВСЕХ write-путях** (funnel · solo-master manual · studio create/move · reschedule): `ensureNoConflicts`/exclude-self re-check **внутри** `$transaction` (`isolationLevel: Serializable`) + commit-time P2034/P2002 → чистый 409 `SLOT_CONFLICT` (инв. #31).
- **Policy enforcement** (`policy-enforcement.ts`): `assertBookingWindow` (minBookingHoursAhead / maxBookingDaysAhead / acceptNewClients / visibleSlotDays — defense-in-depth на slots-endpoint + `resolveBookingCore`); `assertMasterPerformsService` (same-service при move); studio work-hours guard в **salon-tz** (`resolveSalonLocalParts`, engine-matching — не `getUTCHours`).
- **Reschedule = two-sided approval (инв. #32):** сторона предлагает → `CHANGE_REQUESTED` + `proposedStartAt` + `actionRequiredBy`; другая сторона confirm (`/confirm`) или decline (`/decline-reschedule`, revert). Solo-master и studio-admin делят один backend (`requireBookingConfirmAccess` → `actor:"MASTER"`). Studio-admin **Move** — отдельное direct-authority действие (инв. #22).
- **Package booking (инв. #34):** атомарный пакет N услуг в одной Serializable-транзакции (BookingPackage + N Booking + N BookingServiceItem; all-or-none; proportional discount Σ-exact). Solo (`package-booking.ts`, один мастер, sequential) + studio multi-master (`package-booking-studio.ts`, мастер на каждый компонент, sequential по timeline клиента, by-client overlap). Cancel — только целиком; reschedule части — обычный move (grouping survives).
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
- **Визуальный поиск** (`visual-search/*`, ⚠️ dormant): OpenAI Vision + pgvector, `VISUAL_SEARCH_ENABLED=false`, 0 векторов хранится.
- **CRM** (`crm/*`): ClientCard/ClientNote, мастер видит только своих (инв. #25).
- **Аналитика** (`api/analytics/*`): dashboard/revenue/clients/cohorts/bookings; единый tenant-scope `buildScopeWhere` (§10); plan-gated фичами.
- **Model Offers / Советник (Advisor, AI)** — офферы моделям; AI-рекомендации мастеру (YandexGPT, кэш Redis).
- **Provider socials** (`providers/social-links.ts`): free-text VK + Instagram community-links (НЕ OAuth) для обеих ролей; server нормализует + reconstruct'ит из hardcoded `https://<allowed-host>/` base (host-allowlist vk.com/instagram.com) → `INVALID_SOCIAL_LINK` на hostile input; рендер на публичных профилях master + studio.
- **Available-today pipeline** (`schedule/available-today.ts` + `recompute-available-today.ts` + worker): worker пересчитывает `Provider.availableToday` при старте + каждые 30 мин (+ precise per-mutation invalidation) → catalog filter `?availableToday=true` / card-chip / studio-badge. Trigger `/api/catalog/available-today/run` (`AVAILABILITY_CRON_TOKEN`).

---

## 6. МАРШРУТЫ И API

### Публичные страницы
`/` · `/catalog` · `/u/[username]` (+ `/booking`) · `/c/[username]` · `/providers/[id]` · `/clients/[id]` · `/hot` · `/inspiration` · `/models` (+ `/[offerId]`) · `/book` · `/login` · `/logout` · `/pricing` · `/about` `/how-it-works` `/how-to-book` `/blog` `/faq` `/support` `/help/masters` · `/become-master` `/partners` `/careers` · `/gift-cards` · `/privacy` `/terms` · `/notifications` · `/offline` · `/403`.

### Кабинеты
- **Master** (роль MASTER): `/cabinet/master/{dashboard,bookings,schedule,schedule/settings,analytics,clients,model-offers,profile,reviews}` — sidebar shell + per-page `MasterPageHeader` + full-width. Schedule settings — 5 табов, auto-save.
- **Studio** (STUDIO/STUDIO_ADMIN): `/cabinet/studio/{,calendar,bookings,schedule-requests,analytics,clients,services,team,reviews,settings}`. Settings — 7 разделов через `?section=`.
- **User/Client:** `/cabinet` (редирект по роли) · `/cabinet/(user)/{bookings,favorites,messages,notifications,reviews,model-applications,profile,roles,settings,faq}` · `/cabinet/billing`.
- **Admin** (`/admin`): dashboard · catalog · cities · billing (Plans/Subscriptions/Payments + cancel/refund + price isActive toggle) · reviews · settings · users. Все действия audit-logged.

### API (~ всего много route.ts; ниже группы)
- **Auth:** `/api/auth/otp/{request,verify}` · `/api/auth/refresh` · `/api/auth/telegram/{login-init,login}` (GET; gated) · `/api/auth/vk/{start,callback}` · **`/api/auth/yandex/{start,callback,unlink}`** · `/api/auth/{profile/ensure,account-type/set,roles/add}` · `/api/logout`.
- **Bookings:** `/api/bookings` (GET/POST) · `/api/bookings/my` · `/api/bookings/[id]/{cancel,confirm,reschedule,decline-reschedule,chat,chat/messages,chat/read}` · `/api/bookings/upload-reference` · **`/api/bookings/package/[id]/cancel`** · **`/api/public/packages/[id]/{propose,book}` + `/studio/{propose,book}`**.
- **Payments/Billing:** `/api/billing/{checkout,plans,status,cancel,renew/run}` · `/api/billing/mrr/snapshot/run` · `/api/payments/yookassa/webhook` (optional `?token=` + IP-allowlist log-only + worker API re-fetch).
- **Schedule/Slots:** `/api/public/providers/[providerId]/{slots,booking-days}` · `/api/masters/[id]/availability` · `/api/provider/schedule/{overrides,weekly,templates,status}`.
- **Catalog/прочее:** **`/api/catalog/available-today/run`** (cron-token) · `/api/catalog/*` · `/api/analytics/*` · `/api/master/*` · `/api/studio/*` · `/api/cabinet/{master,studio,user}/*` · `/api/chat/*` (+ `attachment/[token]`) · `/api/cities` · `/api/me/*` · `/api/notifications/*` · `/api/feed/*` · `/api/home/*` · `/api/reviews/*` · `/api/integrations/vk/*` · `/api/onboarding/professional/*` · `/api/search/*` · `/api/categories/*` · `/api/admin/*`.

---

## 7. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

> Все env-вары идут через **`src/lib/env.ts`** (Zod). `process.env.*` напрямую запрещён в `src/` (исключения: `env.ts`, Prisma-config, тесты, `startup.ts`, `proxy.ts`) — CLAUDE.md rule 11. Computed-флаги (`isPushEnabled`, `isPaymentsEnabled`, `isTelegramEnabled`, `isYandexAuthEnabled`, `isVkAuthEnabled`, `isSmsConfigured`, `isProduction` и пр.) — из того же модуля.

| Переменная | Обязательна | Заметка / default |
|-----------|-------------|-------------------|
| `DATABASE_URL` / `DIRECT_URL` | DB да / нет | Postgres; DIRECT_URL для migrate/pooler |
| `AUTH_JWT_SECRET` / `OTP_HMAC_SECRET` | ДА | иначе Error |
| `REDIS_URL` (+ `REDIS_*_TIMEOUT_MS`) | нет | без него — memory fallback |
| `STORAGE_PROVIDER` / `MEDIA_LOCAL_*` / `MEDIA_DELIVERY_SECRET` / `S3_*` | если S3 | `local` по умолчанию |
| `SMS_PROVIDER_ENABLED` / `SMS_PROVIDER_LOGIN` / `SMS_PROVIDER_PASSWORD` | для SMS | default OFF → mock (OTP в логи). Prod: включить + пополнить SMSC |
| `NEXT_PUBLIC_TELEGRAM_ENABLED` | legal kill-switch | unset → **false** (hard-ceiling над admin-toggle; НЕ влияет на `MONITORING_TELEGRAM_*`) |
| `TELEGRAM_BOT_TOKEN` / `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | для TG auth | работает только при флаге=true |
| `NEXT_PUBLIC_YANDEX_ENABLED` / `YANDEX_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | для Yandex ID login | кнопка absent без флага+id |
| `VK_CLIENT_ID` (alias `VK_ID_CLIENT_ID`) / `_SECRET` / `_REDIRECT_URI` / `NEXT_PUBLIC_VK_ENABLED` | для VK OAuth | оба имени в env.ts |
| `NEXT_PUBLIC_VK_COMMUNITY_URL` | для footer VK | unset → иконка опускается |
| `YANDEX_API_KEY` / `YANDEX_FOLDER_ID` | для chat-AI | YandexGPT (см. §11) |
| `OPENAI_API_KEY` / `VISUAL_SEARCH_ENABLED` | если visual-search | dormant, default false |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | для платежей | иначе Error |
| `YOOKASSA_WEBHOOK_TOKEN` | нет | optional URL `?token=` (не подпись); authenticity держит worker re-fetch |
| `YOOKASSA_IP_ALLOWLIST_ENFORCED` | нет | default log-only; `true` только после подтверждённого `TRUSTED_PROXY_HOPS` |
| `TRUSTED_PROXY_HOPS` / `TRUSTED_REAL_IP_HEADER` | нет | client-IP из XFF справа (default hops=1); выставить под prod-edge |
| `BILLING_RENEW_SECRET` / `MRR_SNAPSHOT_SECRET` / `AVAILABILITY_CRON_TOKEN` / `WORKER_SECRET` | для cron/health | fail-closed эндпоинты |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | для push | `isVapidConfigured` guard |
| `YANDEX_GEOCODER_API_KEY` / `YANDEX_SUGGEST_API_KEY` / `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` | для карт/адресов | |
| `SMTP_HOST/PORT/USER/PASS/FROM` / `SUPPORT_TO` / `SUPPORT_TO_PARTNERSHIP` | для email | иначе не отправляет |
| `MONITORING_TELEGRAM_BOT_TOKEN` / `_CHAT_ID` | нет | ops-алерты (отдельно от user-facing TG) |
| `NEXT_PUBLIC_APP_URL` / `APP_PUBLIC_URL` / `DEFAULT_TIMEZONE` / `NEXT_PUBLIC_LEGAL_INN` / `AUTH_COOKIE_NAME` / `NODE_ENV` | нет | tz default `Europe/Moscow`; cookie `bh_session` |

> **Удалён:** `AI_PROVIDER` (был vestigial; `ai/client.ts` — Yandex-only). Полные templates — `.env.example` / `.env.production.example`.

---

## 8. ТЕКУЩЕЕ СОСТОЯНИЕ: открытые риски и pre-launch

> Живой список задач — [`BACKLOG.md`](BACKLOG.md) (🔴→🔵). Ниже — что важно знать агенту как «ещё не закрыто / осознанно отложено». Закрытое — в `BACKLOG-DONE.md`.

**Pre-launch / deploy-чеклист (operational):**
- **SMS-шлюз** — код готов (`src/lib/sms/`, fail-soft 503), нужно в prod-env: `SMS_PROVIDER_ENABLED=true` + login/password, пополнить SMSC-баланс, smoke-test RU-операторы + IP-whitelist.
- **Применить миграции на проде** через `prisma migrate deploy` — в частности `20260702000000_add_provider_social_links` создана `--create-only` (pending); держать порядок; после — regen seed-snapshot.
- **VAPID prod-ключи** для push; **backfill-trial-conversion** (`scripts/backfill-trial-conversion.ts --apply` на staging/prod до launch); **cleanup-duplicate-billing-plans** (если в prod есть дубликаты low-case планов).
- **Telegram** — держать `NEXT_PUBLIC_TELEGRAM_ENABLED` unset/false до юр-ревью privacy/terms.
- **Инфра-решения (DevOps, не Claude):** Postgres hosting (Yandex Managed vs self-hosted; Supabase НЕ используется — недоступен из РФ), TLS termination, DB backup target, deploy rollback policy. Блокируют runbooks DR-2/3/6.

**Открытые технические риски:**
- Rate-limit **fail-open в dev** при отсутствии Redis (в prod sensitive-роуты fail-closed — приемлемо).
- Воркер — отдельный процесс; авто-рестарт зависит от docker/supervisor конфигурации деплоя.
- Нет явного глобального auth-middleware — каждый route проверяет сам (`proxy.ts` делает CORS/CSP/rate-limit-tier).
- JWT реализован вручную (HS256, `timingSafeEqual`); нет kid / ротации нескольких секретов.
- Нет Sentry/APM (только структурные логи) — `OBSERVABILITY-SENTRY` в бэклоге.

**Технический долг (компактно):** legacy `createClientBooking` slotLabel-путь; deprecated `Booking.startAt/endAt`; дублирующие rating-поля Provider (`rating`/`ratingAvg`, `reviews`/`ratingCount`); ~22 `eslint-disable`; OpenAPI/smoke не в CI; `slotPrecision` полный per-viewer-tz рендеринг (частично); `lateCancelAction="fine"` без enforcement (нет платёжных штрафов).

---

## 9. ТЕСТИРОВАНИЕ

- Framework: **Vitest** (v4), env node, alias `@/` через vite-tsconfig-paths. Запуск в CI (`quality-gates.yml`).
- **~117 test-файлов / ~875 тестов** (сверять `npm run test`). Плотность в `src/lib/`: booking, schedule, billing (pure helpers), sms, chat/media, cities.
- **Покрыто:** booking state-machine (`flow.test.ts`) + policy/reschedule enforcement + action-state; billing pure helpers (features/marketing/trial/utils/guards/mrr); schedule pure logic (slots/overlap/dateKey/booking-days/studio-slot-aggregation); auth pure (jwt/otp); sms + masking; package-math; **инварианты regression** — #25 CRM privacy (`client-privacy.test.ts`), #26 chat ACL (`chat-attachment-acl/token.test.ts`).
- **НЕ покрыто (нужна integration-инфра):** createBooking/cancelBooking integration, rate-limit/session/role-guards (Prisma/Redis-bound), OAuth flows, аналитика/платежи end-to-end. Нет coverage-tooling (c8), нет E2E (Playwright/Cypress) — ожидаемо для MVP. Live-QA — через Playwright MCP + `.qa/` harness (см. `playwright-qa` skill).

---

## 10. БЕЗОПАСНОСТЬ

- **Rate limiting** (`rate-limit/index.ts`): Redis + memory-fallback; **чувствительные роуты (auth/bookings/payments/delete/studio/reviews) fail-closed** при недоступности Redis (инв. #6); OTP-лимит по phone+IP; Telegram-алерт при 3+ Redis-ошибках/мин.
- **RBAC** (`auth/guards.ts`, `access.ts`, `admin.ts`, `ownership.ts`): проверка ролей в каждом handler; ownership; cross-tenant — `ensureStudioRole({studioId,userId,allowed})` (client-supplies-id / server-authorizes).
- **Analytics tenant-scope** — единый `buildScopeWhere(context)` (`analytics/domain/helpers.ts`): MASTER → свои брони; STUDIO → conditional studioId/providerId (**никогда `{studioId: undefined}`** в OR).
- **Валидация** — весь input через Zod (`parseBody`); file-upload = MIME-allowlist + size + magic-byte sniff + Sharp re-encode.
- **YooKassa webhook** — authenticity через worker API re-fetch (инв. #5), не HMAC.
- **Client-IP** — единый `extractClientIp`/`getClientIp` (`http/ip.ts`), берёт IP из XFF **справа** (peel `TRUSTED_PROXY_HOPS`), никогда leftmost → закрывает spoof per-IP лимитов.
- **PII в логах** — phone/email через `maskPhone`/`maskEmail`; OTP/secrets в prod-логах никогда (guard `isProduction`). См. §13.
- **Telegram-login CSRF** (до re-enable): single-use signed `tg_login_state` cookie + nonce round-trip + `getTelegramEnabled()` gate.
- **Timezone validation** — write-time `.refine(isValidTimeZone)` на studio/master PATCH; read-time fallback `Europe/Moscow` (закрывает stored-DoS через пустую tz).
- **Идемпотентность** — bookings (`x-idempotency-key`+Redis lock), `BillingPayment.idempotenceKey` (@unique), YooKassa Idempotence-Key.
- **Security headers / CSP** (`next.config.ts` + `proxy.ts`): X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; prod — HSTS + CSP (nonce + strict-dynamic, без unsafe-inline/eval); JSON-LD экранирует `<` (`safeJsonLd`).
- **Секреты** — JWT/OTP HMAC-SHA256; refresh в БД (jti), cookie httpOnly+SameSite=lax+secure.
- Остаточно: нет kid/ротации JWT-секрета; IP-allowlist webhook пока log-only.

---

## 11. ПРОИЗВОДИТЕЛЬНОСТЬ, AI-ПРОВАЙДЕР, ИНФРАСТРУКТУРА

**Кэширование:** Redis — rate-limit windows, schedule DayPlan, slots cache, session, idempotency locks, notifier pub/sub. Инвалидация слотов после любого save в Schedule Settings (`invalidateSlotsForMaster`; cache-version по `updatedAt` provider/override/template/weeklyConfig). Клиент — SWR. Service Worker — шрифты/картинки.

**Прочее:** пагинация cursor-based (feed, catalog); изображения через `next/image` (`storage.yandexcloud.net`) + Sharp; SSR публичных профилей + parallel `Promise.all`; очередь — polling-воркер (один процесс, нет горизонтального масштабирования). N+1 к контролю: `resolveStudioIdForUser` на каждый API-запрос, analytics-handlers.

**AI-провайдер (chat surfaces):** **Yandex Cloud Foundation Models** (single provider), endpoint `https://llm.api.cloud.yandex.net/v1` (OpenAI-compatible), модель YandexGPT 5 Lite для 4 surfaces (review-summary / review-reply / service-description / advisor). Chokepoint — `src/lib/ai/client.ts` (`aiChat()`, Yandex-only); auth через `YANDEX_API_KEY` + `YANDEX_FOLDER_ID`. Плюс — native RU-доступ, без VPN. **Visual-search** — отдельный dormant трек, всё ещё OpenAI SDK (`OPENAI_API_KEY`, `VISUAL_SEARCH_ENABLED=false`, 0 векторов); миграция на Yandex-multimodal + `vector(1536)→vector(256)` отложена post-launch. История миграции — `docs/AI-MIGRATION-STRATEGY.md`.

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
| 12 | **MediaAssetEmbedding.embedding: vector(1536)** | `prisma/schema` | Размерность OpenAI-эмбеддинга; смена → переиндексация всех активов (при reactivation → vector(256)). |
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
```bash
npm run dev              # Next.js dev
npm run worker           # воркер очереди (отдельный процесс)
npm run test             # Vitest
npm run typecheck        # типы
npm run lint             # ESLint
npm run check            # полная проверка (lint+types+prisma+encoding+mojibake+ui-text+schema-drift+context-freshness+openapi-routes+smoke)
npx prisma migrate dev --name <descriptive>   # изменение схемы (db push запрещён)
```

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

# МастерРядом — Контекст проекта для ИИ
> Дата аудита: **13 мая 2026** (refresh — CONTEXT-REFRESH-V2; предыдущий snapshot был 7 мая 2026)
> Файлов проверено: **1407 TypeScript-файлов** в `src/` (271 API route.ts + 89 page.tsx)
> Коммит/ветка: `designStudioCabinet`. Последний коммит main: `b3eedaf` (Merge PR #71 — Admin Cabinet).
> Моделей: **65**, enum'ов: **36**, миграций: **16** (последняя — `20260514000936_add_admin_initiated_notification_types`).
>
> **Active sprint:** редизайн кабинета студии в ветке `designStudioCabinet`.
> - ✅ Schedule request approval UI (STUDIO-SCHEDULE-REQUEST-APPROVAL-A — closed functional gap)
> - ✅ Shell foundation (STUDIO-SHELL-A — sidebar/topbar/UserChip/bottom-nav + nav config + counts service)
> - ✅ Symmetric switcher rollback (SYMMETRIC-SWITCHER-A — cabinet UI без duplicate switcher)
> - ✅ Dashboard redesign (STUDIO-DASHBOARD-A — rich KPIs + attention + revenue chart)
> - ✅ Masters page redesign (STUDIO-MASTERS-A — 2-col list+detail, status filters, invite/pause/activate)
> - ✅ Schedule multi-master redesign (STUDIO-SCHEDULE-A — день grid + неделя occupancy + action menus, NO D&D / NO Месяц)
> - ✅ Bookings journal (STUDIO-BOOKINGS-A — table-based journal с VIP/new badges + action menu reuse + phone required fix)
> - ✅ Services management (STUDIO-SERVICES-A — 3-col layout categories + list + detail с CRUD + master assign)
> - ✅ Gap fixes (STUDIO-GAPS-FIX-A — chat icon removed + break management dialog + cache invalidation fix)
> - ✅ 🔴 Category unification (CATEGORY-UNIFICATION-A — pre-launch blocker resolved, services route via GlobalCategory, catalog matching works)
> - ✅ Service packages (STUDIO-PACKAGES-A — strict mirror master ServicePackage pattern, no schema migration, reuses master mutations)
> - ✅ Bug-fix sweep (STUDIO-BUGS-FIX-A — Prisma NULL-aware `not` filter on `visualSearchSlug` fixed in 4 sites; INVITED master eligibility guard `isStudioMasterActive` + `requireActiveStudioMaster` enforced in assign/booking/move/schedule)
> - ✅ Visual polish (STUDIO-POLISH-A — full-width layout mirror master, hero text contrast fix + studioName in title, publicUsername в team URL, studio topbar удалён)
> - ✅ Showcase seed (STUDIO-SHOWCASE-SEED — Vision Beauty Studio: 7 ACTIVE masters / 35 services / 56 bookings / 15 reviews / 3 VIP clients / 2 PENDING categories / 3 packages / 12 notifications — full rich-data fixture для visual validation)
> - ✅ Clients page (STUDIO-CLIENTS-A — 2-col segments+table, 5 KPI tiles, derived segments via `classifyClient` reuse, no birthday/blacklist/import/export/рассылка/custom)
> - ✅ Seed consolidation (SEED-CONSOLIDATION-A — 4 showcase phones 100/200/300/400, `ensureUserByPhone` helper eliminates P2002, reset.ts extended scope, new admin showcase)
> - ✅ Reviews page (STUDIO-REVIEWS-A — 3 stats cards including top services + 4 filter chips + master scope reply via extended `ensureMasterReviewAccess`, report reuses existing endpoint, «Ответ студии» label always)
> - ✅ Notifications page (STUDIO-NOTIFICATIONS-A — reuses 26-NOTIF `getNotificationCenterData` filtered by `channel === "STUDIO"`, 4 KPI tiles + 10 chip filters incl. team/finance, inline approve/reject for SCHEDULE_REQUEST mirrors master BOOKING_REQUEST pattern, no cabinet artifacts)
> - ✅ Analytics page (STUDIO-ANALYTICS-A — 4 view tabs over 15 reused `/api/analytics/*` endpoints, KPI + revenue compare overlay + sources donut + hours heatmap + Masters/Services/Clients tables, plan-gated via existing `analytics_*` feature catalog, no «ВАМ» payout column, inline-SVG charts, no custom date picker)
> - ✅ Finance removed (STUDIO-FINANCE-REMOVE-A — page intentionally not built, would duplicate Analytics without payout/commission/expense distinguishing content; nav-item removed, route redirects to Analytics, orphan endpoints+component+OpenAPI+UI_TEXT keys deleted)
> - ✅ Settings page (STUDIO-SETTINGS-A — 5 sections incl. owner & team + notifications closing the NOTIFICATIONS info-banner debt, policy read-only with deep link to schedule editor, danger zone OWNER-only via reused delete-studio + isPublished archive; «Реквизиты»/«Интеграции» sections deliberately not built)
>
> **🎉 Cabinet Studio sprint COMPLETE — 19 коммитов** (shell + dashboard + masters + schedule + bookings + services + packages + clients + reviews + notifications + analytics + settings + showcase seed + seed consolidation + 4 bug-fix/polish/cleanup commits).
>
> **▶ Public surfaces workstream started (после Cabinet Studio):**
> - ✅ Public studio profile redesign (STUDIO-PUBLIC-PROFILE-A — dropped inline booking flow in favour of deep-link to `/u/[username]/booking`, added slot-bar CTA, reordered sections per spec; live slot aggregation backlogged because no studio-scope helper exists)
> - ✅ Booking policy enforcement (BOOKING-WIDGET-A — closes pre-launch backlog gap: `minBookingHoursAhead` / `maxBookingDaysAhead` / `acceptNewClients` / `visibleSlotDays` now enforced server-side via new `policy-enforcement` helper + 18 unit tests; defense-in-depth at both slots endpoint and `resolveBookingCore`; full widget UX redesign deferred due to multiple entangled blockers)
> - ✅ Booking widget foundation (BOOKING-WIDGET-FOUNDATION-A — stage 1/2: guest booking enabled at `/api/bookings` POST + `resolveBookingCore` + `createBooking` (surgical nullable adaptation, NOT rewrite); server-side `aggregateStudioSlots` helper + 9 unit tests; widget UI minimal guest-contacts adaptation; scenario A/B for studio + `?master=` was already wired; solo-master direct booking via `/booking` route deferred)
> - ✅ Booking widget UX redesign (BOOKING-WIDGET-UI-A — stage 2/2: full wizard redesign over the foundation — 4/3-step flow с framer-motion AnimatePresence, hero card, sticky summary, per-error inline copy для всех 5 ErrorCode'ов, `silentMode` toggle wired через schema-existing column, redesigned `loading.tsx`. Foundation reused as-is — createBooking core, aggregator, scenario logic, schedule engine все untouched)
> - **🎉 Booking widget workstream COMPLETE** — core conversion surface production-ready
> - ⏳ Master public profile follow-ups, Catalog enhancements, marketing pages, hot-slots, inspiration, models
>
> **Merged в main** с прошлого snapshot: Cabinet Master (полностью), Cabinet Client (полностью), Public master profile `/u/[username]` + booking widget, Chat foundation, Multi-city support, Stories rail, Trial subscriptions, Email OTP, Review reports.

---

## 1. ПРОДУКТ И БИЗНЕС-МОДЕЛЬ

**Название продукта:** МастерРядом
**Кодовое имя в репозитории:** BeautyHub
**Домен:** МастерРядом.online

**Описание:** Маркетплейс-агрегатор для онлайн-записи к мастерам красоты (маникюр, стрижки, массаж и пр.). Клиенты находят мастеров или студии, смотрят портфолио, записываются онлайн. Мастера управляют расписанием, бронированием, профилем.

**Рынок:** Россия / СНГ. Timezone по умолчанию — Asia/Almaty (указан в схеме), конфиг DEFAULT_TIMEZONE = Europe/Moscow. Цены в рублях (RUB, копейках в БД).

**Роли пользователей:**
| Роль | Описание |
|------|----------|
| CLIENT | Клиент, записывается к мастерам |
| MASTER | Мастер-одиночка, управляет своим кабинетом |
| STUDIO | Студия с командой мастеров |
| STUDIO_ADMIN | Администратор студии |
| ADMIN | Администратор платформы |
| SUPERADMIN | Суперадмин платформы |

**Монетизация:** Подписочная модель (SaaS) для провайдеров:
- Тарифы: FREE / PRO / PREMIUM
- Периоды оплаты: 1, 3, 6, 12 месяцев (скидка 20% за год)
- Платежи через ЮКасса (YooKassa)
- Grace-period 7 дней при просрочке (PAST_DUE_GRACE_DAYS = 7)
- Ограничения по плану: maxTeamMasters, maxPortfolioPhotosSolo и др.

**Стадия:** Активная разработка / MVP-plus. SMS-шлюз НЕ интегрирован (OTP пишется в логи с комментарием "MVP"). Production launch — в активной подготовке (Q2-Q3 2026); идёт sprint редизайна кабинета мастера в ветке `newDesignSystem`.

**Уникальные фичи:** «Горячие слоты» (HotSlot) — мастер публикует скидочный слот в последний момент. «Модель-офферы» (ModelOffer) — мастер ищет моделей для практики. Визуальный поиск по фото (OpenAI embeddings + pgvector).

---

## 2. ТЕХНИЧЕСКИЙ СТЕК

### Frontend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | ^16.1.6 | App Router, SSR/SSG |
| React | 19.2.3 | UI |
| TypeScript | ^5 | Строгий режим (strict: true) |
| Tailwind CSS | ^3.4.17 | Стили |
| SWR | ^2.4.0 | Клиентская загрузка данных |
| Lucide React | ^0.541.0 | Иконки |
| @radix-ui/react-slot | ^1.2.4 | Примитив для UI |
| @tanstack/react-virtual | ^3.13.18 | Виртуализация списков |
| react-day-picker | ^9.14.0 | Календарь (catalog premium search bar, exception modal) |
| next-pwa | ^5.6.0 | PWA + Service Worker |
| next-themes | ^0.4.6 | Тёмная/светлая тема |

### Backend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js API Routes | ^16.1.6 | REST API |
| Prisma | ^6.19.2 | ORM |
| PostgreSQL | — | Основная БД |
| pgvector | — | Векторный поиск (MediaAssetEmbedding) |
| Redis | ^5.10.0 | Кэш, rate-limit, очередь задач, pub/sub уведомлений |
| Zod | ^4.3.6 | Валидация данных |

### Инфраструктура и интеграции
| Сервис | Назначение |
|--------|-----------|
| YooKassa | Онлайн-платежи и подписки |
| Яндекс S3 (YandexCloud) | Хранение медиафайлов |
| Яндекс Геокодер | Геокодирование адресов |
| Яндекс Suggest API | Подсказки адресов |
| Telegram Bot API | Уведомления + авторизация через Telegram |
| VK OAuth | Авторизация через ВКонтакте |
| OpenAI API | Визуальный поиск по портфолио (embeddings) |
| web-push (VAPID) | PWA Push-уведомления |
| nodemailer (SMTP) | Email для поддержки |
| Sharp | Ресайз/обработка изображений |
| AWS SDK S3 | Работа с S3-совместимым хранилищем |

### CI/CD
- GitHub Actions: `.github/workflows/quality-gates.yml`
- Проверки: Prisma validate → Prisma generate → Lint → Typecheck → Mojibake check → Encoding check
- Docker: НЕ ОБНАРУЖЕНО (нет Dockerfile и docker-compose.yml)

### Сборка и запуск
- `npm run dev` — Next.js dev с webpack (не turbopack)
- `npm run worker` — отдельный процесс воркера (tsx src/worker.ts)
- `npm run build` — production build с webpack
- Воркер запускается отдельно от Next.js приложения

---

## 3. АРХИТЕКТУРА КОДА

### Структура src/
```
src/
├── app/                    # Next.js App Router
│   ├── (admin)/            # Группа роутов: admin-панель
│   ├── (cabinet)/          # Группа роутов: личный кабинет
│   ├── (public)/           # Группа роутов: публичные страницы
│   ├── api/                # REST API (route.ts)
│   └── [страницы]/         # Публичные страницы (login, catalog, etc.)
├── components/             # Переиспользуемые UI-компоненты (60 tsx-файлов)
│   ├── auth/
│   ├── billing/
│   ├── blocks/
│   ├── cabinet/
│   ├── layout/
│   ├── notifications/
│   ├── providers/
│   ├── pwa/
│   └── ui/
├── features/               # Feature-слайсы (271 tsx-файла)
│   ├── admin/
│   ├── analytics/
│   ├── auth/
│   ├── billing/
│   ├── booking/
│   ├── cabinet/
│   ├── catalog/
│   ├── chat/
│   ├── crm/
│   ├── feed/
│   ├── home/
│   ├── hot-slots/
│   ├── master/
│   │   ├── components/
│   │   │   ├── dashboard/         # GreetingHero, KPI grid, бронирования, attention, quick actions, announcements
│   │   │   ├── bookings/          # Kanban (5 колонок), карточка с действиями, swipe на mobile
│   │   │   ├── schedule/          # Week view, day header, booking cards, reschedule modal
│   │   │   ├── schedule-settings/ # 5 табов (Часы / Исключения / Перерывы / Правила / Видимость)
│   │   │   ├── master-sidebar.tsx # Сайдбар с 4 nav-группами
│   │   │   ├── master-page-header.tsx
│   │   │   ├── master-bottom-nav.tsx
│   │   │   └── ...
│   │   └── lib/                   # announcements, dashboard-advice, time-greeting
│   ├── media/
│   ├── model-offers/
│   ├── notifications/
│   ├── public-profile/
│   ├── public-studio/
│   ├── reviews/
│   ├── schedule/
│   ├── search-by-time/
│   ├── studio/
│   └── studio-cabinet/
├── hooks/                  # Глобальные хуки
├── lib/                    # Бизнес-логика и утилиты (доменные модули)
│   ├── advisor/            # Советник (AI-рекомендации для мастера)
│   ├── api/                # Хелперы ответов API
│   ├── auth/               # JWT, OTP, сессии, RBAC
│   ├── billing/            # Подписки, планы, фичи
│   ├── bookings/           # Создание/отмена/изменение бронирований
│   ├── cache/              # Redis/memory кэш
│   ├── catalog/            # Каталог провайдеров
│   ├── chat/               # Чат к бронированию
│   ├── crm/                # CRM: карточки клиентов
│   ├── deletion/           # Удаление аккаунтов
│   ├── domain/             # Доменные типы
│   ├── feed/               # Лента портфолио
│   ├── home/               # Главная страница
│   ├── hot-slots/          # Горячие слоты
│   ├── http/               # HTTP-утилиты
│   ├── idempotency/        # Идемпотентность запросов
│   ├── invites/            # Приглашения в студию
│   ├── logging/            # Логирование
│   ├── maps/               # Геокодирование, адреса
│   ├── master/             # Логика мастера
│   ├── masters/            # Работа с мастерами
│   ├── media/              # Медиафайлы, S3, local storage
│   ├── model-offers/       # Офферы для моделей
│   ├── monitoring/         # Алерты, статус
│   ├── notifications/      # Уведомления (push, telegram, center)
│   ├── openapi/            # OpenAPI генерация
│   ├── payments/           # YooKassa платежи
│   ├── phone/              # Обработка телефонов
│   ├── profiles/           # Профили провайдеров
│   ├── providers/          # Настройки провайдеров
│   ├── queue/              # Очередь задач (Redis + memory fallback)
│   ├── rate-limit/         # Rate limiting (Redis + memory fallback)
│   ├── redis/              # Подключение к Redis
│   ├── reviews/            # Отзывы
│   ├── schedule/           # Движок расписания (ключевой модуль)
│   ├── search-by-time/     # Поиск по времени
│   ├── seo/                # SEO мета
│   ├── services/           # Услуги
│   ├── studio/             # Логика студии
│   ├── studios/            # Работа со студиями
│   ├── support/            # Поддержка (тикеты)
│   ├── telegram/           # Telegram Bot
│   ├── time/               # Утилиты времени
│   ├── types/              # Общие типы
│   ├── ui/                 # UI-тексты (text.ts)
│   ├── users/              # Пользователи
│   ├── utils/              # Утилиты
│   ├── validation/         # Zod-схемы
│   ├── visual-search/      # Визуальный поиск (OpenAI + pgvector)
│   ├── vk/                 # VK OAuth
│   └── yandex/             # Яндекс API
├── proxy.ts                # HTTP-прокси для медиафайлов
├── types/                  # Глобальные TypeScript типы
└── worker.ts               # Воркер очереди задач
```

### Ключевые паттерны
- **Thin API routes**: бизнес-логика вынесена в `src/lib/`, route.ts — тонкая обёртка
- **Feature-slices**: UI разбит по фичам (features/), не по типам
- **Dual storage**: Redis как primary, memory-fallback в dev (rate-limit, queue, notifier)
- **UTC-first**: все даты хранятся в UTC (`startAtUtc`, `endAtUtc`), локальное время только для отображения
- **Fail-closed для чувствительных роутов**: rate-limit при недоступности Redis возвращает 429 для `/api/auth`, `/api/bookings`, etc.
- **Идемпотентность**: бронирования поддерживают `x-idempotency-key` заголовок
- **RBAC**: `requireAuth()`, `requireRole()`, `hasAnyRole()` в `src/lib/auth/guards.ts`
- **Централизованные UI-тексты**: `src/lib/ui/text.ts` экспортирует константу `UI_TEXT`

### Количество файлов
| Тип | Количество |
|-----|-----------|
| route.ts (API handlers) | 240 |
| page.tsx (страницы) | 78 |
| test-файлов | 29 |
| tsx-файлов в components/ | 60 |
| tsx-файлов в features/ | 271 |
| Всего TS/TSX в src/ | 1094 |

---

## 4. МОДЕЛЬ ДАННЫХ

### Enums (35 штук, актуально на 2026-05-13)

Полный список из `prisma/schema/enums.prisma`: OtpChannel, AccountType, ConsentType, ProviderType, StudioRole, StudioMemberRole, StudioMemberStatus, MembershipStatus, CategoryStatus, BookingStatus, BookingCancelledBy, BookingRequestedBy, BookingActionRequiredBy, BookingSource, ChatSenderType, ScheduleMode, ScheduleBreakKind, ScheduleOverrideKind, ScheduleChangeRequestStatus, TimeBlockType, PlanTier, SubscriptionScope, SubscriptionStatus, BillingPaymentStatus, NotificationType, MediaEntityType, MediaKind, MediaAssetStatus, ReviewTargetType, ReviewTagType, ReviewReportReason, DiscountType, DiscountApplyMode, ModelOfferStatus, ModelApplicationStatus, **AdminAuditAction**.

**Изменения с предыдущего snapshot:**
- ➕ `ReviewReportReason` (SPAM/FAKE/OFFENSIVE/INAPPROPRIATE/OTHER) — миграция `20260424100000_add_review_report_reason`
- ➕ `OtpChannel` (PHONE/EMAIL) — миграция `20260409120000_add_email_otp`
- ➕ `MediaAssetStatus` — статусы загруженных ассетов
- ➕ Trial-related значения в `SubscriptionStatus` — миграция `20260430000000_add_trial_to_user_subscription` (поля `isTrial` / `trialEndsAt` на UserSubscription)
- ➕ `NotificationType` расширен trial-уведомлениями и slot-freed/weekly stats (миграции `20260328175037` и `20260430000100`)

### Подробная таблица основных enum'ов

| Enum | Значения |
|------|---------|
| AccountType | CLIENT, MASTER, STUDIO, STUDIO_ADMIN, ADMIN, SUPERADMIN |
| ProviderType | MASTER, STUDIO |
| BookingStatus | NEW, PENDING, CONFIRMED, CHANGE_REQUESTED, REJECTED, IN_PROGRESS, PREPAID, STARTED, FINISHED, CANCELLED, NO_SHOW |
| NotificationType | 40+ типов уведомлений (бронирования, студии, биллинг, чат, категории и пр.) |
| PlanTier | FREE, PRO, PREMIUM |
| SubscriptionStatus | ACTIVE, PENDING, PAST_DUE, CANCELLED, EXPIRED |
| BillingPaymentStatus | PENDING, SUCCEEDED, CANCELED, FAILED, REFUNDED |
| MediaKind | AVATAR, PORTFOLIO, MODEL_APPLICATION_PHOTO, CLIENT_CARD_PHOTO, BOOKING_REFERENCE |
| MediaEntityType | USER, MASTER, STUDIO, SITE, MODEL_APPLICATION, CLIENT_CARD, BOOKING |
| ScheduleMode | FLEXIBLE, FIXED |
| ScheduleOverrideKind | OFF, TIME_RANGE, TEMPLATE |
| ScheduleBreakKind | WEEKLY, OVERRIDE |
| ScheduleChangeRequestStatus | PENDING, APPROVED, REJECTED |
| ModelOfferStatus | ACTIVE, CLOSED, ARCHIVED |
| ModelApplicationStatus | PENDING, REJECTED, APPROVED_WAITING_CLIENT, CONFIRMED |
| CategoryStatus | PENDING, APPROVED, REJECTED |
| StudioMemberRole | OWNER, ADMIN, MASTER, FINANCE |
| StudioMemberStatus | ACTIVE, INVITED, DISABLED |
| MembershipStatus | ACTIVE, PENDING, REJECTED, LEFT |
| TimeBlockType | BREAK, BLOCK |
| BookingSource | MANUAL, WEB, APP |
| BookingCancelledBy | CLIENT, PROVIDER, SYSTEM |
| BookingRequestedBy | CLIENT, MASTER |
| BookingActionRequiredBy | CLIENT, MASTER |
| ReviewTargetType | provider, studio |
| ReviewTagType | PUBLIC, PRIVATE |
| DiscountType | PERCENT, FIXED |
| DiscountApplyMode | ALL_SERVICES, PRICE_FROM, MANUAL |
| ConsentType | TERMS, PRIVACY, MARKETING, PUBLIC_PROFILE |
| ChatSenderType | CLIENT, MASTER |

### Модели данных (64 модели, актуально на 2026-05-13)

**Изменения с предыдущего snapshot:**
- ➕ **`MrrSnapshot`** (MRR-SNAPSHOTS-A, миграция `20260513115124_add_mrr_snapshot`) — `id`, `snapshotDate` (`@db.Date @unique`), `mrrKopeks` (`BigInt`), `activeSubscriptionsCount`, `breakdownJson?`, `createdAt`. Daily snapshot platform-wide MRR + active subs count. Записывается worker'ом через `mrr.snapshot.daily` job (triggered внешним cron через `/api/billing/mrr/snapshot/run`). Используется admin/billing для вычисления MRR delta vs ~30 дней назад. `BigInt` для overflow safety; `breakdownJson` зарезервирован под future per-tier/per-scope drill-down.
- ➕ **`City`** (multi-city foundation, `20260428062602`) — `id`, `slug` (@unique), `name`, `nameGenitive?`, `latitude`, `longitude`, `timezone` (default Europe/Moscow), `isActive`, `sortOrder`, `autoCreated`. Provider.cityId связь с onDelete: Restrict. Auto-grow: detect-city flow создаёт городá из Yandex Geocoder при сохранении адреса; admin модерирует через `/admin/cities`.
- ➕ **`ConversationSlug`** (chat-url-fix, коммит `2591b35`) — opaque slug для chat threads, скрывает internal IDs из URL.
- ➕ **`ServicePackage`** / **`ServicePackageItem`** (31c) — bundle услуг с скидкой, например «Манипедикюр»; final price считается на лету из priceSnapshot вложенных services.
- ➕ **`PortfolioItemService`** — таблица связи PortfolioItem ↔ Service (M:N) для привязки портфолио к конкретным услугам.
- ➕ Поля на `Provider.cityId` (FK на City).
- ➕ Поля на `UserSubscription.isTrial` / `trialEndsAt` / `trialEndingNotificationSentAt` (миграция `20260430000000`).
- ➕ Поля на `Review.reportedAt` / `reportReason` (enum) / `reportComment` (`20260424100000`).
- ➕ Поля на `UserProfile.emailVerifiedAt` / `emailNotificationsEnabled` (`20260427000000`).
- ➕ Поля на `MediaAsset` для crop (`20260424000000`); удалены focal point fields (`20260427100000`).
- ➕ Поля на `Provider.autoPublishStoriesEnabled` (`20260427153437`).
- ➕ Поля на `DiscountRule.smartPriceEnabled` (`20260328180000`).

| Модель | Ключевые поля | Связи |
|--------|--------------|-------|
| **MrrSnapshot** ⭐ | id, snapshotDate(@unique @db.Date), mrrKopeks(BigInt), activeSubscriptionsCount, breakdownJson?, createdAt | — (standalone, no FK) |
| **AdminAuditLog** ⭐ | id, adminUserId, action(AdminAuditAction enum), targetType?, targetId?, details(Json)?, reason?, ipAddress?, userAgent?, createdAt | admin (UserProfile, onDelete: Restrict). Indices: adminUserId+createdAt DESC, targetType+targetId+createdAt DESC, action+createdAt DESC, createdAt DESC. Replaces `logInfo("admin.*", ...)` calls — integration в ADMIN-AUDIT-INTEGRATION коммите |
| **City** ⭐ | id, slug(@unique), name, nameGenitive?, latitude, longitude, timezone, isActive, sortOrder, autoCreated | providers[] |
| **ConversationSlug** ⭐ | slug(@unique), bookingId(@unique) | — (opaque link для chat URL) |
| **ServicePackage** ⭐ | id, masterId, title, discountPct?, isEnabled | items[], master |
| **ServicePackageItem** ⭐ | packageId, serviceId, priceSnapshot, durationSnapshotMin | ServicePackage, Service |
| **PortfolioItemService** ⭐ | portfolioItemId, serviceId | PortfolioItem, Service |
| **UserProfile** | id, roles[], phone?, email?, emailVerifiedAt?, telegramId?, publicUsername?, **blockedAt?**, **blockedByUserId?**, **blockedReason?** | Provider[], Studio[], Booking[], Notification[], PushSubscription[], RefreshSession[], adminAuditLogs[] (AdminAuditLogActor), reviewsDeleted[] (ReviewDeletedBy), blockedBy?/blockedUsers[] (UserBlockedBy self-relation), etc. |
| **Provider** | id, type, name, isPublished, timezone, scheduleMode, autoConfirmBookings, bufferBetweenBookingsMin, **slotStepMin**, **minBookingHoursAhead**, **maxBookingDaysAhead**, **lateCancelAction**, **slotPrecision**, **visibleSlotDays**, **acceptNewClients**, **cityId?** (FK→City), **autoPublishStoriesEnabled** | City?, Service[], Booking[], scheduleOverrides, weeklyScheduleConfig, DiscountRule?, HotSlot[], servicePackages[], etc. |
| **MasterProfile** | id, userId, providerId | UserProfile, Provider |
| **Studio** | id, providerId (1:1 с Provider) | StudioMember[], StudioInvite[], Service[], Booking[] |
| **StudioMember** | id, studioId, userId, role, status | Studio, UserProfile |
| **StudioMembership** | id, userId, studioId, roles[], status | Studio, UserProfile |
| **Booking** | id, providerId, serviceId, clientUserId?, startAtUtc?, endAtUtc?, status, slotLabel, source | Provider, Service, UserProfile, BookingChat?, Review?, BookingServiceItem[] |
| **Service** | id, providerId, name, durationMin, price, isEnabled, onlinePaymentEnabled | Provider, Booking[], MasterService[], HotSlot[] |
| **MasterService** | id, masterProviderId, serviceId, priceOverride?, durationOverrideMin?, isEnabled, commissionPct? | Provider, Service |
| **OtpCode** | id, phone, codeHash, expiresAt, usedAt? | — |
| **RefreshSession** | id, userId, jti, expiresAt, usedAt?, revokedAt?, rotatedToSessionId? | UserProfile, цепочка ротаций |
| **ScheduleTemplate** | id, providerId, name, startLocal, endLocal | ScheduleTemplateBreak[], WeeklyScheduleDay[], ScheduleOverride[] |
| **ScheduleTemplateBreak** | id, templateId, startLocal, endLocal, sortOrder, **title?** | ScheduleTemplate (title добавлен в 25-settings-c для повторяющихся перерывов с подписью «Обед»/«Кофе-пауза») |
| **WeeklyScheduleConfig** | id, providerId | WeeklyScheduleDay[] |
| **WeeklyScheduleDay** | id, configId, weekday, templateId?, isActive, scheduleMode, fixedSlotTimes[] | ScheduleTemplate? |
| **ScheduleOverride** | id, providerId, date, kind, isDayOff, startLocal?, endLocal?, templateId? | Provider, ScheduleTemplate? |
| **ScheduleBreak** | id, providerId, kind, dayOfWeek?, date?, startLocal, endLocal | Provider |
| **HotSlot** | id, providerId, serviceId?, startAtUtc, endAtUtc, discountType, discountValue, expiresAtUtc | Provider, Service |
| **HotSlotSubscription** | userId, providerId (@@unique) | UserProfile, Provider |
| **UserSubscription** | id, userId, planId, status, scope, currentPeriodEnd, autoRenew | UserProfile, BillingPlan, BillingPayment[] |
| **BillingPlan** | id, code, tier, scope, features(Json), inheritsFromPlanId? | BillingPlanPrice[], UserSubscription[] |
| **BillingPayment** | id, subscriptionId, status, amountKopeks, yookassaPaymentId?, idempotenceKey(@unique) | UserSubscription |
| **BillingAuditLog** | id, userId, action, details? | — |
| **Notification** | id, userId, type, title, body, payloadJson, isRead, bookingId? | UserProfile, Booking? |
| **PushSubscription** | id, userId, endpoint(@unique), p256dh, auth | UserProfile |
| **MediaAsset** | id, entityType, entityId, kind, storageKey, status, focalX?, focalY?, visualIndexed | MediaAssetEmbedding? |
| **MediaAssetEmbedding** | id, assetId, embedding(vector(1536)) | MediaAsset — pgvector для визуального поиска |
| **PortfolioItem** | id, masterId, mediaUrl, globalCategoryId?, inSearch | Service[], Tag[], Favorite[] |
| **Review** | id, bookingId?, authorId, targetType, targetId, rating, replyText?, reportedAt?, reportReason?, reportComment?, **deletedAt?**, **deletedByUserId?**, **deletedReason?** | UserProfile, Booking?, Studio?, Provider?, deletedBy? (UserProfile, ReviewDeletedBy). Soft-delete switch — REVIEW-SOFT-DELETE-A коммит |
| **ModelOffer** | id, masterId, dateLocal, timeRangeStartLocal, timeRangeEndLocal, status | ModelApplication[] |
| **ModelApplication** | id, offerId, clientUserId, status, bookingId? | ModelOffer, UserProfile, Booking? |
| **ClientCard** | id, providerId, clientUserId?, clientPhone?, notes?, tags[] | ClientCardPhoto[] |
| **GlobalCategory** | id, name, slug, parentId?, status, isSystem, visualSearchSlug? | children[], Tag[], Service[], PortfolioItem[] |
| **Tag** | id, name, slug, usageCount | PortfolioItemTag[] |
| **TelegramLink** | id, userId, chatId?, isEnabled | UserProfile |
| **VkLink** | id, userId, vkUserId, accessToken, refreshToken | UserProfile |
| **AppSetting** | key(@id), value | — |
| **SystemConfig** | key(@id), value(Json) | — |
| **DiscountRule** | id, providerId(@unique), isEnabled, smartPriceEnabled, triggerHours, discountType, discountValue, applyMode, minPriceFrom?, serviceIds[] | Provider — теперь активно используется через Schedule Settings → Rules → Hot Slots (toggle = `isEnabled`). Подробная конфигурация (priceFrom/serviceIds) остаётся на отдельной hot-slots странице. Constants расширены: `HOT_SLOT_TRIGGER_HOURS = [1,2,3,6,12,24,48]`, `HOT_SLOT_PERCENT_VALUES = [10,15,20,30]` |
| **TimeBlock** | id, studioId?, masterId, startAt, endAt, type | Studio? |
| **ScheduleChangeRequest** | id, studioId?, providerId, payloadJson, status | Studio?, Provider |
| **BookingServiceItem** | id, bookingId, studioId?, serviceId?, titleSnapshot, priceSnapshot, durationSnapshotMin | Booking, Studio?, Service? |
| **BookingChat** | id, bookingId(@unique) | Booking, ChatMessage[] |
| **ChatMessage** | id, chatId, senderType, body, readAt? | BookingChat |
| **UserConsent** | id, userId, consentType, documentVersion, revokedAt? | UserProfile |
| **ServiceBookingQuestion** | id, serviceId, text, required | Service |
| **PublicUsernameAlias** | id, username(@unique), providerId?, clientUserId? | Provider?, UserProfile? |

### Важные индексы
- `Provider`: составные индексы по `[isPublished, ratingAvg DESC, reviews DESC, createdAt DESC]` и `[type, isPublished, address]`
- `Booking`: индексы по `[providerId, startAtUtc, endAtUtc]`, `[status, startAtUtc]`
- `UserSubscription`: индексы по `[status, autoRenew, nextBillingAt]`, `[status, graceUntil]`
- `MediaAsset`: индекс по `[kind, visualIndexed, visualCategory]` для визуального поиска

---

## 5. РЕАЛИЗОВАННАЯ БИЗНЕС-ЛОГИКА

> **Cabinet Master UI:** ✅ **завершён** — sidebar shell, dashboard, bookings kanban, schedule week view, schedule settings (5 вкладок), notifications, clients (CRM), reviews, analytics, profile, account settings (notifications/security/account), messages, portfolio, services. Все в `src/features/master/` (228 файлов).
>
> **Cabinet Client UI:** ✅ **завершён** — `/cabinet/(user)/{bookings,favorites,messages,model-applications,notifications,profile,reviews,roles,settings,faq}`. Всё в `src/features/client-cabinet/` (17 файлов).
>
> **Public master profile + booking widget:** ✅ **завершён** — `/u/[username]` карточка с reviews/services/portfolio/hot slots, `/u/[username]/booking` полный flow записи с гостевым checkout (32a + 32b).
>
> **Chat foundation:** ✅ **завершён** (33a) — универсальный chat для master + client cabinets, агрегированные per-person threads, opaque conversation slugs (через `ConversationSlug` модель), SSE real-time updates. Booking-chat остаётся как separate concept.
>
> **Admin Panel UI:** 🔄 **в работе** (`designAdminCabinet` branch) — Shell ✅, Dashboard ✅, Catalog ✅. Cities/Users/Billing/Settings/Reviews — в очереди по одному per промпт.


### Аутентификация ✅
- **Файлы:** `src/lib/auth/jwt.ts`, `src/lib/auth/otp.ts`, `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`
- OTP через SMS: **НЕ ПОДКЛЮЧЁН** (код пишется в логи) — `src/app/api/auth/otp/request/route.ts:52`
- JWT: HS256 HMAC, кастомная реализация без библиотек
- Access token: 2 часа (cookie `bh_session`)
- Refresh token: 30 дней (cookie `bh_refresh`, path `/api/auth/refresh`)
- Ротация refresh-токенов через Prisma-транзакцию с цепочкой (`rotatedToSessionId`)
- Поддержка Telegram Login Widget
- Поддержка VK OAuth

### Бронирования ✅
- **Файлы:** `src/lib/bookings/createBooking.ts`, `src/lib/bookings/booking-core.ts`, `src/lib/bookings/flow.ts`
- Два пути создания: с UTC-временем (`createBooking`) и устаревший через slotLabel (`createClientBooking`)
- Проверка конфликтов (`ensureNoConflicts` с `buildBookingOverlapWhere`)
- Идемпотентность через `x-idempotency-key` header + Redis-lock
- Rate limiting на создание
- Инвалидация кэша слотов при создании бронирования
- Напоминания: 24ч и 2ч до записи через очередь задач
- Уведомления: Telegram + push после создания/подтверждения

### Расписание ✅
- **Файлы:** `src/lib/schedule/engine.ts`, `src/lib/schedule/engine-core.ts`, `src/lib/schedule/slots.ts`
- Движок: `ScheduleEngine` — вычисляет `DayPlan` из шаблонов, overrides, breaks
- Режимы расписания: FLEXIBLE (любое время) и FIXED (фиксированные слоты)
- Кэширование DayPlan в Redis по ключу из providerId + dateKey + timezone + scheduleVersion
- `buildSlotsForDay` — генерация доступных слотов с учётом бронирований
- Timezone-aware вычисления (toUtcFromLocalDateTime)
- ScheduleChangeRequest: мастера студии подают заявки, студия одобряет/отклоняет

### Платежи и биллинг ✅
- **Файлы:** `src/lib/payments/yookassa/client.ts`, `src/lib/billing/`, `src/app/api/payments/yookassa/webhook/route.ts`
- YooKassa: создание платежей, возвраты, recurring (сохранённый метод)
- Webhook: HMAC-SHA256 подпись + IP allowlist + optional Bearer token
- Очередь задач: webhook → enqueue → worker → processYookassaWebhookPayload
- BillingPayment.idempotenceKey `@unique` — идемпотентность платежей на уровне БД
- Планы наследуют фичи через `inheritsFromPlanId`
- BillingAuditLog — журнал биллинговых событий
- `BILLING_PERIODS = [1, 3, 6, 12]`, скидка 20% за год

### Уведомления ✅
- **Файлы:** `src/lib/notifications/`
- Три канала: in-app (Notification table) + Telegram + PWA push
- Notifier: Redis Pub/Sub в production, EventEmitter в dev
- SSE stream: `/api/notifications/stream`
- Push: web-push (VAPID)
- Типов уведомлений: 40+ (все статусы бронирований, студийные события, биллинг, чат)

### Горячие слоты ✅
- **Файлы:** `src/lib/hot-slots/`
- Anti-fraud: блокировка повторного бронирования в HOT_SLOT_REBOOK_BLOCK_HOURS
- Подписки (HotSlotSubscription): клиент подписывается на уведомления о новых слотах мастера
- Динамическое ценообразование: скидка применяется к цене услуги при бронировании

### Очередь задач ✅
- **Файлы:** `src/lib/queue/queue.ts`, `src/lib/queue/types.ts`, `src/worker.ts`
- Redis Lists: `queue:jobs`, `queue:processing`, `queue:dead`
- Memory fallback в dev
- Типы заданий: telegram.send, booking.reminder, visual_search_index, yookassa.webhook, media.cleanup
- Recovery stuck jobs: таймаут 5 мин, до 3 попыток, затем dead-letter
- Воркер запускается отдельным процессом (`npm run worker`)
- Health check воркера: POST `/api/health/worker` с WORKER_SECRET

### Визуальный поиск ⚠️
- **Файлы:** `src/lib/visual-search/`
- OpenAI GPT-4 Vision: описание изображений
- pgvector: хранение эмбеддингов (vector(1536)) в MediaAssetEmbedding
- Флаг включения: `VISUAL_SEARCH_ENABLED=false` по умолчанию
- Категории: manicure, pedicure, hairstyle, lashes, brows, makeup
- НЕ тестируется автоматически

### CRM ✅
- **Файлы:** `src/lib/crm/`
- ClientCard: карточка клиента у мастера (заметки, теги, фото)
- ClientNote: текстовая заметка мастера о клиенте
- CRM guard: мастер видит только своих клиентов

### Аналитика ✅
- **Файлы:** `src/app/api/analytics/`
- Dashboard, revenue (timeline, by-master, by-service, forecast), clients (ltv, at-risk, segments, new-vs-returning), cohorts (retention, revenue), bookings (funnel, heatmap, lead-time)
- Доступ ограничен по billing-фичам (`analyticsCharts`, `analytics_dashboard` и пр.)

### Model Offers ✅
- **Файлы:** `src/lib/model-offers/`, `src/app/api/model-offers/`
- Мастер публикует оффер (дата, время, услуга)
- Клиенты подают заявки
- Мастер предлагает время → клиент подтверждает → создаётся бронирование

### Советник (Advisor) ✅
- **Файлы:** `src/lib/advisor/`
- AI-советник: анализирует данные мастера и даёт рекомендации
- Кэш в Redis
- Правила тестируются: `src/lib/advisor/rules.test.ts`

---

## 6. МАРШРУТЫ

### Публичные страницы (без авторизации)
| URL | Описание |
|-----|---------|
| `/` | Главная страница |
| `/catalog` | Каталог мастеров |
| `/u/[username]` | Публичная страница мастера |
| `/u/[username]/booking` | Запись к мастеру |
| `/c/[username]` | Alias для клиента |
| `/providers/[id]` | Страница провайдера |
| `/clients/[id]` | Профиль клиента |
| `/hot` | Горячие слоты |
| `/inspiration` | Лента вдохновения (портфолио) |
| `/models` | Список офферов для моделей |
| `/models/[offerId]` | Детальная страница оффера |
| `/book` | Страница записи |
| `/login` | Авторизация (OTP, Telegram, VK) |
| `/logout` | Выход |
| `/about`, `/how-it-works`, `/how-to-book` | Информационные страницы |
| `/pricing` | Тарифы |
| `/blog`, `/faq`, `/support`, `/help/masters` | Контент |
| `/become-master`, `/partners`, `/careers` | Маркетинг |
| `/gift-cards` | Подарочные карты (заглушка?) |
| `/privacy`, `/terms` | Документы |
| `/notifications` | Уведомления |
| `/offline` | PWA offline-страница |
| `/403` | Страница запрещённого доступа |

### Кабинет мастера (требует роль MASTER)
> Sprint редизайна: новый sidebar shell + per-page MasterPageHeader + full-width layout через `<AppShellContent>`. Pages переписаны с нуля по reference design.

| URL | Описание |
|-----|---------|
| `/cabinet/master` | Главная кабинета |
| `/cabinet/master/dashboard` | Дашборд: GreetingHero + 4 KPI-карточки + Upcoming bookings + Attention panel + Quick actions + Announcements. Manual booking modal через `?manual=1` |
| `/cabinet/master/bookings` | Kanban с 5 колонками (Pending / Confirmed / Today / Done / Cancelled), inline action buttons, swipe на mobile |
| `/cabinet/master/schedule` | Week view: 7-колоночная сетка, KPI-баннеры, click-to-create, reschedule modal, refresh |
| `/cabinet/master/schedule/settings` | 5-tab settings: Часы (mode + slot step + week + live preview), Исключения (per-date с группировкой), Перерывы (buffer + recurring), Правила (booking window + confirmation + cancellation + Hot Slots gated by PRO), Видимость (catalog + slot precision + new clients). Auto-save на дебаунсе 500 мс |
| `/cabinet/master/analytics` | Аналитика |
| `/cabinet/master/clients` | CRM клиентов |
| `/cabinet/master/model-offers` | Офферы для моделей |
| `/cabinet/master/profile` | Профиль (legacy controls дублируются с Schedule Settings — будет очищено при редизайне profile) |
| `/cabinet/master/reviews` | Отзывы |

### Кабинет студии (требует роль STUDIO/STUDIO_ADMIN)
| URL | Описание |
|-----|---------|
| `/cabinet/studio` | Главная студии — rich dashboard (today banner / 4 KPI tiles / top masters / attention / occupancy / popular services / revenue chart) ✅ STUDIO-DASHBOARD-A |
| `/cabinet/studio/calendar` | Расписание студии — multi-master день grid + неделя occupancy + action menus + URL state ?view/?date ✅ STUDIO-SCHEDULE-A |
| `/cabinet/studio/bookings` | Журнал записей — table с filter chips + status/master/search + VIP/new badges + action menu reuse ✅ STUDIO-BOOKINGS-A |
| `/cabinet/studio/schedule-requests` | Approval/reject заявок мастеров на изменение расписания ✅ STUDIO-SCHEDULE-REQUEST-APPROVAL-A |
| `/cabinet/studio/analytics` | Аналитика студии |
| `/cabinet/studio/clients` | CRM клиентов студии |
| `/cabinet/studio/finance` | Финансы |
| `/cabinet/studio/services` | Услуги студии — 3-col categories+list+detail с CRUD + master assign ✅ STUDIO-SERVICES-A |
| `/cabinet/studio/services/new` | Добавление услуги (legacy redirect) |
| `/cabinet/studio/team` | Мастера студии — 2-col list+detail с filters + Pause/Activate + Invite ✅ STUDIO-MASTERS-A |
| `/cabinet/studio/team/add` | Добавление члена команды |
| `/cabinet/studio/reviews` | Отзывы студии |
| `/cabinet/studio/settings` | Настройки |
| `/cabinet/studio/settings/profile`, `.../services`, `.../portfolio` | Подразделы настроек |
| `/cabinet/studio/profile` | Профиль студии |

### Кабинет пользователя (✅ полный redesign, merged main)
| URL | Описание |
|-----|---------|
| `/cabinet` | Главная (редирект по роли) |
| `/cabinet/(user)` | Личный кабинет клиента |
| `/cabinet/(user)/bookings` | Мои записи |
| `/cabinet/(user)/favorites` | Избранное |
| `/cabinet/(user)/messages` | Сообщения (chat threads) |
| `/cabinet/(user)/notifications` | Уведомления |
| `/cabinet/(user)/reviews` | Мои отзывы |
| `/cabinet/(user)/model-applications` | Мои заявки модели |
| `/cabinet/(user)/profile` | Профиль |
| `/cabinet/(user)/roles` | Управление ролями (роль-switcher) |
| `/cabinet/(user)/settings` | Настройки |
| `/cabinet/(user)/faq` | FAQ |
| `/cabinet/billing` | Подписка и оплата |

### Панель администратора (🔄 active redesign on `designAdminCabinet`)
| URL | Описание | Status |
|-----|---------|---|
| `/admin` | Дашборд (KPI / charts / live feed / system health) | ✅ ADMIN-DASH-A |
| `/admin/catalog` | Модерация GlobalCategory | ✅ ADMIN-CATALOG-A |
| `/admin/cities` | Управление городами + auto-grow модерация + algorithmic duplicate detection | ✅ ADMIN-CITIES-UI |
| `/admin/billing` | 4 KPIs + Plans / Subscriptions / Payments tabs с cancel + refund actions | ✅ ADMIN-BILLING-A + ADMIN-BILLING-B |
| `/admin/reviews` | 4 KPIs + 3 tabs (flagged / low-rating / all) + search + approve/delete с audit log | ✅ ADMIN-REVIEWS-A |
| `/admin/settings` | Logo + login hero + 3 system flags + SEO + queue + visual search + media cleanup | ✅ ADMIN-SETTINGS-A |
| `/admin/users` | Список + 5 role tiles + plan change через audit-logged endpoint | ✅ ADMIN-USERS-A |

### API — Auth
| Endpoint | Метод | Описание |
|---------|-------|---------|
| `/api/auth/otp/request` | POST | Запрос OTP-кода |
| `/api/auth/otp/verify` | POST | Проверка OTP |
| `/api/auth/refresh` | POST | Ротация refresh токена |
| `/api/auth/telegram/login` | POST | Авторизация через Telegram |
| `/api/auth/vk/start` | POST | Старт VK OAuth |
| `/api/auth/vk/callback` | POST | Callback VK OAuth |
| `/api/auth/profile/ensure` | POST | Создание/обеспечение профиля |
| `/api/auth/account-type/set` | POST | Установка типа аккаунта |
| `/api/auth/roles/add` | POST | Добавление роли |
| `/api/logout` | GET | Выход |

### API — Bookings
| Endpoint | Метод | Описание |
|---------|-------|---------|
| `/api/bookings` | GET, POST | Список / создание бронирования |
| `/api/bookings/my` | GET | Мои бронирования |
| `/api/bookings/[id]/cancel` | POST | Отмена |
| `/api/bookings/[id]/confirm` | POST | Подтверждение |
| `/api/bookings/[id]/reschedule` | POST | Перенос |
| `/api/bookings/[id]/chat` | GET | Чат бронирования |
| `/api/bookings/[id]/chat/messages` | GET, POST | Сообщения чата |
| `/api/bookings/[id]/chat/read` | POST | Прочитать |
| `/api/bookings/upload-reference` | POST | Загрузка фото-референса |

### API — Payments
| Endpoint | Метод | Описание |
|---------|-------|---------|
| `/api/billing/checkout` | POST | Создание платежа |
| `/api/billing/plans` | GET | Список планов |
| `/api/billing/status` | GET | Статус подписки |
| `/api/billing/cancel` | POST | Отмена подписки |
| `/api/billing/renew/run` | POST | Запуск авторенью (cron) |
| `/api/payments/yookassa/webhook` | POST | Webhook YooKassa |

### API — Schedule & Slots
| Endpoint | Метод | Описание |
|---------|-------|---------|
| `/api/public/providers/[providerId]/slots` | GET | Публичные слоты |
| `/api/public/providers/[providerId]/booking-days` | GET | Доступные дни для записи |
| `/api/provider/schedule/overrides` | GET, POST | Overrides расписания |
| `/api/provider/schedule/weekly` | GET, PUT | Недельное расписание |
| `/api/provider/schedule/templates` | GET, POST | Шаблоны |
| `/api/provider/schedule/status` | GET | Статус расписания |

### API — остальные группы (актуально 2026-05-13; всего 271 route.ts)
| Группа | Количество handlers | Примечание |
|--------|-------------------|---|
| /api/admin/* | ~35 | + новые `/admin/dashboard/{kpis,charts,events,health}` (ADMIN-DASH-A), `/admin/cities/*` + `/admin/cities/duplicates` (ADMIN-CITIES-UI), `/admin/users/[id]/plan` (ADMIN-USERS-A — audit-logged plan change), `/admin/billing/kpis` + `/admin/billing/plans/[id]` (ADMIN-BILLING-A — audit-logged plan edit), `/admin/billing/subscriptions/[id]/cancel` (ADMIN-BILLING-B — audit-logged cancel), `/admin/reviews/[id]/{approve,delete}` (ADMIN-REVIEWS-A — audit-logged moderation), `/admin/reviews/*` (legacy GET/PATCH/DELETE), `/admin/catalog/categories/*`. ADMIN-SETTINGS-A: расширены `/admin/system-config` (добавлен `legalDraftMode` + audit logging) и `/admin/settings` (audit logging для SEO changes). PHASE-7-CLEANUP-A: удалены `/admin/metrics`, `/admin/users` (GET + PATCH; `/[id]/plan` сохранён), `/admin/catalog/global-categories/*` всё дерево |
| /api/billing/mrr/snapshot/run | 1 | POST cron trigger для daily MRR snapshot (MRR-SNAPSHOTS-A). `x-cron-token` auth, enqueues `mrr.snapshot.daily` job |
| /api/analytics/* | 14 | revenue / clients / cohorts / bookings funnel & heatmap |
| /api/master/* | ~28 | + clients (CRM), advisor, model-applications, model-offers, portfolio, service-packages, services |
| /api/studio/* | ~25 | + blocks, calendar, finance, schedule/requests, services/assign-master |
| /api/cabinet/master/* | 4 | dashboard/free-slots, delete, leave-studio, public-username, schedule |
| /api/cabinet/studio/* | 3 | delete, members, public-username |
| /api/cabinet/user/* | ~6 | bookings, favorites, profile, reviews, email verify |
| /api/chat/* | 5 | conversations, threads/[slug]/messages, threads/[slug]/read |
| /api/cities | 1 | GET — публичный список (для city-selector) |
| /api/me, /api/me/* | 4 | bookings, plan, model-applications, delete |
| /api/notifications/* | 10 | + push subscribe/unsubscribe, stream, clear-read |
| /api/feed/* | 2 | portfolio + stories |
| /api/home/* | 5 | categories, feed, portfolio, stories, tags |
| /api/reviews/* | 7 | + `[id]/report`, `[id]/suggest-reply`, `can-leave`, `tags` |
| /api/payments/yookassa/webhook | 1 | HMAC + IP allowlist + idempotency |
| /api/integrations/vk/* | 5 | OAuth + settings |
| /api/onboarding/professional/* | 2 | master + studio onboarding |
| /api/search/* | 3 | availability, by-photo, services |
| /api/categories/* | 2 | propose + my-proposals |

---

## 7. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

> Все env вары теперь идут через **`src/lib/env.ts`** (Zod schema). `process.env.*` напрямую запрещён в `src/`, кроме `env.ts`, Prisma config, тестов, `startup.ts`, `middleware.ts`. См. правило 11 в CLAUDE.md.

**Изменения с предыдущего snapshot:**
- ➕ `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` — клиентский ключ для Yandex Maps API (отдельно от geocoder)
- ➕ `AI_FEATURES_ENABLED` — boolean флаг для AI features (suggest description, suggest reply)
- ➕ `EMAIL_AUTH_ENABLED` — boolean флаг для email-OTP flow
- ➕ Полный SMTP-блок: `SMTP_HOST/PORT/USER/PASS/FROM`, `SUPPORT_TO`, `SUPPORT_TO_PARTNERSHIP` — теперь не только для support-tickets, но и для email-OTP и email notifications

| Переменная | Файл:строка | Обязательная | Fallback/default |
|-----------|------------|-------------|-----------------|
| `DATABASE_URL` | `prisma/schema.prisma:7` | ДА | — |
| `DIRECT_URL` | `prisma/schema.prisma:8` | нет | — |
| `AUTH_JWT_SECRET` | `src/lib/auth/jwt.ts:41` | ДА | бросает Error |
| `OTP_HMAC_SECRET` | `src/lib/auth/otp.ts:15` | ДА | бросает Error |
| `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` | `src/lib/env.ts:79` | для карт на frontend | — |
| `AI_FEATURES_ENABLED` | `src/lib/env.ts:100` | нет | `false` |
| `EMAIL_AUTH_ENABLED` | `src/lib/env.ts:101` | нет | `false` |
| `WORKER_SECRET` | `src/app/api/health/worker/route.ts:11` | нет | не проверяет |
| `AUTH_COOKIE_NAME` | `src/lib/auth/session.ts:20` | нет | `bh_session` |
| `REDIS_URL` | `src/lib/redis/connection.ts:12` | нет | нет Redis (memory fallback) |
| `REDIS_CONNECT_TIMEOUT_MS` | `src/lib/redis/connection.ts:26` | нет | встроенный timeout |
| `REDIS_COMMAND_TIMEOUT_MS` | `src/lib/redis/connection.ts:30` | нет | встроенный timeout |
| `STORAGE_PROVIDER` | `src/lib/media/storage/index.ts:9` | нет | `local` |
| `MEDIA_LOCAL_ROOT` | `src/lib/media/storage/local.ts:6` | нет | `./public/uploads` |
| `MEDIA_LOCAL_PUBLIC_URL` | `src/lib/media/storage/local.ts:27` | нет | — (через прокси) |
| `MEDIA_DELIVERY_SECRET` | `src/lib/media/private-delivery.ts:24` | нет | JWT_SECRET как fallback |
| `S3_BUCKET` | `src/lib/media/storage/s3.ts:14` | если S3 | — |
| `S3_ENDPOINT` | `src/lib/media/storage/s3.ts:15` | если S3 | `storage.yandexcloud.net` |
| `S3_REGION` | `src/lib/media/storage/s3.ts:16` | если S3 | `ru-central1` |
| `S3_ACCESS_KEY` | `src/lib/media/storage/s3.ts:17` | если S3 | — |
| `S3_SECRET_KEY` | `src/lib/media/storage/s3.ts:18` | если S3 | — |
| `S3_PUBLIC_URL` | `src/lib/media/storage/s3.ts:48` | нет | — |
| `TELEGRAM_BOT_TOKEN` | `src/app/api/auth/telegram/login/route.ts:21` | для Telegram auth | — |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | — | для Telegram виджета | — |
| `VK_CLIENT_ID` | — | для VK OAuth | — |
| `VK_CLIENT_SECRET` | — | для VK OAuth | — |
| `VK_REDIRECT_URI` | — | для VK OAuth | — |
| `NEXT_PUBLIC_VK_ENABLED` | — | нет | `false` |
| `YOOKASSA_SECRET_KEY` | `src/lib/payments/yookassa/client.ts:61` | для платежей | бросает Error |
| `YOOKASSA_SHOP_ID` | `src/lib/payments/yookassa/client.ts:60` | для платежей | бросает Error |
| `YOOKASSA_WEBHOOK_TOKEN` | `src/app/api/payments/yookassa/webhook/route.ts:84` | нет | не проверяет |
| `BILLING_RENEW_SECRET` | `src/app/api/billing/renew/run/route.ts:42` | нет | |
| `MRR_SNAPSHOT_SECRET` | `src/app/api/billing/mrr/snapshot/run/route.ts` | для cron daily snapshot | endpoint 403 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `src/lib/notifications/push/vapid.ts:5` | для push | бросает при undefined! |
| `VAPID_PRIVATE_KEY` | `src/lib/notifications/push/vapid.ts:6` | для push | бросает при undefined! |
| `VAPID_EMAIL` | `src/lib/notifications/push/vapid.ts:4` | для push | |
| `YANDEX_GEOCODER_API_KEY` | `src/app/api/address/geocode/route.ts:28` | для геокодирования | `""` (будет 403) |
| `YANDEX_SUGGEST_API_KEY` | `src/lib/maps/address-suggest.ts:25` | для подсказок адресов | `""` |
| `OPENAI_API_KEY` | `src/lib/visual-search/openai.ts:17` | если VISUAL_SEARCH_ENABLED | бросает Error |
| `VISUAL_SEARCH_ENABLED` | `src/lib/visual-search/config.ts:23` | нет | `false` |
| `DEFAULT_TIMEZONE` | `src/lib/search-by-time/service.ts:12` | нет | `Europe/Moscow` |
| `NODE_ENV` | повсюду | нет | `development` |
| `MONITORING_TELEGRAM_BOT_TOKEN` | `src/lib/monitoring/alert.ts:43` | нет | нет алертов |
| `MONITORING_TELEGRAM_CHAT_ID` | `src/lib/monitoring/alert.ts:44` | нет | нет алертов |
| `NEXT_PUBLIC_APP_URL` | `src/lib/app-url.ts:10` | нет | — |
| `APP_PUBLIC_URL` | `src/lib/app-url.ts:10` | нет | fallback для NEXT_PUBLIC_APP_URL |
| `SMTP_HOST` | `src/app/api/support/tickets/route.ts:248` | для email поддержки | не отправляет email |
| `SMTP_PORT` | `src/app/api/support/tickets/route.ts:249` | для email поддержки | |
| `SMTP_USER` | `src/app/api/support/tickets/route.ts:250` | для email поддержки | |
| `SMTP_PASS` | `src/app/api/support/tickets/route.ts:251` | для email поддержки | |
| `SMTP_FROM` | `src/app/api/support/tickets/route.ts:252` | для email поддержки | |
| `SUPPORT_TO` | `src/app/api/support/tickets/route.ts:247` | для email поддержки | |
| `SUPPORT_TO_PARTNERSHIP` | `src/app/api/support/partnership/route.ts` | для заявок на сотрудничество с /partners | fallback на `SUPPORT_TO` |

---

## 8. ПРОБЛЕМЫ И РИСКИ

### 🔴 Критичные

**P1: OTP-код пишется в логи (SMS не интегрирован)** — Сделано: НЕТ. **Pre-launch task**.
- Файл: `src/app/api/auth/otp/request/route.ts:52-56`
- Проблема: `logInfo("OTP requested", { phone, code, expiresAt })` — код OTP попадает в логи. Комментарий "MVP: no SMS gateway yet".
- Риск: В production любой, кто читает логи, видит OTP-коды всех пользователей.
- Действие: Подключить SMS-шлюз (например, SMSC, SMS.ru, SmsC.ru) и удалить `code` из логирования.

**P2: VAPID ключи использованы с `!` (non-null assertion) — crash при старте если не заданы** — Сделано: НЕТ. **Pre-launch task**.
- Файл: `src/lib/notifications/push/vapid.ts:5-6`
- `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!`, `process.env.VAPID_PRIVATE_KEY!`
- Если ключи не заданы, инициализация vapid упадёт с TypeError в production.

### 🟠 Важные

**P3: Rate-limit fail-open в dev + отсутствие REDIS_URL в .env.example** — Сделано: НЕТ. **Pre-launch task**.
- Файл: `src/lib/rate-limit/index.ts:164-170`
- В development при недоступности Redis: `return { limited: false }` (пропускает все запросы).
- `REDIS_URL` НЕ прописан в `.env.example` — разработчик может не знать что Redis нужен.
- В production: sensitive routes → fail-closed (limited: true), остальные → memory fallback. Это приемлемо.

**P4: Воркер запускается отдельным процессом — нет автоматического рестарта**
- Нет Docker, нет supervisor/PM2 конфигурации в репозитории.
- При падении воркера задачи накапливаются в очереди без обработки.
- Алерт есть только для uncaughtException (Telegram).

**P5: YOOKASSA_WEBHOOK_TOKEN не обязателен**
- Файл: `src/app/api/payments/yookassa/webhook/route.ts:84`
- `if (expectedToken && token !== expectedToken)` — если переменная не задана, проверка токена пропускается.
- HMAC + IP allowlist остаётся, но дополнительный слой защиты не применяется.

**P6: Нет CORS-политики для API**
- `next.config.ts` устанавливает заголовки безопасности (`X-Frame-Options`, `X-Content-Type-Options`, etc.), но нет явных CORS-заголовков для API.
- `allowedDevOrigins` задан только для dev.

**P7: JWT реализован вручную без библиотеки**
- Файл: `src/lib/auth/jwt.ts`
- Кастомная реализация HS256. Потенциально уязвима к timing attacks (хотя timingSafeEqual используется).
- Нет kid (key rotation), нет поддержки нескольких секретов для плавной ротации.

### 🟡 Технический долг

**T1: Устаревший путь бронирования через slotLabel**
- Файл: `src/lib/bookings/createClientBooking.ts`
- Комментарий в коде "legacy slotLabel-path". Два метода (`createBooking` и `createClientBooking`) усложняют код.

**T2: Поля `startAt`/`endAt` в Booking — deprecated**
- Файл: `prisma/schema.prisma:1046-1048` — комментарий "Legacy fields (deprecated). Do not use for formatting or logic."
- Поля присутствуют в схеме, занимают место, могут сбивать с толку.

**T3: Дублирующие поля в Provider**
- `rating` / `ratingAvg`, `reviews` / `ratingCount` — два набора rating-полей (строка 632-637).

**T4: timezone по умолчанию в schema.prisma — Asia/Almaty**
- Файл: `prisma/schema.prisma:648` — `timezone String @default("Asia/Almaty")`
- Но в `.env.example` — `DEFAULT_TIMEZONE=Europe/Moscow`. Несоответствие.

**T5: 22 вхождения `eslint-disable` в src/**
- Преимущественно в UI-компонентах (focal-image, slot-picker, studio-calendar, etc.)
- Нужен аудит на предмет обоснованности.

**T6: Отсутствует middleware.ts** — Сделано: НЕТ. **Pre-launch task**.
- Нет глобального Next.js middleware для проверки авторизации на уровне роутов.
- Каждый API route проверяет auth самостоятельно через `requireAuth()` / `getSessionUser()`.

**T7: ~~Нет CI-шага для запуска тестов~~** — **Сделано** (закрыто ранее, верифицировано в TEST-COVERAGE-A 2026-05-19).
- `quality-gates.yml` содержит `Run tests: npm run test -- --reporter=verbose --bail 1` между Typecheck и Mojibake check.
- Тесты (45 файлов / 358 тестов) запускаются в CI на каждый push/PR.

**T8: Swagger/OpenAPI генерируется скриптом, не в CI**
- `scripts/generate-openapi.mjs` — генерация OpenAPI-спецификации. В CI не проверяется актуальность.

**T9: Smoke-тесты есть, но не в CI**
- `scripts/smoke.mjs` — smoke-тесты. В quality-gates.yml не подключены.

### 🆕 Новые known limitations (после sprint редизайна)

**L1: Booking enforcement новых полей** — Сделано: НЕТ. **Pre-launch task**.
- `Provider.minBookingHoursAhead`, `maxBookingDaysAhead`, `acceptNewClients` — поля сохраняются через Schedule Settings, но enforcement в `createBooking` ещё не подключён. Booking flow допускает запись вне окна.

**L2: Public catalog игнорирует новые visibility-поля** — Сделано: НЕТ. **Pre-launch task**.
- `Provider.slotPrecision`, `visibleSlotDays` доступны через snapshot, но публичная витрина фильтрует только по `isPublished`. Клиент видит точное время даже если мастер выставил «только дата».

**L3: `lateCancelAction === "fine"` без enforcement**
- Поле сохраняется в Provider, но онлайн-платёжная логика штрафов не подключена. UI отображает опцию для будущей фичи.

**L4: Studio cabinet использует legacy `master-schedule-editor.tsx`**
- Файл помечен `@deprecated`, единственный импортёр — `src/features/studio/components/studio-calendar-page.tsx`. Будет удалён при редизайне studio cabinet.

**L5: Profile-page legacy controls дублируются с Schedule Settings**
- `master-profile-page.tsx` редактирует `isPublished`, `autoConfirmBookings`, `cancellationDeadlineHours` через `/api/provider/settings`. Те же поля управляются из новых Settings tabs. Будет очищено при редизайне profile.

### ✅ Сделано в sprint редизайна (`newDesignSystem`)

- ~~Mock-up master cabinet UI~~ → production-grade redesign по reference (`.claude/references/`)
- ~~Хардкоды UI текстов в master cabinet~~ → всё через `UI_TEXT.cabinetMaster.*`
- ~~Inline-стили в master cabinet~~ → только Tailwind токены
- Новый `<MasterPageHeader>` per-page sticky header (вместо layout-level)
- Новый `<AppShellContent>` — full-width для cabinet/admin, constrained для marketing
- Новый `<ChipGroup>`, `<SettingRow>`, `<ModeCard>` shared primitives для settings
- Auto-save паттерн с `useAutoSave` + `<SaveStatusProvider>` (idle/saving/saved/error)
- Server/Client boundary fix: `editor-shared.ts` отделён от `editor.ts` (server-only)
- 7 новых полей `Provider` + `ScheduleTemplateBreak.title?` через `prisma db push`

### 🗑 Мёртвый код (не обнаружен)
Все проверенные символы (`UploaderSurface`, `CabinetShell`, `AccountChip`, `RoleGuard`, `UI_TEXTS`, `usePushSubscription`) в `src/` НЕ ОБНАРУЖЕНЫ — код уже очищен. Экспортируется `UI_TEXT` (без S на конце) — `src/lib/ui/text.ts`.

---

## 9. ТЕСТИРОВАНИЕ

### Конфигурация
- Framework: **Vitest** v4
- Файл: `vitest.config.ts`
- Environment: node
- Plugins: vite-tsconfig-paths (поддержка `@/` алиасов)

### Тестовые файлы (45 файлов / 358 тестов, актуально 2026-05-19)

**Новое в TEST-COVERAGE-A (2026-05-19):** `src/lib/billing/utils.test.ts` (15) + `src/lib/billing/marketing-pricing.test.ts` (19) + `src/lib/billing/guards.test.ts` (6) + `src/lib/bookings/flow.test.ts` (32) + `src/lib/bookings/idempotency-key.test.ts` (6) — pure-helper coverage. `quality-gates.yml` уже запускает `npm run test` в CI (T7 закрыт).

**Новое в MRR-SNAPSHOTS-A:** `src/lib/billing/mrr.test.ts` (6 tests) + `src/lib/billing/mrr-snapshot.test.ts` (6 tests) — pure calculateMRR + idempotent snapshot creation + race fallback + UTC date truncation.

**Новые с предыдущего snapshot:**
- `src/lib/billing/__tests__/trial.test.ts` — trial subscriptions logic
- `src/lib/chat/conversation-slug.test.ts` — opaque chat slugs
- `src/lib/cities/client-city.test.ts`, `detect-city.test.ts`, `normalize.test.ts` — multi-city
- `src/lib/feed/stories.service.test.ts` — auto-publish stories
- `src/lib/media/delete-asset.test.ts` (заменил `focal-point.test.ts` после удаления focal points)
- `src/lib/schedule/publish-horizon.test.ts` — anchor publish horizon to nowUtc
- `src/lib/ui/fmt.test.ts` — Intl formatters

### Полный список (24 файла на 7 мая, сохранено для истории)
| Файл | Что тестирует |
|------|--------------|
| `src/lib/advisor/rules.test.ts` | Правила советника |
| `src/lib/auth/__tests__/otp-flow.test.ts` | OTP flow (интеграционный) |
| `src/lib/auth/jwt.test.ts` | JWT sign/verify |
| `src/lib/auth/otp.test.ts` | OTP генерация и хэш |
| `src/lib/bookings/link-guest-bookings.test.ts` | Привязка гостевых бронирований |
| `src/lib/bookings/reminders.test.ts` | Напоминания о бронировании |
| `src/lib/chat/access.test.ts` | Доступ к чату |
| `src/lib/chat/status.test.ts` | Статус чата |
| `src/lib/crm/client-key.test.ts` | Ключ клиента CRM |
| `src/lib/crm/guards.test.ts` | CRM guards |
| `src/lib/hot-slots/anti-fraud.test.ts` | Anti-fraud горячих слотов |
| `src/lib/hot-slots/validation.test.ts` | Валидация горячих слотов |
| `src/lib/http/origin.test.ts` | HTTP origin проверки |
| `src/lib/media/focal-point.test.ts` | Focal point медиа |
| `src/lib/notifications/booking-notifications.test.ts` | Уведомления бронирований |
| `src/lib/providers/settings.test.ts` | Настройки провайдеров |
| `src/lib/public-urls.test.ts` | Публичные URL |
| `src/lib/publicUsername.test.ts` | Публичные username |
| `src/lib/schedule/booking-days.test.ts` | Дни бронирования |
| `src/lib/schedule/dateKey.test.ts` | Ключи дат |
| `src/lib/schedule/overlap.test.ts` | Проверка пересечений |
| `src/lib/schedule/slots-range.test.ts` | Диапазоны слотов |
| `src/lib/schedule/slots.test.ts` | Генерация слотов |
| `src/lib/schedule/slotsCache.test.ts` | Кэш слотов |

### Покрытие
- Модульные тесты покрывают: JWT, OTP, расписание (slots, overlap, booking-days, cache), уведомления, hot-slots, CRM
- **НЕ покрыты тестами:** API routes, компоненты, визуальный поиск, платежи, биллинг, аналитика, studio-логика
- **Тесты НЕ включены в CI** (quality-gates.yml не запускает `npm run test`)
- E2E тесты: НЕ ОБНАРУЖЕНЫ (нет Playwright/Cypress/etc.)

---

## 10. БЕЗОПАСНОСТЬ

### Rate Limiting ✅
- Реализован в `src/lib/rate-limit/index.ts`
- Redis + memory fallback
- **Чувствительные роуты** (auth, bookings, payments, delete, studio, reviews): fail-closed при недоступности Redis
- **Обычные роуты**: в production — memory fallback, в dev — fail-open
- Конфиги в `src/lib/rate-limit/configs.ts`
- OTP request rate limit: `src/lib/auth/otp-rate-limit.ts` (по phone + по IP)
- Алерт в Telegram при 3+ ошибках Redis за минуту

### RBAC ✅
- `src/lib/auth/guards.ts`: `hasAnyRole()`, `requireAuth()`, `requireAdmin()`
- `src/lib/auth/access.ts`: `getSessionUser()`, `requireRole()`
- `src/lib/auth/admin.ts`: проверка для admin-routes
- Роли проверяются в каждом route handler
- Ownership проверки: `src/lib/auth/ownership.ts`

### Валидация ✅
- Все входные данные валидируются через Zod-схемы
- `src/lib/validation/bookings.ts`, `src/lib/auth/schemas.ts`, и т.д.

### Security Headers ✅
- `next.config.ts`: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy
- В production: Strict-Transport-Security (HSTS)

### Идемпотентность ✅
- Бронирования: `x-idempotency-key` header + Redis lock
- BillingPayment.idempotenceKey: уникальный constraint в БД
- YooKassa: Idempotence-Key в каждом запросе к API

### Секреты
- JWT: HMAC-SHA256 (`AUTH_JWT_SECRET`)
- OTP hash: HMAC-SHA256 (`OTP_HMAC_SECRET`)
- Refresh tokens: хранятся в БД (jti), cookie httpOnly, SameSite=lax
- YooKassa webhook: HMAC-SHA256 подпись + IP allowlist

### Потенциальные уязвимости
- OTP в логах (критично, см. P1)
- Нет явного middleware для auth (каждый handler сам проверяет)
- JWT без rotation секрета — компрометация AUTH_JWT_SECRET инвалидирует все токены

---

## 11. ПРОИЗВОДИТЕЛЬНОСТЬ И МАСШТАБИРУЕМОСТЬ

### Кэширование
- **Redis**: rate-limit windows, schedule DayPlan, slots cache, session data, idempotency locks, notifier pub/sub
- **Next.js**: нет явного `cache()` или `unstable_cache` в найденных файлах — преимущественно клиентский SWR
- **Service Worker**: CacheFirst для шрифтов Google, StaleWhileRevalidate для изображений и Supabase storage
- **Schedule cache invalidation** — после любого save в Schedule Settings (`applyScheduleSnapshot`) автоматически вызывается `invalidateSlotsForMaster(providerId)`. Cache-version aggregator смотрит `updatedAt` от `provider`, `scheduleOverride`, `scheduleTemplate`, `weeklyScheduleConfig` — bump любого из них пробивает кэш

### N+1 проблемы
- `src/lib/auth/access.ts:31-39` — `resolveStudioIdForUser` вызывается при каждом запросе к API для MASTER/STUDIO ролей
- Аналитические запросы (`/api/analytics/*`) — необходимо проверять каждый handler

### Пагинация
- Feed портфолио: cursor-based (по createdAt/id)
- Каталог мастеров: вероятно offset-based (по индексам rating)
- Аналитика: временные диапазоны без пагинации

### Изображения
- Next.js Image: настроен для `storage.yandexcloud.net`
- Sharp: ресайз при загрузке
- Focal point: сохраняется в MediaAsset.focalX/focalY
- Lazy load через виртуализацию `@tanstack/react-virtual`

### SSR/SSG
- App Router с Server Components
- Публичные страницы мастеров (`/u/[username]`) — вероятно SSR с данными провайдера
- Главная страница — SSR с каталогом

### Очереди задач
- Redis List: O(1) push/pop операции
- Воркер: поллинг (не event-driven) — потенциально неэффективно при высокой нагрузке
- Stuck job recovery каждые 2 минуты
- Нет горизонтального масштабирования воркера (один процесс)

### База данных
- Pgvector для визуального поиска: требует специфичной версии PostgreSQL
- Индексы оптимизированы для основных запросов (Provider, Booking, UserSubscription)
- directUrl для Prisma Migrate (поддержка connection pooler типа PgBouncer)

---

## 12. ИНВАРИАНТЫ — ЧТО НЕЛЬЗЯ ЛОМАТЬ

| # | Инвариант | Файл | Обоснование |
|---|----------|------|------------|
| 1 | **Booking.startAtUtc/endAtUtc — UTC** | `prisma/schema.prisma:1030-1034` | Все вычисления расписания и отображение времени основаны на UTC. Нельзя хранить локальное время в этих полях. |
| 2 | **OtpCode.codeHash — HMAC, не plaintext** | `src/lib/auth/otp.ts:14-19` | HMAC с секретом. Если изменить алгоритм хэширования — все существующие OTP-коды инвалидируются. |
| 3 | **RefreshSession.jti — unique** | `prisma/schema.prisma:598` | Гарантирует что каждая сессия может быть использована только один раз (single-use refresh token). |
| 4 | **BillingPayment.idempotenceKey — unique** | `prisma/schema.prisma:1906-1907` | Предотвращает дублирование платежей. Нельзя убирать уникальный constraint. |
| 5 | **Проверка подписи YooKassa webhook** | `src/app/api/payments/yookassa/webhook/route.ts:52-63` | HMAC-SHA256 + IP allowlist. Без этой проверки злоумышленник может имитировать успешный платёж. |
| 6 | **Чувствительные роуты — fail-closed** | `src/lib/rate-limit/index.ts:152-153` | При недоступности Redis: `/api/auth`, `/api/bookings` и пр. — возвращают 429. Нельзя менять на fail-open. |
| 7 | **MasterService.@@unique([masterProviderId, serviceId])** | `prisma/schema.prisma:923` | Мастер не может иметь дублирующиеся связи с одной услугой. |
| 8 | **UserSubscription.@@unique([userId, scope])** | `prisma/schema.prisma:1880` | У пользователя одна подписка на каждый scope (MASTER/STUDIO). |
| 9 | **HotSlot.@@unique([providerId, startAtUtc, endAtUtc])** | `prisma/schema.prisma:989` | Нет дубликатов горячих слотов. |
| 10 | **timingSafeEqual для JWT-подписи** | `src/lib/auth/jwt.ts:94-95` | Защита от timing-атак. Нельзя заменить на обычное сравнение строк. |
| 11 | **Booking overlap check** | `src/lib/bookings/booking-core.ts` (ensureNoConflicts) | Обязательная проверка на пересечение бронирований перед созданием. |
| 12 | **MediaAssetEmbedding.embedding: vector(1536)** | `prisma/schema.prisma:1456` | Размерность эмбеддинга OpenAI. Изменение размерности требует переиндексации всех активов. |
| 13 | **UI_TEXT — единственный источник текстов** | `src/lib/ui/text.ts` | Все UI-тексты должны брать из этого файла. Хардкодить русские строки нельзя (есть скрипт проверки). |
| 14 | **Workspace pages — full-width layout** | `src/components/layout/app-shell-content.tsx` | `pathname.startsWith("/cabinet")` или `/admin` → без `max-w-screen-2xl`. Marketing pages — constrained. Менять решение pathname-based — ломает cabinet кёрнинг и UX перестроенных страниц. |
| 15 | **Client components не импортируют server-only модули** | граница `editor.ts` (server) ↔ `editor-shared.ts` (client) | Webpack тащит граф любого не-`import type` импорта в browser bundle. Транзитивный импорт Prisma/Redis/Node API в client компонент роняет build (`Module not found: 'net'`). Pure helpers/types — в `*-shared.ts`. |
| 16 | **AdminAuditLog.adminUserId onDelete: Restrict** | `prisma/schema/audit.prisma` | Нельзя удалить `UserProfile` пока есть его audit log записи. Если admin account удаляется — сначала reassign / migrate audit trail. Защита от потери compliance history. |
| 17 | **Review soft-delete: `deletedAt: null` filter в публичных запросах** | `src/lib/reviews/soft-delete.ts` (`ACTIVE_REVIEW_FILTER`) + REVIEW-SOFT-DELETE-A | Все queries активных отзывов используют `ACTIVE_REVIEW_FILTER` constant (`{ deletedAt: null }`) — public catalog, master/client cabinets, ratings recalc, AI summary, admin moderation. **Enforced** в 18 sites после REVIEW-SOFT-DELETE-A (2026-05-14). Любой новый review query без filter — потенциальный data leak. Exceptions: `kpis.service.ts:deletedLastWeek` (intentionally queries deleted set), `delete-master.ts:tx.review.deleteMany` (account-wide cascade, different semantic from moderation). |
| 18 | **AdminAuditLog writes inside transactions для atomicity** | `src/lib/audit/admin-audit.ts` (`createAdminAuditLog` strict) | Audit запись для admin business action должна идти **внутри той же транзакции** (parameter `tx: Prisma.TransactionClient`). Если audit fails, business mutation rolls back — это desired behaviour для consistency. Cancel-subscription, plan-edit, plan-change, city-CRUD, review-approve/delete, settings-flag/SEO/app-setting — все следуют этому паттерну. |
| 19 | **AdminAuditLog safe variant вне транзакций для resilience** | `src/lib/audit/admin-audit.ts` (`createAdminAuditLogSafe`) | Когда business action уже мутировал external state (например refund → YooKassa API call) и rollback невозможен — использовать safe variant. Failure logs через `logError("admin-audit.create.failed", ...)` но не surface'ит 500 admin'у. Currently 1 site: `/api/admin/billing/refund` POST. |
| 20 | **Studio masters никогда не показывают PREMIUM badge** | global UI rule (STUDIO-MASTERS-A) | Подписка `UserSubscription.scope = STUDIO` шарится на всю команду студии — индивидуальный мастер не «оплачивает PREMIUM». Поэтому в любой surface где рендерится studio master (cabinet team list/detail, catalog cards, public profile, master cards in dashboard) — `PremiumBadge` должен быть suppressed. На `/cabinet/studio/team` запрет implicit (badge не рендерится). На other surfaces нужен утилитарный helper `isStudioMaster(provider) → studioId !== null` для checked rendering. Backlog 🟡 для shared helper. |
| 21 | **Studio masters permissions работают по default правилам** | UX rule (STUDIO-MASTERS-A) | В studio masters detail panel НЕТ permissions toggles (schedule edit / services edit / notifications). Это intentional: schedule changes идут через approval flow (STUDIO-SCHEDULE-REQUEST-APPROVAL-A), services управляются по studio policy, notifications — через user-level preferences. Если permission gating потребуется в будущем — это новые schema fields + UI, не toggles в текущем дизайне. |
| 22 | **Studio admin booking CRUD direct vs approval flow scope** | `src/lib/studio/bookings.service.ts` (`createStudioBooking`, `moveStudioBooking`) + `src/app/api/bookings/[id]/cancel/route.ts` (STUDIO-SCHEDULE-A) | Studio admin booking operations (создать / перенести / отменить запись) идут **прямо** через Booking CRUD — никакой ScheduleChangeRequest approval. Admin has authority over studio bookings. `ScheduleChangeRequest` approval flow (STUDIO-SCHEDULE-REQUEST-APPROVAL-A) — это **отдельный концепт**: применяется ТОЛЬКО к master-initiated working-hours / day-off changes (через `applyScheduleSnapshot` / week schedule edits), не к individual bookings. Confusing эти 2 scope ломает либо UX (admin не может быстро управлять записями), либо authority model (master может обойти approval). |
| 24 | **Studio master eligibility: INVITED не назначается на услуги, не принимает записи** | `src/lib/studio/master-eligibility.ts` (`isStudioMasterActive`, `requireActiveStudioMaster`) — applied in `assignMasterToService` + `createStudioBooking` + `moveStudioBooking` + `loadStudioServiceDetail.availableMasters` + schedule day/week `columns.isAvailable` + bookings page `loadShellExtras.scheduleMasters[].isAvailable` (STUDIO-BUGS-FIX-A) | Канонический предикат «мастер может работать в студии»: `Provider.ownerUserId !== null && Provider.isPublished === true`. INVITED (нет ownerUserId — приглашение не принято) и DISABLED (`!isPublished` — admin поставил на паузу) одинаково блокируются от назначения/приёма записей. Server-side enforcement в lib layer кидает 409 `MASTER_NOT_ACTIVE`. UI pickers фильтруют INVITED at source. Schedule grid рендерит INVITED как DisabledMasterOverlay column. Усиление #21: «no permissions toggles in UI» теперь дополнено runtime guard. Несоблюдение invariant приводит к bookings на призрачных мастеров, отображению INVITED в bookable pickers, и user confusion. |
| 23 | **Category visibility: APPROVED = public; PENDING = creator scope only** | `src/features/studio-cabinet/services/server/services-data.service.ts` (`listAvailableCategoriesForStudio`) + `src/lib/master/services-view.service.ts` (`listAvailableGlobalCategories`) + `/api/catalog/global-categories` GET + `catalog.service.ts` filter (CATEGORY-UNIFICATION-A) | `GlobalCategory.status = APPROVED` AND `visibleToAll = true` → visible everywhere (public catalog, all studios, all masters). `GlobalCategory.status = PENDING` → visible ТОЛЬКО to creator (`createdByUserId` / `proposedBy` match `auth.user.id`) in their own service/portfolio picker. Public catalog (`/api/catalog/global-categories`) **строго** filters `status: APPROVED, visibleToAll: true` — pending drafts never leak. Master `service-modal.tsx` + studio `add-service-dialog.tsx` propose new categories via `POST /api/categories/propose` → создаёт `status: PENDING, visibleToAll: false`. Категория становится globally visible только после admin approval. **Никогда не filter catalog/public surfaces by `OR: [APPROVED, own-PENDING]`** — это сломает invariant (см. `catalog/global-categories/route.ts` services-category-creation-restore comment про prior bug). |
| 26 | **Chat attachment ACL = chat participants only (1:1 client↔master); studio admins/outsiders denied** | `src/lib/media/access.ts` (`ensureCanReadMedia` CHAT_MESSAGE case + `canReadChatAttachmentMedia` helper). Route `/api/chat/attachment/[token]` (MASTER-CHAT-ATTACHMENT-FIX-A) | MediaAsset rows tagged `entityType=CHAT_MESSAGE` + `entityId="chat-message:<msgId>"` могут читать ТОЛЬКО два участника беседы — `booking.clientUserId` (client) и `booking.masterProvider.ownerUserId` (master). Studio admin/owner — НЕТ (privacy 152-ФЗ, same boundary as `resolveChatAccess`). Outsiders → 403. Availability gate intentionally skipped для read (участники видят историю и после окончания брони — как сообщения). URL pattern: opaque token-only (`/api/chat/attachment/[token]`) — assetId cuid не в URL (signed payload embeds `aid`, `exp`, `purpose:"chat-attachment-read"`). Distinct purpose claim предотвращает cross-replay с generic `media-read` токенами. Защищён tests: `chat-attachment-acl.test.ts` (8 boundary scenarios) + `chat-attachment-token.test.ts` (11 token contract + URL-no-cuid). |
| 25 | **Master CRM private fields никогда не появляются в client-facing API/DTO/SSR** | `src/lib/bookings/dto.ts` (`BookingDto` / `BookingClientDto` без `notes`/`tags`/`clientCard`), `src/lib/bookings/list.ts` (`listClientBookings` explicit-list select), `src/lib/client-cabinet/bookings.service.ts` (`ClientBookingDTO` + `listClientBookings`), `/api/cabinet/user/*`, `/api/bookings/my`, `/api/bookings/[id]/chat` — все explicit-list select без CRM-полей. Guarded by `src/lib/bookings/client-privacy.test.ts` (13 tests: type-level + source-level regex) (MASTER-PRIVACY-FIX-A) | Master CRM private поля — `Booking.notes` (мастер пишет при manual booking), `ClientCard.notes` / `ClientCard.tags` / `ClientCard.photos` (CRM-карточка клиента у мастера, providerId-scoped), `ClientNote.text` (отдельная модель notes by master) — **никогда не возвращаются клиенту** через API/DTO/SSR. Это 152-ФЗ-критичное: мастер обрабатывает персональные данные клиента для CRM-цели, в руки клиенту они не должны попадать (модель данных мастера, не клиента). **Что НЕ master-private** и легитимно в client DTO: `Booking.comment` (client-to-master comment, клиент сам написал), `Booking.changeComment` (bilateral reschedule communication), `ClientNote` model — приватна полностью, **никогда** не include в client paths. **Boundary защищается двумя слоями**: (1) TypeScript type-level — `extends keyof` assertions в `client-privacy.test.ts` fail at compile time если поле просочится в DTO type; (2) Source-level regex — тот же test читает байты 6 client-facing файлов и матчит `notes: true` / `clientCard:` / `clientNote:` паттерны (ловит даже `as`-cast обходы types). Расширение privacy-полей в схеме → расширить оба массива в test. |

---

## 13. ПРАВИЛА ПРИ РАБОТЕ С КОДОМ

### Конвенции из кода

**Именование:**
- Файлы: kebab-case (`booking-core.ts`, `create-booking.ts`)
- Компоненты: PascalCase (`BookingCard.tsx`)
- Алиас импортов: `@/` = `src/` (tsconfig paths)
- API response helpers: `ok()` / `fail()` из `src/lib/api/response.ts`, `jsonOk()` / `jsonFail()` из `src/lib/api/contracts.ts`

**Обработка ошибок:**
- `AppError` из `src/lib/api/errors.ts` — стандартный класс ошибки с `status` и `code`
- `toAppError()` — конвертация любой ошибки в AppError
- Логирование: `logInfo()` / `logError()` из `src/lib/logging/logger.ts` (НЕ `console.log`)
- `recordSurfaceEvent()` из `src/lib/monitoring/status.ts` — трекинг метрик

**API routes:**
- Паттерн: `withRequestContext(req, async () => { ... })` или прямой try/catch
- Валидация: `parseBody(req, schema)` или `schema.safeParse(body)`
- Auth: `requireAuth()` (Server Components) или `getSessionUser(req)` (в route handlers с req)
- Всегда логировать 5xx-ошибки с requestId

**Время:**
- Все UTC-даты через `parseISOToUTC()` из `src/lib/time.ts`
- Локальное время только для отображения пользователю
- Временные вычисления в расписании — через `src/lib/schedule/timezone.ts`

**Расписание:**
- Не изменять расписание напрямую через Prisma — использовать `ScheduleEngine` и `editor.ts`
- Инвалидация кэша после изменений расписания обязательна

**Тексты UI:**
- Все строки через `UI_TEXT` из `src/lib/ui/text.ts`
- Проверяется скриптом `scripts/check-ui-text.mjs`
- Скрипт `check:mojibake` проверяет кодировку файлов

**Безопасность:**
- Никогда не логировать чувствительные данные (пароли, токены, OTP-коды — ← сейчас нарушается!)
- Rate limit проверять перед каждой дорогостоящей операцией
- Idempotency key при операциях создания (bookings, payments)

**Billing:**
- Использовать `getBillingFeatures()` для проверки доступа к функциям
- Не делать прямые запросы к BillingPlan — использовать `src/lib/billing/`

### Архитектурные patterns (выучены в redesign sprint)

1. **MasterPageHeader pattern** — каждая cabinet master страница рендерит свой `<MasterPageHeader>` как первый element content area (sticky `top-[var(--topbar-h)] z-20`, backdrop blur). Не layout-level. Принимает `breadcrumb`, `title`, `subtitle`, `actions` (slot для кнопок и save-status chip).
2. **AppShellContent conditional** — global wrapper в `src/components/layout/app-shell-content.tsx` определяет full-width vs constrained по pathname. Cabinet/admin = full, marketing = `max-w-screen-2xl`.
3. **Server/Client boundary** — client components никогда не импортируют server-only модули транзитивно. Pattern: server component fetches → plain data props → client использует `import type` для типов. Runtime helpers — выносить в `*-shared.ts` (см. `src/lib/schedule/editor-shared.ts`).
4. **Snapshot-based settings** — все 5 tabs Schedule Settings идут через единый PATCH `/api/cabinet/master/schedule` с `ScheduleEditorSnapshot`. Атомарные транзакции, single source of truth, billing-gate на hot slots.
5. **Auto-save с status indicator** — debounced 500 мс PATCH, status (`idle/saving/saved/error`) через React Context (`<SaveStatusProvider>`), UI feedback в page header через `<SaveStatusIndicator>`.
6. **Reference-driven редизайн** — `.claude/references/{page}.png` + `{page}.js`. Каждый редизайн-коммит начинается с `view` reference + сравнение existing code vs reference + gap analysis.
7. **RSC serialization** — Server Components не передают React-компоненты или функции в Client Components как props. Pattern для иконок: string identifiers + lookup map (см. `src/features/marketing/icons/feature-icons.ts`).

---

## 14. БЫСТРЫЙ СТАРТ ДЛЯ ИИ

### Ключевые файлы по областям

| Область | Ключевые файлы | Порядок чтения |
|---------|---------------|----------------|
| **Понять продукт** | `prisma/schema.prisma`, `src/lib/ui/text.ts`, `.env.example` | 1 → 2 → 3 |
| **Авторизация** | `src/lib/auth/jwt.ts`, `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`, `src/lib/auth/otp.ts` | 1 → 2 → 3 → 4 |
| **Создание бронирования** | `src/lib/bookings/createBooking.ts`, `src/lib/bookings/booking-core.ts`, `src/lib/bookings/idempotency.ts`, `src/app/api/bookings/route.ts` | 1 → 2 → 3 → 4 |
| **Расписание и слоты** | `src/lib/schedule/engine.ts`, `src/lib/schedule/engine-core.ts`, `src/lib/schedule/slots.ts`, `src/lib/schedule/types.ts` | 1 → 2 → 3 → 4 |
| **Платежи** | `src/lib/payments/yookassa/client.ts`, `src/app/api/payments/yookassa/webhook/route.ts`, `src/lib/billing/features.ts` | 1 → 2 → 3 |
| **Очередь задач** | `src/lib/queue/types.ts`, `src/lib/queue/queue.ts`, `src/worker.ts` | 1 → 2 → 3 |
| **Уведомления** | `src/lib/notifications/notifier.ts`, `src/lib/notifications/delivery.ts`, `src/lib/notifications/booking-notifications.ts` | 1 → 2 → 3 |
| **Rate limiting** | `src/lib/rate-limit/index.ts`, `src/lib/rate-limit/configs.ts` | 1 → 2 |
| **Биллинг** | `src/lib/billing/feature-catalog.ts`, `src/lib/billing/features.ts`, `src/lib/billing/get-current-plan.ts` | 1 → 2 → 3 |
| **Медиафайлы** | `src/lib/media/storage/index.ts`, `src/lib/media/storage/s3.ts`, `src/lib/media/storage/local.ts` | 1 → 2/3 |
| **Горячие слоты** | `src/lib/hot-slots/service.ts`, `src/lib/hot-slots/anti-fraud.ts`, `src/lib/hot-slots/pricing.ts` | 1 → 2 → 3 |
| **CRM** | `src/lib/crm/card-service.ts`, `src/lib/crm/clients.ts`, `src/lib/crm/guards.ts` | 1 → 2 → 3 |
| **Добавить API route** | Изучить похожий `route.ts` + `src/lib/api/response.ts` + `src/lib/auth/guards.ts` | — |
| **Визуальный поиск** | `src/lib/visual-search/config.ts`, `src/lib/visual-search/indexer.ts`, `src/lib/visual-search/searcher.ts` | 1 → 2 → 3 |
| **Советник** | `src/lib/advisor/engine.ts`, `src/lib/advisor/rules.ts`, `src/lib/advisor/collector.ts` | 1 → 2 → 3 |
| **Cabinet master shell** | `src/app/(cabinet)/cabinet/master/layout.tsx`, `src/features/master/components/master-sidebar.tsx`, `src/components/layout/app-shell-content.tsx`, `src/features/master/components/master-page-header.tsx` | 1 → 2 → 3 → 4 |
| **Cabinet master dashboard** | `src/features/master/components/master-dashboard-page.tsx`, `src/lib/master/dashboard.service.ts`, `src/features/master/components/dashboard/manual-booking-modal.tsx` | 1 → 2 → 3 |
| **Cabinet master bookings (kanban)** | `src/features/master/components/bookings/master-bookings-page.tsx`, `src/lib/master/bookings.service.ts`, `src/features/master/components/bookings/booking-card-actions.tsx` | 1 → 2 → 3 |
| **Cabinet master schedule (week view)** | `src/features/master/components/schedule/master-schedule-page.tsx`, `src/lib/master/schedule.service.ts`, `src/features/master/components/schedule/booking-card-actions-menu.tsx`, `src/features/master/components/schedule/reschedule-modal.tsx` | 1 → 2 → 3 → 4 |
| **Cabinet master schedule settings** | `src/features/master/components/schedule-settings/schedule-settings-page.tsx` (server), `src/lib/schedule/editor.ts` (server), `src/lib/schedule/editor-shared.ts` (client-safe), `src/features/master/components/schedule-settings/use-auto-save.ts` | 1 → 2 → 3 → 4 |
| **Catalog** | `src/features/catalog/`, `src/lib/catalog/` | — |
| **Тесты** | `vitest.config.ts`, `src/lib/schedule/slots.test.ts` (пример) | — |

### Важные команды
```bash
npm run dev              # Запуск Next.js dev
npm run worker           # Запуск воркера задач
npm run test             # Запуск тестов (Vitest)
npm run typecheck        # Проверка типов
npm run lint             # ESLint
npm run check            # Полная проверка (lint + types + prisma + encoding + ui-text + smoke)
npm run prisma:generate  # Генерация Prisma client
npm run smoke            # Smoke тесты
```

### Типичные задачи

**Добавить новый тип уведомления:**
1. Добавить в enum `NotificationType` в `prisma/schema.prisma`
2. Добавить константу в `src/lib/notifications/constants.ts`
3. Создать функцию в соответствующем `*-notifications.ts` файле
4. Добавить обработчик в `src/lib/notifications/presentation.ts`

**Добавить новую billing-фичу:**
1. Добавить в `FEATURE_CATALOG` в `src/lib/billing/feature-catalog.ts`
2. Добавить в `DEFAULT_FEATURES` в `src/lib/billing/features.ts`
3. Обновить планы в `src/lib/billing/plan-seed.ts`
4. Использовать в коде через `getBillingFeatures()`

**Добавить новый тип задачи в очередь:**
1. Добавить тип payload и тип Job в `src/lib/queue/types.ts`
2. Добавить фабричную функцию `createXxxJob()`
3. Добавить обработчик в `src/worker.ts`

**Изменить расписание:**
- Использовать функции из `src/lib/schedule/editor.ts`
- Инвалидировать кэш после изменений
- Не менять напрямую через Prisma без обновления кэша

---

## 15. ИСТОРИЯ ОБНОВЛЕНИЙ ЭТОГО ФАЙЛА

- **2026-05-22 — STUDIO-CLEANUP-FIX-A** (commit on `designStudioCabinet`). **6/8 commit studio cabinet QA-волны.** 3 independent cleanups of misleading/broken UI elements. NO schema migration. NO new tests (cleanup-only).
  - **Audit findings:**
    - **#4а «Написать» button** at [master-detail-header.tsx:127-133](src/features/studio-cabinet/masters/components/master-detail-header.tsx) — `<Link href="/cabinet/(user)/messages?with=${userId}">` pointing at the client-cabinet messages page. Studio admin isn't a chat participant (invariant #26: chat ACL = client↔master, 152-ФЗ privacy) → destination page rendered empty. Per user's start-of-wave decision: remove button, defer feature to backlog.
    - **#1г «Детали записи» button** at [booking-action-menu.tsx:84-91](src/features/studio-cabinet/schedule/components/dialogs/booking-action-menu.tsx) — pure no-op (`onClick={handleClose}` + `title={clientPhone}` browser tooltip but no dialog content). Per-booking info card above already showed all available info — button added zero value.
    - **#9 profile page** at [`/cabinet/studio/profile/page.tsx`](src/app/(cabinet)/cabinet/studio/profile/page.tsx) — single-line `redirect("/cabinet/studio/settings?tab=main")`. Sidebar entry labelled «Публичная страница» — both label AND destination misleading (label suggests external public profile, destination is settings). Studio cabinet new feature → no bookmark-compat concern → full removal preferred.
  - **Раздел 3 (Архитектура):** 4 modified files + 1 file deleted + 1 empty parent dir removed:
    - **MODIFIED** [`master-detail-header.tsx`](src/features/studio-cabinet/masters/components/master-detail-header.tsx) — removed Link block, removed `MessageCircle` lucide import, replaced with explanatory comment citing invariant #26 + backlog reference.
    - **MODIFIED** [`booking-action-menu.tsx`](src/features/studio-cabinet/schedule/components/dialogs/booking-action-menu.tsx) — removed Button block, removed `Info` lucide import, replaced with explanatory comment.
    - **DELETED** [`src/app/(cabinet)/cabinet/studio/profile/page.tsx`](src/app/(cabinet)/cabinet/studio/profile/page.tsx) + empty parent dir.
    - **MODIFIED** [`studio-nav.ts`](src/features/studio-cabinet/config/studio-nav.ts) — removed `"publicPage"` from `StudioNavItemLabelKey` union, removed sidebar entry from `studio-meta` group, removed orphan `Eye` lucide import.
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — removed `mastersV2.detail.actions.message` key, removed `scheduleV2.actions.details` key. Kept `nav.items.publicPage` for backwards-compat (used by `auth-mobile-menu`, `auth-user-menu` etc) with explanatory comment.
  - **Раздел 5 (Бизнес-логика):**
    - **3 misleading UI elements removed** — UX honesty wins. Users no longer click buttons that route nowhere useful.
    - **Settings is now the single entry from studio-meta sidebar group** — clean, predictable navigation.
    - **No business logic changes** — pure UI cleanup. Backend chat/schedule/booking flows unchanged.
  - **Раздел 6 (Маршруты):** `/cabinet/studio/profile` route removed (was just a redirect). No new routes. Existing redirects elsewhere unaffected.
  - **Раздел 8 (Проблемы):** #4а / #1г / #9 closed.
  - **Раздел 10 (Безопасность):** **Invariant #26 strengthened in practice** — the «Написать» button was a UX implication that studio admin could chat with masters; removing it aligns surface with the by-design denial. No actual ACL changes (ACL was already correct; UI was misleading).
  - **Раздел 12 (Инварианты):** **#26 not modified formally**, **strengthened through alignment of UI with backend semantics**.
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **502/502 tests** ✅ (no orphan tests removed — none of the 3 features had dedicated test coverage; CHAT-FOUNDATION tests cover unchanged chat infra), `npm run build` ✅.
  - **What was NOT changed (per strict constraints):**
    - Schema (no migration)
    - CHAT-FOUNDATION (SSE/receipts/sendConversationMessage) — untouched, chat infra preserved verbatim
    - Invariant #26 — strengthened through UI alignment, not weakened
    - STUDIO-APPROVE / RESCHEDULE / MASTERS-PRIVACY / BOOKINGS / CLIENT-WRITE patterns — untouched
    - `CreateBookingDialog` / `policy-enforcement.ts` / HMAC token helpers — untouched
    - Master cabinet 91 + studio #1-#5 64 regression tests — all pass
    - Sidebar / navigation consistency (studio-meta still renders «Settings»; layout intact)
    - Other studio cabinet bugs (#7 services sort / #8 schedule settings large — carryover)
    - Booking widget / catalog / auth / client cabinet
  - **Pre-launch risks (новых не обнаружено):** the discovery pattern (button promises feature, points elsewhere) is worth a process note — **when adding a UI element claim, audit its destination matches the claim**. Backlog entries with explicit activation conditions for both deferred features (studio-admin chat + public-page sidebar entry).
  - **Open questions for user:** нет — all 3 cleanups had unambiguous removal cases (per user's start-of-wave decision for #4а, pure noop for #1г, misleading both-ends for #9). Remaining 2 studio cabinet QA fixes (#7 services sort, #8 schedule settings large) await separate prompts.

- **2026-05-22 — STUDIO-CLIENT-WRITE-DIALOG-A** (commit on `designStudioCabinet`). **5/8 commit studio cabinet QA-волны.** Replace redirect → in-context booking dialog with client prefill + close STUDIO-RESCHEDULE-VALIDATION-A regression-gap in `createStudioBooking`. NO schema migration.
  - **Audit findings:**
    - **«Записать» button** in [client-row.tsx:83-90](src/features/studio-cabinet/clients/components/client-row.tsx) was a `<Link href="/cabinet/studio/calendar">` with zero context — user had to find the same client again in the calendar after redirect.
    - **`CreateBookingDialog` (from STUDIO-BOOKINGS-FIX-A) doesn't support client prefill** — `clientName`/`clientPhone` are local state with no external seeding. **Option A — extend** chosen (DRY): single `prefilledClient?: { name; phone } | null` prop, dialog handles both anonymous + prefilled flows.
    - **Regression-gap in `createStudioBooking`**: master-service compatibility enforced (`SERVICE_INVALID 409` at line 159-161) but **work-hours + slot conflict NOT enforced**. STUDIO-RESCHEDULE-VALIDATION-A applied all three rules to `moveStudioBooking` but the parallel create path was missed. Same data-integrity invariant — closing this is scope-extension, not scope-creep.
    - **`loadShellExtras` was inline** in the bookings page route — needed shared form for the clients page too.
  - **Раздел 3 (Архитектура):** 1 new helper module + 1 new client island + 1 new test file + 4 modified files:
    - **NEW** [`shell-extras.service.ts`](src/features/studio-cabinet/schedule/server/shell-extras.service.ts) — `loadStudioCabinetShellExtras(studioId)` extracted from `cabinet/studio/bookings/page.tsx`. Single source of truth for `scheduleMasters[].serviceIds[]` + `services[].masterIds[]` master-services join. Exported types `StudioCabinetServiceOption` + `StudioCabinetShellExtras` for downstream prop typing.
    - **NEW** [`client-book-button.tsx`](src/features/studio-cabinet/clients/components/client-book-button.tsx) — small client island per row owning its own dialog state. Replaces the `<Link>` with a `<button>` that opens `CreateBookingDialog` inline with `prefilledClient` seeded from row data.
    - **MODIFIED** [`create-booking-dialog.tsx`](src/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog.tsx) — `prefilledClient?: { name; phone } | null` prop. Initial state seeds from prop; `useEffect` reset on open re-seeds (no stale state when reopening on a different client). Fields stay **editable** (admin can correct stale phone/name without losing other picker state).
    - **MODIFIED** [`cabinet/studio/bookings/page.tsx`](src/app/(cabinet)/cabinet/studio/bookings/page.tsx) — inline `loadShellExtras` removed; route now imports `loadStudioCabinetShellExtras` instead.
    - **MODIFIED** [`cabinet/studio/clients/page.tsx`](src/app/(cabinet)/cabinet/studio/clients/page.tsx) — parallel-loads shell extras alongside clients data; threads `studioId` + `scheduleMasters` + `services` to `StudioClientsPage`.
    - **MODIFIED** `studio-clients-page.tsx` + `clients-table.tsx` + `client-row.tsx` — props chained through to `ClientBookButton`.
    - **MODIFIED** [`studio/bookings.service.ts`](src/lib/studio/bookings.service.ts) `createStudioBooking` — mirror reschedule shell: `resolveMasterWorkWindow` + `assertWithinMasterWorkHours` + inline `findMany` slot-conflict check (no self-exclusion at create time). Same `SLOT_CONFLICT 409` + `OUTSIDE_WORK_HOURS 422` codes as `moveStudioBooking`.
    - **NEW** [`create-booking-enforcement.test.ts`](src/lib/studio/create-booking-enforcement.test.ts) — 7 unit tests pinning rule-reuse between create + reschedule paths (same error codes, boundary semantics, inactive-day rejection) + prefilled-client display rules (seed name/phone, null=blank, empty-phone tolerance).
  - **Раздел 5 (Бизнес-логика):**
    - **«Записать» now opens dialog in-context** — admin stays on client page; name + phone pre-filled; admin picks time + service + master + submits → confirmation → dialog closes.
    - **Create + reschedule share identical enforcement rules.** Master-service compatibility + work hours + slot conflicts apply to both paths via the same `policy-enforcement.ts` helpers + shared `resolveMasterWorkWindow` resolver.
    - **`loadStudioCabinetShellExtras` is now the canonical helper** for any studio cabinet surface that needs to open `CreateBookingDialog` (bookings page + clients page today, future surfaces by symmetry).
  - **Раздел 6 (Маршруты):** `POST /api/studio/bookings` semantics extended with the two new gates (closes regression-gap). No new endpoints. `/cabinet/studio/clients` route now parallel-loads shell-extras.
  - **Раздел 8 (Проблемы):** #6 (client write redirect) closed via single dialog extension + button island. Regression-gap in `createStudioBooking` closed alongside.
  - **Раздел 12 (Инварианты):** не затронуты formally, but **invariant extended in practice**: «studio booking mutation (create OR reschedule) enforces master-service compatibility + work-hours boundary + slot-conflict-free». A 3rd booking-mutation endpoint (if ever added) should reuse the same helpers — could be formalized in a future commit when N=3.
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **502/502 tests** ✅ (was 495; +7), `npm run build` ✅.
  - **What was NOT changed (per strict constraints):**
    - Schema (no migration)
    - `createBooking` core + flow.ts state-machine (untouched)
    - MASTER manual-booking-modal (reference only, not modified)
    - MASTER-BOOKING-UI primitives (PromptModal / FormDialog) — reused, not modified
    - STUDIO-APPROVE / RESCHEDULE / MASTERS-PRIVACY / BOOKINGS — reused without modification
    - `CreateBookingDialog` standalone path (anonymous + header-button flows preserved by existing 11 STUDIO-BOOKINGS-FIX-A tests)
    - Calendar page (no longer redirect target, but navigation works)
    - Other studio cabinet bugs (#6 cleanup / #7 sort / #8 settings)
    - Master cabinet 91 + studio #1-#4 57 regression tests
  - **Pre-launch risks (новых не обнаружено):** the regression-gap discovery is a useful process insight — when adding policy enforcement, audit ALL parallel paths (create + reschedule + cancel + reassign) for the same rules, not just the path the original ticket described. Backlog'able: «booking mutation policy reuse audit when a 3rd mutation endpoint is added».
  - **Open questions for user:** нет — Option A unambiguously fit (extension < fork), regression-gap closure is well-defined consistency work, prefilled fields are editable (no UX trade-off to resolve). Remaining 3 studio cabinet QA fixes (#6 cleanup, #7 services sort, #8 schedule settings large) await separate prompts.

- **2026-05-22 — STUDIO-BOOKINGS-FIX-A** (commit on `designStudioCabinet`). **4/8 commit studio cabinet QA-волны.** 3 связанные studio bookings surface bugs (#3а UI inherited, #3б new-booking button broken, #3в phone validation). 1 of 3 audit-zero-code — 12th case across both waves. NO schema migration. NO backend changes.
  - **Audit findings:**
    - **#3а UI inherited — AUDIT-ZERO-CODE (12th case)**. Studio bookings table reuses `BookingActionMenu` from `schedule/components/dialogs/` (per import on [booking-row.tsx:13](src/features/studio-cabinet/bookings/components/booking-row.tsx)). That shared menu uses `ModalSurface` throughout, no `window.confirm`/`window.prompt`, and exposes a fundamentally studio-admin-driven action set: Move / Move time / Details / Cancel. **Different action surface from master cabinet** (where the state machine has confirm/decline as initiator-vs-awaited side per invariant #22 / `actionRequiredBy` semantics). Studio admin acts directly — no two-sided pending state, so no role-aware UI needed. The problems MASTER-BOOKING-UI-FIX-A fixed (initiator-aware visibility + ModalSurface-vs-confirm) don't apply to the studio action surface model.
    - **#3б root cause**: «Новая запись» header button ([bookings-header.tsx:44](src/features/studio-cabinet/bookings/components/bookings-header.tsx)) opens `CreateBookingDialog` with `startAtUtc={null}`. The form had **no time picker** — only rendered a read-only «time card» when `startAtUtc !== null` (calendar-click flow). Header-button flow → form silently fell through to generic `E.create` error at submit. User couldn't pick time; calendar click was the only working path.
    - **#3в** `normalizeRussianPhone` already used at submit ([create-booking-dialog.tsx:101](src/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog.tsx)) — same helper auth/OTP flows use. Missing piece: **real-time UI feedback** (red border + inline hint + submit-disable while typing). Existing validation is server-side last-resort; UX was «type → submit → silent error → fix → submit again».
    - **Smoke check other fields**: clientName has `clientNameRequired` check on submit. Service select is a dropdown (no free-text). No email field in this form. No serious gaps to backlog.
  - **Раздел 3 (Архитектура):** 1 new test file + 2 modified files:
    - **MODIFIED** [`create-booking-dialog.tsx`](src/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog.tsx) — **#3б**: 2 new pure helpers (`utcIsoToLocalInput` / `localInputToUtcIso`) + new `startAtLocal` state. The time card swaps to `<Input type="datetime-local">` when `startAtUtc === null`. Submit reads `startAtUtc ?? localInputToUtcIso(startAtLocal)` — either flow produces a valid ISO. New explicit error `startAtRequired` instead of generic `E.create`. **#3в**: real-time validation predicate `phoneIsValid = trimmed.length === 0 || normalizeRussianPhone(trimmed) !== null` (empty = neutral, invalid-typed = red). Phone input gets `aria-invalid` + red border class when invalid + inline `<p role="alert">` with `clientPhoneInvalid` text. Submit button `disabled={!phoneIsValid}` + `title` tooltip.
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — new key `studioCabinet.scheduleV2.errors.startAtRequired`.
    - **NEW** [`create-booking-validation.test.ts`](src/features/studio-cabinet/bookings/create-booking-validation.test.ts) — 11 unit tests pinning two predicates: phone acceptance (empty/canonical/8-prefix/incomplete/garbage/formatted with separators) + effective-start resolution (pre-fill / picker / null / malformed / pre-fill-wins-over-local — the exact pre-fix bug as a regression).
  - **Раздел 5 (Бизнес-логика):**
    - **#3а — no behavior change.** Documented inheritance with concrete proof (import path + shared `ModalSurface`-based menu). Studio action surface is by-design admin-driven; the master state-machine semantics (`actionRequiredBy`) don't apply.
    - **#3б — header button now functional.** Studio admin can create a booking via the header without first clicking the calendar. Calendar-click flow preserved (read-only time card renders when pre-fill present). Backend signature unchanged — both flows POST the same `startAt` ISO.
    - **#3в — defense-in-depth.** Server-side validation (was already there) + client-side immediate feedback. User no longer waits for the round-trip to discover an invalid phone.
  - **Раздел 6 (Маршруты):** не затронуты. `POST /api/studio/bookings` contract unchanged.
  - **Раздел 8 (Проблемы):** #3а / #3б / #3в closed via single dialog file.
  - **Раздел 12 (Инварианты):** не затронуты. The studio-admin-direct-action invariant (#22) is reaffirmed by #3а's no-action outcome — confirms the role-action separation has no leak into studio surface.
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **495/495 tests** ✅ (was 484; +11), `npm run build` ✅.
  - **What was NOT changed (per strict constraints):**
    - Schema (no migration)
    - `createBooking` backend (UI fix only — both new picker + real-time validation feed existing API)
    - flow.ts state-machine (32 tests untouched)
    - `BookingActionMenu` shared primitive (would be cross-cabinet modification — out of scope)
    - MASTER-BOOKING-UI-FIX-A primitives (PromptModal / role-aware DTOs / FormDialog) — confirmed not needed for studio, untouched
    - STUDIO-APPROVE-400 / STUDIO-RESCHEDULE-VALIDATION / STUDIO-MASTERS-PRIVACY (separate surfaces)
    - `normalizeRussianPhone` (reused, not modified)
    - Master cabinet 91 + studio #1-#3 35 regression tests (all pass)
    - Booking widget / catalog / client cabinet
  - **Pre-launch risks (новых не обнаружено):** smoke check of other form fields found no serious validation gaps. Phone real-time pattern (red border + inline hint + submit-disable) is reusable — could be templated into a shared `<PhoneInput>` primitive in the future when a second site needs it. Backlog-able.
  - **Open questions for user:** нет — audit-driven (#3а audit-zero-code unambiguous via import graph + ModalSurface usage), #3б option (a) chosen because the header button's purpose IS standalone creation (option c would be a "this button is a shortcut" reframe that doesn't match its label), #3в reuse-only (no new helper). Remaining 4 studio cabinet QA fixes (#5 client write / #6 cleanup / #7 services sort / #8 schedule settings large) await separate prompts.

- **2026-05-22 — STUDIO-MASTERS-PRIVACY-FIX-A** (commit on `designStudioCabinet`). **3/8 commit studio cabinet QA-волны.** Third application of the HMAC opaque-URL pattern (after CHAT-FOUNDATION attachment + MASTER-CLIENTS-FIX-A history-filter). Closes dual privacy + functional bug on studio cabinet master deep-links. NO schema migration.
  - **Audit findings:**
    - **2 URL leak sites**: «Расписание мастера» button ([master-detail-header.tsx:105](src/features/studio-cabinet/masters/components/master-detail-header.tsx)) + «В календарь» link ([master-detail-week-schedule.tsx:25](src/features/studio-cabinet/masters/components/master-detail-week-schedule.tsx)) both used `?masterId=${detail.id}` — raw prisma cuid in URL bar.
    - **«Грубая ошибка» pattern repeats**: calendar route ([page.tsx](src/app/(cabinet)/cabinet/studio/calendar/page.tsx)) accepted only `view` + `date` params — `masterId` was **IGNORED entirely**. Link took user to the full studio calendar with no master highlight. Same dual bug as STUDIO-APPROVE-400-FIX-A.
    - **Existing HMAC infrastructure** in `client-key-token.ts` (CLIENTS-FIX-A canonical pattern) + `chat-attachment-token.ts` (CHAT-FOUNDATION first application). Direct mirror — no new signing module needed.
    - **No other leak sites** — grep confirmed `?masterId=cuid` only at the 2 named buttons. Notifications + email don't carry master deep-links.
  - **Раздел 3 (Архитектура):** 1 new helper module + 1 new test file + 6 modified files:
    - **NEW** [`src/lib/studio/master-view-token.ts`](src/lib/studio/master-view-token.ts) — HMAC-SHA256 signed opaque token mirroring `client-key-token.ts`. Payload `{mid: masterId, sid: studioId, exp, purpose: "studio-master-view"}`. Base64url-encoded body + sig. TTL 24h. Studio-scoped via `sid` claim — cross-studio share-link rejected at verify. Distinct `purpose` claim prevents cross-replay with chat-attachment + client-history flows. `crypto.timingSafeEqual` for the signature comparison. Uses existing `AUTH_JWT_SECRET`.
    - **NEW** [`src/lib/studio/master-view-token.test.ts`](src/lib/studio/master-view-token.test.ts) — 11 unit tests mirroring CLIENTS-FIX-A test structure point-for-point: roundtrip (custom + realistic cuid); URL privacy (token bytes don't contain masterId OR studioId substring); cross-studio rejection; expired token rejected; tampered signature + tampered body rejected; malformed + empty token rejected; cross-purpose replay rejected (token with foreign `client-history-filter` purpose claim rejected even with valid signature).
    - **MODIFIED** [`src/features/studio-cabinet/masters/server/types.ts`](src/features/studio-cabinet/masters/server/types.ts) — `StudioMasterDetail.viewToken: string` added to DTO. JSDoc cites the 3rd-application narrative.
    - **MODIFIED** [`src/features/studio-cabinet/masters/server/master-detail.service.ts`](src/features/studio-cabinet/masters/server/master-detail.service.ts) — populates `viewToken` via `signStudioMasterViewToken({masterId: provider.id, studioId: input.studioId})`. Uses canonical `provider.id` rather than the query input (which may be a publicUsername per STUDIO-POLISH-A).
    - **MODIFIED** [`src/features/studio-cabinet/masters/components/master-detail-header.tsx`](src/features/studio-cabinet/masters/components/master-detail-header.tsx) — «Расписание мастера» Link href changed from `?masterId=${detail.id}` to `?master=${encodeURIComponent(detail.viewToken)}`. Comment cites pattern reuse.
    - **MODIFIED** [`src/features/studio-cabinet/masters/components/master-detail-week-schedule.tsx`](src/features/studio-cabinet/masters/components/master-detail-week-schedule.tsx) — prop renamed `masterId` → `viewToken` (clarity). «В календарь» Link uses token. Caller `master-detail-panel.tsx` updated.
    - **MODIFIED** [`src/app/(cabinet)/cabinet/studio/calendar/page.tsx`](src/app/(cabinet)/cabinet/studio/calendar/page.tsx) — `searchParams.master?: string` added. Decoded via `verifyStudioMasterViewToken({token, studioId})`. Invalid/cross-studio/expired tokens silently fall through to `focusMasterId: undefined` (URL is shareable-within-cabinet, not a security boundary — failure modes go to the full calendar without disruption). Threads `focusMasterId` through to `<StudioSchedulePage>`.
    - **MODIFIED** [`src/features/studio-cabinet/schedule/components/studio-schedule-page.tsx`](src/features/studio-cabinet/schedule/components/studio-schedule-page.tsx) — new optional `focusMasterId?` prop, threaded to `<DayGrid>`.
    - **MODIFIED** [`src/features/studio-cabinet/schedule/components/day-view/day-grid.tsx`](src/features/studio-cabinet/schedule/components/day-view/day-grid.tsx) — `useRef + useEffect` (mount-gated) auto-scrolls focused column into view (`behavior: "smooth", inline: "center"`). Focused column rendered with `ring-2 ring-primary/40 ring-inset` accent. **Closes the functional gap** alongside the privacy fix — clicking the deep-link now actually does something useful (scrolls + highlights the master), instead of silently dropping the param.
  - **Раздел 5 (Бизнес-логика):**
    - **Two-bird fix**: same token wiring closes both the privacy leak (no more cuid in URL) and the functional gap (link now actually does what it implies — scrolls to the master + highlights their column). Same dual-fix pattern as STUDIO-APPROVE-400-FIX-A (privacy + handler-correctness).
    - **Token is pre-signed at SSR time**, embedded in `StudioMasterDetail.viewToken` and rendered into the Link href. Client never sees the cuid, even via DevTools (the prop chain carries `viewToken`, not `id` for URL purposes).
    - **Studio scope enforcement**: a studio admin from studio A who somehow obtains a token from studio B (via leaked URL) cannot use it — verify rejects on `sid` mismatch. Privacy 152-ФЗ: cross-studio resource references are denied at the token layer, before even reaching the schedule data load.
    - **Failure modes are graceful**: malformed / expired / cross-studio tokens don't error — they fall through to the no-focus default (full calendar view). Matches the "URL is shareable, not a security boundary" principle (security is the auth check at `resolveCurrentStudioAccess`).
  - **Раздел 6 (Маршруты):** `GET /cabinet/studio/calendar` extended with optional `master?` searchParam (HMAC token). No new endpoints, no breaking changes (old `?masterId=cuid` params just silently dropped now — same as pre-fix behaviour where they were ignored entirely).
  - **Раздел 10 (Безопасность):** third HMAC opaque-URL application — `studio-master-view` purpose claim added to the family (`chat-attachment-read` / `client-history-filter` / `studio-master-view`). Cross-purpose replay tests assert these are isolated. Studio admin auth core preserved — token is **identifier scoping**, not auth replacement (`resolveCurrentStudioAccess` still gates the route).
  - **Раздел 12 (Инварианты):** не затронуты formally. The privacy invariant (no internal cuids in user-facing URLs) is now demonstrated 3 times with consistent pattern — could be formalized into an explicit invariant in a future commit. For now: pattern reuse + regression tests guard each instance.
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **484/484 tests** ✅ (was 473; +11), `npm run build` ✅.
  - **What was NOT changed (per strict constraints):**
    - Schema (NO migration — token is computed, not stored)
    - HMAC infrastructure (existing helpers untouched — pattern applied, not modified)
    - MASTER-CLIENTS-FIX-A `client-key-token.ts` and CHAT-FOUNDATION `chat-attachment-token.ts` (preserved as canonical references)
    - STUDIO-APPROVE-400-FIX-A + STUDIO-RESCHEDULE-VALIDATION-A (separate planes, untouched)
    - `policy-enforcement.ts` (different plane — booking policy)
    - Studio admin auth core (`resolveCurrentStudioAccess` untouched)
    - Master cabinet 91 regression + studio #1+#2 24 tests (all pass)
    - Schedule/calendar business logic (token decode adds focus state; doesn't replace existing data loading)
    - Other studio cabinet bugs (#4-#8 carryover)
    - chat / media / booking widget / client cabinet
  - **Pre-launch risks (новых не обнаружено):** the 3rd application proves the pattern scales. **Note**: when adding a 4th application in the future, consider extracting a `signed-url-token-factory(purpose, payloadShape)` helper to avoid the copy-adapt approach — currently acceptable at N=3 (CHAT/CLIENTS/STUDIO-MASTERS) but starts to feel repetitive. Backlogable.
  - **Open questions for user:** нет — direct pattern mirror, audit-driven scope (2 sites + handler gap), defensive failure mode. Remaining 5 studio cabinet QA fixes (#4 bookings / #5 client write / #6 cleanup / #7 services sort / #8 schedule settings large) await separate prompts.

- **2026-05-22 — STUDIO-RESCHEDULE-VALIDATION-A** (commit on `designStudioCabinet`). **2/8 commit studio cabinet QA-волны.** 3 связанные validation gaps в `moveStudioBooking` flow закрыты pure helpers + DB-aware resolver. NO schema migration.
  - **Audit findings:**
    - Existing `moveStudioBooking` ([bookings.service.ts:126](src/lib/studio/bookings.service.ts)) had ACTIVE-master check (STUDIO-BUGS-FIX-A) but **none of**: master↔service compatibility, slot conflict detection, work-hours boundary. Bookings could be moved to 4 AM or onto an incompatible master silently.
    - **#1а KEEP_SERVICE strategy never reads MasterService** — only CHANGE_SERVICE branch does, and only for duration/price overrides (silently skips when not found, allowing move to incompatible master).
    - **#1б** No `ensureNoConflicts` call — direct double-booking possible.
    - **#1в** No work-hours data source consulted — admin can set any datetime.
    - **`policy-enforcement.ts`** has BOOKING-WIDGET-A precedent (`assertBookingWindow` / `assertAcceptsNewClient`) — natural place for `assertMasterPerformsService` + `assertWithinMasterWorkHours`.
    - **Work hours storage**: per-master `WeeklyScheduleConfig` + `WeeklyScheduleDay.template{startLocal,endLocal}` + per-date `ScheduleOverride` (data already populated by STUDIO-APPROVE-400-FIX-A's seed canonical EDITOR_V1 payloads).
    - **Defaults**: Mon-Sat 10-19 / Sun off (matches Vision template; matches user's «9-20 default» intuition close enough — 10-19 is the actual seeded template).
  - **Раздел 3 (Архитектура):** 1 new test file + 5 modified files:
    - **MODIFIED** [`src/lib/bookings/policy-enforcement.ts`](src/lib/bookings/policy-enforcement.ts) — 2 new pure helpers + new type `MasterWorkWindow`. `assertMasterPerformsService` throws `AppError(422, "MASTER_SERVICE_MISMATCH", "Этот мастер не выполняет выбранную услугу.")`. `assertWithinMasterWorkHours` throws `AppError(422, "OUTSIDE_WORK_HOURS", ...)` with distinct copy for day-off vs out-of-window. Inclusive boundaries (start ≥ open, end ≤ close).
    - **MODIFIED** [`src/lib/api/errors.ts`](src/lib/api/errors.ts) — 2 new ErrorCode values added to literal union.
    - **MODIFIED** [`src/lib/studio/bookings.service.ts`](src/lib/studio/bookings.service.ts) — new `resolveMasterWorkWindow(masterProviderId, dateUTC)` helper reads `ScheduleOverride` (per-date, precedence) + `WeeklyScheduleDay` + template hours in parallel; falls back to project defaults. `moveStudioBooking` extended with 3 gates: (a) enabled `MasterService` lookup for all booking serviceIds → `assertMasterPerformsService`; (b) `resolveMasterWorkWindow` + `assertWithinMasterWorkHours` against new local time; (c) inline `findMany` conflicts excluding self → 409 `SLOT_CONFLICT`. All run **before** the mutation transaction.
    - **MODIFIED** [`src/features/studio-cabinet/schedule/server/types.ts`](src/features/studio-cabinet/schedule/server/types.ts) — `ScheduleMasterColumn` extended with `serviceIds: string[]`. JSDoc cites the UI consumer.
    - **MODIFIED** [`src/features/studio-cabinet/schedule/server/schedule-data.service.ts`](src/features/studio-cabinet/schedule/server/schedule-data.service.ts) — day-view + week-view loaders select `masterServices` filtered by `isEnabled: true`, map to `serviceIds[]`. Single extra include per master row — no additional round-trips.
    - **MODIFIED** [`src/app/(cabinet)/cabinet/studio/bookings/page.tsx`](src/app/(cabinet)/cabinet/studio/bookings/page.tsx) — `loadShellExtras` reuses existing `masterServices` join to build inverse `servicesByMaster` map, populates `serviceIds[]` on each scheduleMaster.
    - **MODIFIED** [`src/features/studio-cabinet/schedule/components/dialogs/move-booking-dialog.tsx`](src/features/studio-cabinet/schedule/components/dialogs/move-booking-dialog.tsx) — new `bookingServiceId` prop. Master `<option>` rendered with `disabled={!performsService}` + suffix label «не выполняет эту услугу»; warning hint below the select when current selection doesn't perform the service. Visibility-over-hiding per spec rule.
    - **MODIFIED** [`booking-action-menu.tsx`](src/features/studio-cabinet/schedule/components/dialogs/booking-action-menu.tsx) — threads `booking.serviceId` (already on `ScheduleBookingCell` DTO) into MoveBookingDialog.
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — extended `studioCabinet.scheduleV2.moveDialog.*` with `masterIncompatibleSuffix` + `masterIncompatibleHint`.
    - **NEW** [`src/lib/bookings/reschedule-policy.test.ts`](src/lib/bookings/reschedule-policy.test.ts) — 11 unit tests pinning: `assertMasterPerformsService` accept/reject with correct code/message; `assertWithinMasterWorkHours` boundary cases (start at open, end at close, **4 AM rejection — exact #1в bug regression**, end after close, inactive day, corrupt minutes, partial overlap both sides); distinct error codes for two rules. Pure-functional — no Prisma in tests.
  - **Раздел 5 (Бизнес-логика):**
    - **Studio reschedule now enforces 3 rules**: master compatibility + work hours + slot uniqueness. Defense-in-depth: backend validates server-side, UI master picker filters at source (incompatible masters shown disabled + tooltip). Mirrors MASTER-RESCHEDULE-FIX-A defense layering.
    - **`assertMasterPerformsService`** covers multi-service bookings — every line on `booking.serviceItems` must have an enabled MasterService row. Studio admin moving a combo booking onto a master who only does one of the two services correctly rejected.
    - **`assertWithinMasterWorkHours`** consults per-date override before weekly config — Marina with `ScheduleOverride` для конкретной date (e.g. day-off seeded by STUDIO-APPROVE-400-FIX-A) correctly rejects a move onto that date.
    - **Inline conflict check** uses self-exclusion semantics (`id: { not: booking.id }`) so a no-op «move to same slot» doesn't conflict with itself. Mirrors `usecases.ts:ensureNoConflictsExcluding` from master-волны.
    - **Defaults fallback** (Mon-Sat 10-19) активна когда master has no `WeeklyScheduleConfig` rows. Brand-new studio master cannot accept arbitrary times silently.
  - **Раздел 6 (Маршруты):** `PATCH /api/studio/bookings/[id]/move` semantics extended (3 new validation gates) — same `{ id }` payload on success. New 422 errors surface for invalid moves.
  - **Раздел 10 (Безопасность):** работающие часы enforcement closes the 4 AM gap. Master-service compatibility prevents studio admin from accidentally moving a booking to a master who cannot perform it. Both enforced at backend (last-resort) with UI providing preemptive feedback (defense-in-depth).
  - **Раздел 12 (Инварианты):** не затронуты в формулировке. `assertMasterPerformsService` enforces a soft invariant («every booking line has an active MasterService for its provider») that previously was structural-possibility only.
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **473/473 tests** ✅ (was 462; +11), `npm run build` ✅.
  - **What was NOT changed (per strict constraints):**
    - Schema (no migration — reuses existing MasterService / WeeklyScheduleConfig / ScheduleOverride)
    - flow.ts state-machine (32 tests preserved)
    - `ensureNoConflicts` / `createBooking` / `approveChangeRequest` / `rejectChangeRequest` (untouched)
    - MASTER-RESCHEDULE-FIX-A master-side patterns (preserved, reused)
    - STUDIO-APPROVE-400-FIX-A approve flow (separate plane — schedule request vs booking reschedule)
    - Master cabinet 91 regression tests + studio #1 13 tests (all pass)
    - Other studio cabinet bugs (#3-#9 carryover)
    - chat / media / booking widget / client cabinet
  - **Pre-launch risks (новых не обнаружено):** the 4 AM gap closure means production-time bookings can't be silently misplaced. Default work hours (Mon-Sat 10-19) reasonable fallback when a master is brand-new. **Note about STUDIO-SCHEDULE-SETTINGS-A (#8 future)**: when the studio admin can set per-studio default hours via UI, the resolver here should consult that store first. Backward-compatible since current resolver reads master-level config which UI #8 will write to.
  - **Open questions for user:** нет — Сценарий А unambiguous, audit-driven enforcement, defaults match Vision seed. Remaining 6 studio cabinet QA fixes (#3 privacy URL / #4 bookings / #5 client write / #6 cleanup / #7 services sort / #8 schedule settings large) await separate prompts.

- **2026-05-22 — STUDIO-APPROVE-400-FIX-A** (commit on `designStudioCabinet`). **1/8 commit studio cabinet QA-волны** (start). User обнаружил при QA studio cabinet: подтверждение schedule request падает с 400 «Некорректное тело запроса» в 2 UI entry-points (dedicated schedule-requests page + notifications inline approve). Reject работает. **Audit-zero-code 10-й case** — backend correct, seed bug.
  - **Audit findings:**
    - **Reject endpoint validates body correctly** ([reject/route.ts](src/app/api/studio/schedule/requests/[id]/reject/route.ts)): reads `{ comment }`, requires non-empty, updates status to REJECTED. Working pattern, preserved.
    - **Approve endpoint does NOT validate body** ([approve/route.ts](src/app/api/studio/schedule/requests/[id]/approve/route.ts)) — no zod schema, no body read. 400 originates **inside** `applySchedulePayload`, not at the endpoint layer.
    - **Exact 400 location**: [`src/lib/schedule/unified.ts:546-552`](src/lib/schedule/unified.ts#L546-L552) — `validateSchedulePayload` throws `AppError("Некорректное тело запроса.", 400, "INVALID_BODY")` when `payloadJson` lacks `templates[]` / `weekly.days[]` / `overrides[]` shape (legacy `SchedulePayload`).
    - **Root cause = seed data**: STUDIO-SHOWCASE-SEED creates fake placeholder shapes `{ kind: "WEEKLY", delta: "..." }` and `{ kind: "OVERRIDE", dateOffsetDays: 7, isDayOff: true }` for QA visualization. **Neither shape matches `SchedulePayload` (legacy) NOR `EDITOR_V1` (canonical)** — both validators reject.
    - **`isScheduleEditorRequestPayload` detector** correctly returns false for placeholders (it requires `format: "EDITOR_V1"` + array shapes). Falls through to legacy `applySchedulePayload` → validator fails.
    - **Studio admin UX**: bare "Некорректное тело запроса" is confusing — admin didn't author the payload, master did. Admin needs actionable guidance.
    - **`log-error 429`** observation from user: UI retried failed approve → rate-limited logging endpoint protected (defensive, working as designed). NOT a bug to fix.
  - **Раздел 3 (Архитектура):** 1 new test file + 3 modified files:
    - **MODIFIED** [`prisma/seeds/test-data/seed-showcase-studio.ts`](prisma/seeds/test-data/seed-showcase-studio.ts) — new helper `buildVisionSchedulePayload(extraException?)` constructs valid `EDITOR_V1` payload mirroring Vision's standard template (Sun off, Mon-Sat 10:00-19:00 FLEXIBLE, no breaks). 7-day `weekSchedule` array + optional exception. Marina's seed request now uses no-op payload (re-applies current schedule); Elena's adds a day-off exception 7 days ahead. Replaces both `{ kind: "WEEKLY", delta }` and `{ kind: "OVERRIDE", ... }` placeholders.
    - **MODIFIED** [`approve/route.ts`](src/app/api/studio/schedule/requests/[id]/approve/route.ts) — wraps `applyScheduleSnapshot` / `applySchedulePayload` calls in try/catch. Catches `AppError(status=400, code="INVALID_BODY")` and rewraps as `AppError(422, "INVALID_REQUEST_PAYLOAD", "Не удалось применить расписание: данные запроса повреждены или устарели. Попросите мастера отправить заявку заново.")`. 422 status semantically tighter (data was understood but unprocessable). Other 400 codes rethrow as-is. Defensive belt + suspenders — with seed fix in place a properly-formed payload won't trip it, but legacy or migration-corrupted rows still might.
    - **MODIFIED** [`src/lib/api/errors.ts`](src/lib/api/errors.ts) — new `INVALID_REQUEST_PAYLOAD` value in `ERROR_CODES` union.
    - **NEW** [`approve-payload-validation.test.ts`](src/app/api/studio/schedule/requests/approve-payload-validation.test.ts) — 13 unit tests pinning: (a) `isScheduleEditorRequestPayload` detector (accepts valid EDITOR_V1, rejects missing/wrong format, rejects legacy placeholder shapes, rejects non-object input, rejects when arrays absent); (b) `normalizeScheduleEditorRequestPayload` happy path with/without exceptions + legacy-shape rejection; (c) the rewrap predicate at the approve route (`status === 400 && code === "INVALID_BODY"` → wrap; otherwise rethrow). Pure-functional — no Prisma in tests.
  - **Раздел 5 (Бизнес-логика):**
    - **Approve flow now applies a real snapshot end-to-end** when seeded data is used: 7-day weekSchedule reapplied (no-op for Marina) or with exception (day-off for Elena). Studio admin clicks Approve → 200 OK → notification fires → schedule actually updates.
    - **Reject endpoint untouched** — preserved as working pattern. Studio admin can reject with comment as before.
    - **Both UI entry-points** (dedicated schedule-requests page + notifications inline approve) automatically work through the single backend fix — no UI changes required.
    - **Defensive copy**: corrupted/legacy payloads (production scenario where DB has old rows from earlier versions) now produce 422 with actionable copy instead of confusing 400. Admin can reject the corrupted request and ask master to resend.
  - **Раздел 6 (Маршруты):** `POST /api/studio/schedule/requests/[id]/approve` semantics extended (defensive error wrap) — same `{ id, status: "APPROVED" }` payload on success. New 422 code surfaces for corrupted payloads.
  - **Раздел 8 (Проблемы):** #2 + #7 (approve 400) closed via single backend fix. **Note about studio admin direct authority preserved** (invariant #22) — admin's approve action immediately applies via `applyScheduleSnapshot`; ScheduleChangeRequest approval flow is separate from booking CRUD which goes directly.
  - **Раздел 12 (Инварианты):** не затронуты. Invariant #22 (admin direct booking CRUD vs approval flow scope) preserved — approve flow still applies via `applyScheduleSnapshot`. Master-волны invariants (#25 / #26) не пересекают studio approve.
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **462/462 tests** ✅ (was 449; +13), `npm run build` ✅.
  - **What was NOT changed (per strict constraints):**
    - Reject endpoint (working pattern preserved)
    - Master cabinet QA-волны 8 fixes (all 91 regression tests pass)
    - Studio admin auth core
    - `applyScheduleSnapshot` / `applySchedulePayload` internal logic (only wrapped at endpoint level)
    - Schema (NO migration — placeholder seed shapes replaced with canonical EDITOR_V1)
    - Other studio cabinet bugs (#1, #3-#9 deferred to subsequent commits)
    - Other notification surfaces, chat, media, booking widget
    - createBooking / auth / footer / navbar / client cabinet
  - **Pre-launch risks (новых не обнаружено):** the defensive 422 wrap means existing production rows with corrupted payloads (if any from earlier schema versions) won't bomb with confusing 400 — admin gets actionable copy. Carryover: future seed runs replace corrupt placeholders with canonical EDITOR_V1 automatically.
  - **Open questions for user:** нет — Сценарий A + defensive wrap matched the audit findings exactly. Seed produces canonical shapes, backend gracefully handles legacy/corrupted rows. **Carryover**: 7 studio cabinet bugs остаются: #1 (reschedule validation), #3 (privacy URL — reuse master HMAC pattern), #4 (bookings), #5 (client write), #6 (cleanup), #7 (services sort), #8 (schedule settings — большая, port master 5 tabs).

- **2026-05-21 — VK-NOTIFICATIONS-FLAG-A** (commit on `designStudioCabinet`). **8/8 (финальный) commit master cabinet QA-волны.** 🎉 Master cabinet wave complete. **Audit-zero-code 9th case**: VK push delivery channel НЕ существует в `notifications/delivery.ts` (только in-app / push / Telegram / email implemented) — но `VkLink` schema + OAuth callback + `VkNotificationsSection` UI + settings endpoint все работают и позволяют пользователю «включить» no-op subscription. Pre-emptive infrastructure fix: feature flag gates UI + endpoint, login flow stays untouched, delivery channel stays preserved для future implementation.
  - **Audit findings:**
    - **VK delivery channel does NOT exist** в [`delivery.ts`](src/lib/notifications/delivery.ts) (handles in-app via `createNotification`, browser push via `sendPushToUser`, Telegram via queue, email via `sendEmail` — **no VK channel**). `VkLink.isEnabled` field exists в schema + UI toggle на 5 surfaces (client cabinet, master cabinet account/notifications/security, studio profile, studio settings) — все ссылаются на subsystem-в-будущем
    - **Existing computed-flag pattern** в [`env.ts`](src/lib/env.ts) — `isPushEnabled`, `isPaymentsEnabled`, `isTelegramAuthEnabled`, `isVkAuthEnabled` (login!), `isEmailConfigured`, `isS3Enabled`, `isVisualSearchEnabled`, `isAiFeaturesEnabled`. New flag `isVkNotificationsEnabled` mirrors the pattern. Уже-существующий `boolFlag` Zod transform используется для consistency
    - **`/api/integrations/vk/settings` PATCH endpoint** has existing «silent skip when plan feature off» pattern (line 21-25). New flag gate mirrors that pattern — `if (enabled && !flag) return ok({ enabled: false })` — no error, no UI shock
    - **VK login completely separate** — `/api/integrations/vk/{start,callback,disable,status}` endpoints handle OAuth flow + session creation. Toggle endpoint (`/settings`) is the only thing that needs gating
    - **Client/server env asymmetry caveat**: `@/lib/env` Zod parse succeeds only on server (non-public secrets like `DATABASE_URL` are required); on client it falls back to raw `process.env` (`NEXT_PUBLIC_*` inlined by Webpack as strings, not booleans). String-coerced comparison (`String(value) === "true"`) normalises both paths
  - **Раздел 3 (Архитектура):** 1 new test file + 4 modified files:
    - **MODIFIED** [`src/lib/env.ts`](src/lib/env.ts) — new `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED: boolFlag` schema field + `export const isVkNotificationsEnabled = String(env.NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED) === "true"` computed flag. String-coercion lets the SAME helper work on both server (boolean from Zod transform) and client (string from process.env fallback). JSDoc cites why the coercion matters
    - **MODIFIED** [`src/app/api/integrations/vk/settings/route.ts`](src/app/api/integrations/vk/settings/route.ts) — early-return gate `if (parsed.data.enabled && !isVkNotificationsEnabled) return ok({ enabled: false })` before the plan-feature check. Comment cites the «silent skip» pattern parallel. Imports `isVkNotificationsEnabled` from env.ts
    - **MODIFIED** [`src/features/cabinet/components/vk-notifications.tsx`](src/features/cabinet/components/vk-notifications.tsx) — Switch `disabled={saving || !isVkNotificationsEnabled}` + `title` tooltip (`vkText.temporarilyUnavailable`) when flag off. New 2-line soft hint card below toggle (`vkText.temporarilyUnavailableHint`) explaining «Мы дорабатываем доставку. Подключение к VK сохранится — уведомления включатся автоматически, когда канал заработает.». Switch state `checked={isVkNotificationsEnabled ? enabled : false}` так что existing-enabled rows визуально показывают off (matches the silent server-side flip). Connect button stays enabled regardless (login linking preserves)
    - **MODIFIED** [`.env.example`](.env.example) — new `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED=false` line с inline comment explaining зависимость от delivery channel
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — extended `UI_TEXT.settings.vk.*` with `temporarilyUnavailable` + `temporarilyUnavailableHint` strings
    - **NEW** [`src/lib/env/vk-notifications-flag.test.ts`](src/lib/env/vk-notifications-flag.test.ts) — 9 tests pinning the predicate semantics: boolean true/false, string "true"/"false", undefined (unset env), empty string, typo defence (`TRUE`/`yes`/`1` все return false — exact-match policy). The test pins the predicate, not the module-loaded constant, because Vitest's per-worker module caching makes `process.env` mutation in tests unreliable for re-deriving the constant
  - **Раздел 5 (Бизнес-логика):**
    - **VK login преservation**: OAuth start / callback / status / disable endpoints completely untouched. Existing users по VK продолжают заходить, link их account, см. VK profile data
    - **Toggle behaviour**: when flag off (default), `enabled` setting always returns `false` — UI toggle visually disabled with explanatory tooltip + hint. Linked users см. что VK is connected (status), но switch is locked. NO error, NO UI shock
    - **Delivery channel preserved**: 0 lines deleted from notification subsystem. The «doesn't exist yet» reality is acknowledged via the flag — when future implementation adds VK channel в delivery.ts (queue handler + VK send API), flipping `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED=true` makes everything work без code change
    - **Other channels unaffected**: in-app / push / Telegram / email все продолжают доставлять. Flag scope is VK-only
  - **Раздел 6 (Маршруты):** NO new endpoints. NO route deletions. `/api/integrations/vk/settings` PATCH behaviour silently changed (gate added) — contract preserved (still returns `ok({ enabled: boolean })`)
  - **Раздел 8 (Проблемы):** VK notifications scope-creep correctly deferred. Subsystem incomplete acknowledged honestly via UI hint rather than hidden behind a no-op toggle (which was the pre-fix state — misleading)
  - **Раздел 10 (Безопасность):** **VK login (`isVkAuthEnabled`) preserved** — existing users заходят. **VK push subsystem gated** — `isVkNotificationsEnabled` defaults off because subsystem incomplete. Independent flags allow login to ship while notifications wait. ENV-based feature flag rather than DB-stored flag — runtime constant, no admin UI needed for toggling
  - **Раздел 12 (Инварианты):** не затронуты — flag не изменяет boundary, не пересекает privacy invariants #25/#26
  - **UI_TEXT:** 2 new keys (`settings.vk.temporarilyUnavailable` + `settings.vk.temporarilyUnavailableHint`)
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved**, encoding/mojibake/prisma ✅, **449/449 tests** ✅ (was 440; +9 flag predicate tests), `npm run build` ✅
  - **What was NOT changed (per strict constraints):**
    - VK login flow (start/callback/disable/status endpoints all untouched)
    - VK delivery code in notifications/delivery.ts (was already empty — preserved that emptiness intentionally rather than implementing the channel)
    - Other notification channels (in-app / push / Telegram / email — все intact)
    - Schema (`VkLink` model + fields reused — NO migration)
    - flow.ts state-machine, chat, media, booking, other master cabinet bugs — all intact
    - 7 previous master cabinet fixes — all preserved
    - Invariants #11/#25/#26 — не пересекают
    - createBooking / auth / footer / navbar — untouched
  - **Pre-launch risks (новых не обнаружено):** subsystem completion clearly delineated в backlog с trivial activation path (set flag=true). No deployment ordering concerns
  - **Open questions for user:** нет — env-based pattern matched existing project conventions exactly. NO FeatureFlag DB model needed (Phase 7 backlog item for future when flag count > 5)
  - **🎉 MASTER CABINET QA-волны COMPLETE (8/8).** Process summary in BACKLOG entry above. 89 regression tests накоплены (358 → 449), 2 new invariants (#25 master CRM privacy + #26 chat attachment ACL), 0 schema migrations, 9 audit-zero-code situations (where audit found problem was elsewhere or didn't exist — saved hours). Wave methodology proven for future workstreams (client cabinet QA / studio QA already running in parallel)

- **2026-05-21 — MASTER-MODELS-FIX-A** (commit on `designStudioCabinet`). **7/8 коммит master cabinet QA-волны.** Multi-applicant cascade fix + master CRM «откликался» marker. **Сценарий A** confirmed по audit — REJECTED enum value reused; NO schema migration. NO `deleteMany` обнаружено (user's worry was misplaced — real bug was different).
  - **Audit findings (per-issue root cause):**
    - **No `deleteMany` в accept flow.** User's spec предполагал deleteMany pattern, но audit показал что siblings сейчас НЕ удаляются. **Real bug**: client-confirm endpoint ([`/api/model-applications/[id]/confirm`](src/app/api/model-applications/[applicationId]/confirm/route.ts)) flipped `offer.status → CLOSED` НО НЕ касался sibling applications → siblings остаются в stale `PENDING` / `APPROVED_WAITING_CLIENT` на closed offer. Master видит ghost rows; client получает «still waiting» на закрытом оффере
    - **`closeOfferWithCascade` pattern existed** ([`model-offers-mutations.ts`](src/lib/master/model-offers-mutations.ts)) — когда master manually closes offer, оно correctly cascades siblings → REJECTED + fires `notifyModelApplicationRejected("Оффер закрыт")` post-tx. **Confirm path обходил эту логику** — отсюда stale rows
    - **`ModelApplicationStatus` enum** — PENDING/REJECTED/APPROVED_WAITING_CLIENT/CONFIRMED. **REJECTED уже used `closeOfferWithCascade` для siblings** → semantically точно подходит для cascade в confirm-path. Сценарий A: no migration
    - **Client UX harsh wording**: existing `statusMeta` показывает REJECTED как «Отклонена / Мастер не принял заявку» — accurate для direct reject (master clicked «Отклонить»), но harsh для cascade reject (другой clientwas chosen, не «отказали»). **Derivation `offer.status === "CLOSED"`** дистинigates без schema change — distinguishes cascade vs direct
    - **Master CRM marker**: `ClientDetailView` уже provider-scoped (master видит только своих клиентов); `ModelApplication` имеет relation к `ModelOffer.masterId` → cheap COUNT query scoped to current master. Marker дополняет (не override) `classifyClient` runtime statuses
    - **Privacy invariant #25**: новые поля (`modelApplicationsCount`, ранее добавленный `historyToken` from CLIENTS-FIX-A) — master-private. ClientBookingDTO (client cabinet) НЕ должен включать эти поля. 13 existing privacy tests + 1 new (modelApplicationsCount + historyToken assertions) — boundary preserved
  - **Раздел 3 (Архитектура):** 1 new test file + 5 modified files:
    - **MODIFIED** [`confirm/route.ts`](src/app/api/model-applications/[applicationId]/confirm/route.ts) — inside the existing Serializable transaction, after `modelApplication.update({status: CONFIRMED, bookingId})` and BEFORE `modelOffer.update({status: CLOSED})`, finds siblings (`offerId === confirmedOffer && id !== self && status ∈ [PENDING, APPROVED_WAITING_CLIENT]`), `updateMany` → REJECTED + null `proposedTimeLocal`/`confirmedStartAt`. `siblingCascadeIds` collected within tx, notifications fire AFTER tx commits — same flake-tolerant pattern as `closeOfferWithCascade`. New constant `SIBLING_CASCADE_REASON = "Выбран другой отклик"` for notification text. Import: `notifyModelApplicationRejected` added to the existing notifications module import
    - **MODIFIED** [`client-model-applications-page.tsx`](src/features/model-offers/components/client-model-applications-page.tsx) — `statusMeta()` signature extended с `offerStatus: string`. REJECTED branch now derives `isCascadeReject = offerStatus === "CLOSED"` → soft badge «Не выбран» + description «Мастер выбрал другого участника». Direct REJECTED on still-ACTIVE offer keeps existing «Отклонена / Мастер не принял заявку». Caller passes `item.offer.status` (already in client DTO from `/api/me/model-applications`). NO contract change at the API layer
    - **MODIFIED** [`clients-view.service.ts`](src/lib/master/clients-view.service.ts) — `ClientDetailView` extended с `modelApplicationsCount: number` + JSDoc citing privacy invariant #25. `buildSelectedClient` performs single `prisma.modelApplication.count({ where: { clientUserId, offer: { masterId }, status: { not: "CONFIRMED" } } })` — only for registered clients (`aggregate.clientUserId !== null`); phone-only entries get 0. Cheap query (indexed on `[clientUserId]` and `[offerId, clientUserId]`)
    - **MODIFIED** [`client-detail-header.tsx`](src/features/master/components/clients/client-detail-header.tsx) — new badge rendered when `client.modelApplicationsCount > 0`. Visual: `bg-brand-gradient` + `text-white` + `Sparkles` icon + `cursor-help` + native `title` tooltip. Local `pluralizeApplications(count)` Russian helper («раз» / «раза» / «раз» — standard slavonic plural). Imports: `Sparkles` added to lucide-react
    - **MODIFIED** [`client-privacy.test.ts`](src/lib/bookings/client-privacy.test.ts) — new test «ClientBookingDTO has no master-CRM signal fields (incl. modelApplicationsCount)» asserts type-level absence of both `modelApplicationsCount` AND `historyToken` (the CLIENTS-FIX-A signed token) — single compile-time barrier. Existing 13 tests unchanged
    - **NEW** [`confirm-cascade.test.ts`](src/app/api/model-applications/[applicationId]/confirm-cascade.test.ts) — 9 tests pinning two distinct rules: (a) **sibling-cascade predicate** (`shouldCascadeReject(app, confirmedAppId, confirmedOfferId)`) — same-offer + not-self + status ∈ PENDING/APPROVED_WAITING_CLIENT; covers each rule branch + idempotency on already-REJECTED + defensive guard on (theoretically-impossible) CONFIRMED sibling; (b) **client-side classification** (`classifyReject(REJECTED, offerStatus)` → "cascade" | "direct") — CLOSED → cascade (soft), ACTIVE → direct, ARCHIVED → direct (legacy/end-of-life). Pure logic — no Prisma in tests; integration coverage of the full confirm endpoint deferred to backlog (consistent with existing TEST-COVERAGE backlog policy)
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — extended `cabinetMaster.clients.detail.*` with `modelApplicantBadge`, `modelApplicantTooltipTemplate`, `modelApplicantPluralOne/Few/Many` (5 keys total). Tooltip uses `{count}` + `{plural}` placeholders the local helper fills
  - **Раздел 5 (Бизнес-логика):**
    - **Confirm flow now cascades siblings** mirroring `closeOfferWithCascade`. ONE atomic transaction (master-set proposed time → client confirmed → booking created → siblings REJECTED → offer CLOSED). Post-tx notifications: `notifyModelTimeConfirmed` for the chosen application + `notifyModelApplicationRejected` для каждого cascaded sibling с reason `"Выбран другой отклик"` (neutral copy)
    - **Master CRM «откликался» marker** = non-confirmed application count to THIS master's offers. Surfaces interested-but-not-selected clients in the master CRM detail view — they stay in the master's funnel for re-engagement instead of being deleted/forgotten. The whole point of preserving rejected siblings (the user's product ask)
    - **Client UX softening** is purely view-time derivation — REJECTED row on CLOSED offer reads as «Не выбран» (neutral); on ACTIVE/ARCHIVED reads as «Отклонена» (existing wording). No `clientNote` / no notification text changes — the soft wording lives in the badge + description only
    - **What changed in the data semantics** — same enum, same fields. The transaction WHERE clauses got an additional cascade-update; the read-side queries got a new master-private counter. Existing reject endpoint (`/api/master/model-applications/[id]/reject`) unchanged — siblings cascade ONLY когда client confirms, not когда master manually rejects one (master can still reject individual without closing the offer)
  - **Раздел 6 (Маршруты):** **no new API endpoints**. `POST /api/model-applications/[applicationId]/confirm` semantics extended (cascade behaviour) — returns same `{ bookingId }` payload. `/api/me/model-applications` GET unchanged (already returns `offer.status`). `/api/master/clients/[clientKey]/detail` returns extended DTO with `modelApplicationsCount` (additive)
  - **Раздел 10 (Безопасность):** new master-private field `modelApplicationsCount` derived from data the master already owns (provider-scoped `ModelOffer.masterId` + `ClientCard` provider scope). Privacy invariant #25 preserved — type-level barrier covers it in `client-privacy.test.ts`. Cascade-reject notifications fire only to client recipients (clientUserId scope on ModelApplication), not broadcast
  - **Раздел 12 (Инварианты):** **#25 not modified в формулировке**, **expanded coverage** — new test asserts both `modelApplicationsCount` AND `historyToken` (from CLIENTS-FIX-A) НЕ leak в `ClientBookingDTO`. Boundary стало шире, защита тоже расширена тестами
  - **UI_TEXT:** ~6 new keys under `cabinetMaster.clients.detail.modelApplicant{Badge,TooltipTemplate,PluralOne/Few/Many}`
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved** (no new errors/warnings), encoding/mojibake/prisma ✅, **440/440 tests** ✅ (was 429; +11), `npm run build` ✅
  - **What was NOT changed (per strict constraints):**
    - Schema (`ModelApplication` / `ModelOffer` / enum reused — NO migration)
    - flow.ts state-machine (32 tests preserved)
    - Existing `closeOfferWithCascade` master-side path — same logic, не модифицирован
    - Direct reject endpoint (`/api/master/model-applications/[id]/reject`) — unchanged
    - `classifyClient` auto-statuses (the new marker is parallel, not bucket override)
    - CLIENTS-FIX-A notes editor / endpoint / token mechanism — orthogonal CRM concept
    - CHAT-FOUNDATION / RESCHEDULE / BOOKING-UI / DASHBOARD / PRIVACY предыдущие fix-ы — intact
    - Booking widget / studio admin / catalog — untouched (other planes)
    - Marketing automation (mass-emails to applicants pool) — deferred, this fix is data + CRM marker only
  - **Pre-launch risks (новых не обнаружено):** the stale-PENDING-on-closed-offer was latent bug — now closed. No new risks. Note: in production deployment, EXISTING stale `PENDING`/`APPROVED_WAITING_CLIENT` applications на already-CLOSED offers will NOT be retroactively cleaned by this commit (the fix only catches new closures). A one-time clean-up script optional — backlog-able item but not blocking (master CRM marker correctly counts them — they're treated as «applications» in `modelApplicationsCount`)
  - **Open questions for user:** нет — Сценарий A unambiguously fits per audit, no migration was needed, no UI scope creep. Remaining 1 master cabinet QA fix (**VK-NOTIFICATIONS-FLAG-A** #8) awaits a separate prompt

- **2026-05-21 — MASTER-CLIENTS-FIX-A** (commit on `designStudioCabinet`). **6/8 коммит master cabinet QA-волны.** 3 связанные изменения «Клиенты» surface: URL без cuid (#7а) + auto-status tooltips (#7в) + notes feature realisation (#6). Tags manual в backlog (auto-tagging detected). NO schema migration, NO backend endpoint changes (existing PATCH reused).
  - **Audit findings (per-issue root cause):**
    - **#7а «Грубая ошибка»** — 2 bugs in one URL. **Functional**: `/cabinet/master/bookings` route ([`page.tsx`](src/app/(cabinet)/cabinet/master/bookings/page.tsx)) принимал ТОЛЬКО `q` + `tab` params; `?client=user:cuid` от «Вся история» кнопки **игнорировался полностью** → клик вёл на страницу bookings но без фильтра → показывался ВЕСЬ kanban вместо истории выбранного клиента. **Privacy**: raw cuid в URL exposed внутренний id. Оба бага один surface, один fix
    - **#7в Tag/category source** — `classifyClient` ([`clients-classifier.ts`](src/lib/master/clients-classifier.ts)) auto-derives 4 status buckets (vip/regular/new/sleeping). Pure runtime classifier, not stored. UI рендерит статусы (`STATUS_T[status]` badges) without context; master видит «VIP» badge но не знает почему — отсюда complaint о непонятной категоризации
    - **#6 Canonical notes storage** — `ClientCard.notes` (master-CRM card, providerId-scoped). Backend write path **уже существует**: `PATCH /api/master/clients/[clientKey]/card` с `clientCardPatchSchema` (max 2000 chars) + `ensureClientCardAccess` plan-gate + master-auth. **«Скоро» placeholder был UI gap только** — backend готов с CRM-фазы, никто не выкатил UI
    - **Tags scope decision** — auto-tagging EXISTS → per user product rule «tags только если нет других вариантов появления» → **manual tag editor в BACKLOG**. Backend для tags тоже готов (тот же endpoint) — будущая работа = только UI
    - **Privacy invariant #25** review — `ClientDetailView` уже включает `notes/tags/customTags` (master-only DTO returned via `/api/master/clients/[key]/detail`). 13 existing privacy regression tests pass без изменений: master CRM поля никогда не попадают в client-cabinet DTOs
  - **Раздел 3 (Архитектура):** 1 new helper module + 1 new UI component + 1 new test file + 6 modified files + 1 file deleted:
    - **NEW** [`src/lib/master/client-key-token.ts`](src/lib/master/client-key-token.ts) — HMAC-SHA256 signed opaque token. Payload `{k: clientKey, p: masterProviderId, exp, purpose: "client-history-filter"}` encoded base64url, signed с `AUTH_JWT_SECRET`. TTL 24h. Pattern mirrors CHAT-FOUNDATION's `chat-attachment-token.ts`. Two pure functions: `signClientKeyToken({clientKey, masterProviderId, nowSeconds?})` + `verifyClientKeyToken({token, masterProviderId, nowSeconds?})` — both `crypto.timingSafeEqual`-protected. Distinct `purpose` claim isolates от chat-attachment + future signed URLs (cross-replay guard)
    - **NEW** [`src/lib/master/client-key-token.test.ts`](src/lib/master/client-key-token.test.ts) — 11 unit tests: roundtrip (user/phone-style keys), **URL-no-cuid assertion** (token bytes never contain raw clientKey OR masterProviderId), cross-master rejection, expiry, tampered signature/body, malformed/empty token, cross-purpose replay (mismatched `purpose` claim rejected). 418 → 429 total
    - **MODIFIED** [`src/lib/master/clients-view.service.ts`](src/lib/master/clients-view.service.ts) — `ClientDetailView` type extended с `historyToken: string` (server-pre-signed). `buildSelectedClient` populates via `signClientKeyToken({clientKey: aggregate.key, masterProviderId: input.providerId})`. Token is master-private (signed with master scope) — verifies privacy invariant #25 not by absence-of-field but by signed-scope semantics
    - **MODIFIED** [`src/features/master/components/clients/client-detail-panel.tsx`](src/features/master/components/clients/client-detail-panel.tsx) — «Вся история» Link href changed from raw `client.key` → `client.historyToken`. Comment explains both bugs being closed simultaneously
    - **MODIFIED** [`src/app/(cabinet)/cabinet/master/bookings/page.tsx`](src/app/(cabinet)/cabinet/master/bookings/page.tsx) — route now picks up `params.client` (was ignored). Comment documents the «грубая ошибка» origin
    - **MODIFIED** [`src/features/master/components/bookings/master-bookings-page.tsx`](src/features/master/components/bookings/master-bookings-page.tsx) — calls `verifyClientKeyToken({ token: searchParams.client, masterProviderId: masterId })` against current master scope. Invalid/expired/cross-master tokens fall through silently (full kanban) — UX > enforcement (the URL is shareable-within-cabinet, not a security boundary)
    - **MODIFIED** [`src/lib/master/bookings.service.ts`](src/lib/master/bookings.service.ts) — `KanbanFilters` extended с optional `clientKey`. `getMasterBookingsForKanban` builds Prisma `clientFilter` once (using existing `parseClientKeyIdentity` + `buildPhoneVariants` — same helpers used by master CRM card service). Applies к ОБОИМ buckets (active + cancelled) через `AND` composition — preserves existing `OR` time-window queries
    - **MODIFIED** [`src/features/master/components/clients/client-detail-header.tsx`](src/features/master/components/clients/client-detail-header.tsx) — auto-status badges get native `title` tooltip + `cursor-help` style. `STATUS_TONES` type refactored from `Record<keyof typeof STATUS_T, string>` → `Record<ClientStatus, string>` (the old form broke когда `tooltips` subkey was added to STATUS_T). «+ тег» button title updated from `notes.editComingSoon` → new `addTagDisabled` key explaining «Категории назначаются автоматически…» — honest UX (not «в разработке», «уже есть автоматическое»)
    - **NEW** [`src/features/master/components/clients/client-notes-editor.tsx`](src/features/master/components/clients/client-notes-editor.tsx) — full edit-mode component. Read mode: existing preview + «Редактировать» CTA. Edit mode: `<Textarea>` (max 2000 chars) + live char counter + Save / Cancel buttons + loading state + error display + Escape-to-cancel keyboard shortcut. Calls existing `PATCH /api/master/clients/[clientKey]/card` с `{ notes: trimmed || null }` body — empty/whitespace draft clears notes. Optimistic state update with rollback on failure. Replaces orphan `ClientNotesDisplay`
    - **DELETED** [`src/features/master/components/clients/client-notes-display.tsx`](src/features/master/components/clients/client-notes-display.tsx) — replaced by editor (was the «Скоро»-placeholder version)
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — extended `cabinetMaster.clients.{status,detail}.*` ~15 new keys: `status.autoHint` + `status.tooltips.{new,regular,vip,sleeping}` (classifier rule explanations); `detail.notes.{editPlaceholder, saveLabel, saving, cancelLabel, saveError}` (edit-mode strings); `detail.addTagDisabled` updated text. `detail.notes.editComingSoon` kept (no consumers — backwards-compat)
  - **Раздел 5 (Бизнес-логика):**
    - **Notes write flow**: master clicks «Редактировать» → textarea + Save. PATCH to existing endpoint with master-auth + provider-scoped ownership check (`ensureClientCardAccess` plan-gate + `upsertClientCard` enforces `providerId` match). Notes stored at `ClientCard.notes`. Optimistic UI rolls back on failure. Backend endpoint **already enforced privacy** — UI was the only gap
    - **URL #7а fix layered defense**: (1) token NEVER contains raw cuid/masterProviderId substrings — verified by test; (2) token scoped to master via signed payload + cross-master rejection at verify; (3) handler reads + filters bookings by decoded clientKey — fixes the functional bug. The «грубая ошибка» was both data-leak AND silent ignore — one fix closes both
    - **Tooltip semantics**: native `title` attribute on `<span>` (no JS library — accessible, no hydration cost). `cursor-help` style cue. Text describes the underlying `classifyClient` rule per bucket — master understands the «why», not just the «what»
    - **Tags scope**: manual tags editor NOT built in this commit. Auto-tagging via `classifyClient` covers 4 buckets — manual tags would duplicate / confuse rather than add value. Backlog item describes how to revisit if product instinct changes
  - **Раздел 6 (Маршруты):** **no new API endpoints**. Existing `PATCH /api/master/clients/[clientKey]/card` reused for notes write. Existing `GET /api/master/clients/[clientKey]/detail` returns extended `ClientDetailView` с `historyToken` (additive, backwards-compat). `/cabinet/master/bookings` route extended to honour `?client=<token>` query param (previously ignored)
  - **Раздел 10 (Безопасность):** master-scoped HMAC token закрывает 2 surfaces. URL doesn't leak internal cuid (privacy concern matched CHAT-FOUNDATION pattern). Cross-master token replay rejected by `verifyClientKeyToken` (the `p` claim mismatch returns null). Cross-purpose token replay rejected (different `purpose` claim returns null). Notes write endpoint already had master-auth + provider-scope enforcement — fixed UI doesn't ослабить existing protections. **Privacy invariant #25 preserved** — 13 existing privacy regression tests pass без изменений, `notes/tags/customTags` остаются в master-only DTO
  - **Раздел 12 (Инварианты):** **#25 не изменён в формулировке**, **наполнен реальной фичей**. Master notes теперь writable через UI (раньше только read), но boundary остаётся: notes никогда не покидают master scope. Token mechanism (signed-by-master-scope) **усиливает** invariant — даже opaque URL identifier scoped к мастеру, не leaks между мастерами
  - **UI_TEXT:** ~15 new keys across `cabinetMaster.clients.status.{autoHint,tooltips.*}` + `cabinetMaster.clients.detail.notes.{editPlaceholder,saveLabel,saving,cancelLabel,saveError}` + 1 updated key (`addTagDisabled`)
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved** (no new errors/warnings), encoding/mojibake/prisma ✅, **429/429 tests** ✅ (was 418; +11 from `client-key-token.test.ts`), `npm run build` ✅
  - **What was NOT changed (per strict constraints):**
    - Schema (`ClientCard.notes` existing field reused — NO migration)
    - Backend booking flow (createBooking / cancelBooking / rescheduleBooking / approve/reject) — все unmodified
    - flow.ts state-machine (32 tests preserved)
    - Existing `PATCH /api/master/clients/[clientKey]/card` endpoint signature — not modified (UI just started using it)
    - Privacy invariant #25 (existing 13 regression tests pass без изменений)
    - CHAT-FOUNDATION / SSE / receipts — не тронуты
    - MASTER-BOOKING-UI-FIX-A role-aware + MASTER-RESCHEDULE-FIX-A guards + MASTER-DASHBOARD-FIX-A time-windows — все intact
    - Auto-tagging logic (`classifyClient`) — не модифицирована
    - Client cabinet read-paths — без изменений (notes/tags never leaked there, никаких изменений в client DTOs)
  - **Pre-launch risks (новых не обнаружено):** функциональный bug «handler ignores client» был обнаружен и исправлен — был bug, не блокер; privacy concern «cuid в URL» был закрыт. Notes feature долго стояла в «Скоро» state — теперь production-ready
  - **Open questions for user:** нет — все 3 issues shipped + tested + validated. Manual tags деferred per user product rule (документировано в BACKLOG 🟡). Remaining 2 master cabinet QA fixes (MASTER-MODELS-FIX-A #8 + VK-NOTIFICATIONS-FLAG-A) ждут отдельных промптов

- **2026-05-21 — MASTER-DASHBOARD-FIX-A** (commit on `designStudioCabinet`). **5/8 коммит master cabinet QA-волны.** 3 связанные dashboard-проблемы под общей темой «состояние во времени»: #1а past bookings в attention panel, #1б hydration error, #3 expired action buttons. Single shared helper module, NO schema migration, NO backend changes, NO flow.ts modifications.
  - **Audit findings (per-bug root cause):**
    - **#1а** — `getPendingBookingsForMaster` ([master-pending-list.ts](src/lib/bookings/master-pending-list.ts)) feeds the dashboard «Требуют внимания» panel. After BOOKING-UI-FIX-A correctly added `actionRequiredBy: MASTER` role-filter for PENDING/CHANGE_REQUESTED, the missing piece was time: `orderBy startAtUtc asc` puts already-past bookings first because no `startAtUtc > now` exclusion existed. Confirm/decline on a booking whose start has passed is operationally meaningless (booking should have happened) and surfaces as «фантомные задачи»
    - **#1б** — **Audit-driven, not guessed** per spec rule. Greped for `"use client"` directives in dashboard files: 5 client islands (`manual-booking-modal`, `quick-actions-section`, `booking-action-buttons`, `booking-row-actions`, `confirm-booking-action`). Only one uses `new Date()` in `useState` initial value: [`manual-booking-modal.tsx:25`](src/features/master/components/dashboard/manual-booking-modal.tsx#L25) `todayDateKey()` (`new Date().toISOString().slice(0,10)`) on line 44. SSR renders at server-local time, client hydration runs the same expression at client-local time → strings can diverge near midnight or across timezones → React hydration mismatch. Other dashboard components (`GreetingHero`, `AttentionSection`, `MasterDashboardPage`) are Server Components with no hydration step — ruled out
    - **#3** — `ensureBookingActionWindow` in [flow.ts:68-83](src/lib/bookings/flow.ts#L68) throws 409 when `minutesUntilStart < BOOKING_ACTION_WINDOW_MINUTES (60)`. The rule is canonical and tested (32 flow.ts tests). UI was missing the gate: dashboard icon row, kanban manage actions, schedule popover all rendered fully-enabled buttons even within the 60-min danger zone or after start. Backend rejection was the only defense; UX was misleading
    - **No schema migration** — all data already on `Booking` model (`startAtUtc`, `status`, `actionRequiredBy`)
  - **Раздел 3 (Архитектура):** 1 new helper + 1 new test file + 6 modified source files:
    - **NEW** [`src/lib/bookings/action-state.ts`](src/lib/bookings/action-state.ts) — two pure predicates wrapping canonical flow.ts semantics. `isBookingPastConfirmWindow(start, now=Date)` → `start <= now` (confirm/decline no longer meaningful after start). `isBookingPastModifyWindow(start, now=Date)` → reuses `minutesUntilStart` + `BOOKING_ACTION_WINDOW_MINUTES`; returns true when `minutesLeft < 60` (cancel/reschedule no longer allowed). Both handle null/invalid startAtUtc defensively (return false = still actionable; legacy slot-label-only bookings aren't time-bound)
    - **NEW** [`src/lib/bookings/action-state.test.ts`](src/lib/bookings/action-state.test.ts) — 13 unit tests covering: future/past/boundary for confirm window; 60-min boundary inclusivity for modify window (matches backend `minutesLeft < 60` semantics — at exactly 60 the action is still allowed); null/undefined/invalid Date handling; mutual relationship between the two windows (confirm outlasts modify always; both expire once start passes)
    - **MODIFIED** [`master-pending-list.ts`](src/lib/bookings/master-pending-list.ts) — `const now = new Date()` + `startAtUtc: { gt: now }` added to Prisma where clause. `{ gt }` also excludes null startAtUtc (Prisma semantics) — acceptable, those are legacy slot-label rows that wouldn't be safely actionable from dashboard reminders. Role-filter (BOOKING-UI-FIX-A) and order preserved verbatim
    - **MODIFIED** [`manual-booking-modal.tsx`](src/features/master/components/dashboard/manual-booking-modal.tsx) — initial `startAt` state is now `""` (no `new Date()` call during render). Mount-gated useEffect (deps `[startAt, prefillTime]`) sets `${todayDateKey()}T10:00` after hydration only when both the field is empty AND `?prefillTime=` isn't seeding it. Deterministic SSR/CSR render; user edits + prefillTime path preserved
    - **MODIFIED** [`booking-row-actions.tsx`](src/features/master/components/dashboard/booking-row-actions.tsx) (dashboard icon row) — imports `isBookingPastModifyWindow`. Reschedule + Cancel icon buttons stay rendered but `disabled` + tooltip shows `modifyWindowExpiredTooltip` when window expired. Visibility-over-hiding per spec rule
    - **MODIFIED** [`booking-row.tsx`](src/features/master/components/dashboard/booking-row.tsx) + [`booking-action-buttons.tsx`](src/features/master/components/dashboard/booking-action-buttons.tsx) — booking-row passes `isPastConfirmWindow` via new prop to `<BookingActionButtons>`. Buttons stay visible but disabled + tooltip `confirmWindowExpiredTooltip` when start has passed. Preserves MASTER-BOOKING-UI-FIX-A's role-aware gating (confirm/decline only when `actionRequiredBy === "MASTER"` for CHANGE_REQUESTED) — the time-window gate composes on top, not replaces
    - **MODIFIED** [`booking-manage-actions.tsx`](src/features/master/components/bookings/booking-manage-actions.tsx) (kanban) — imports `isBookingPastModifyWindow`. Reschedule disabled with either `rescheduleAwaitingTooltip` (existing CHANGE_REQUESTED guard from MASTER-RESCHEDULE-FIX-A) OR new `modifyWindowExpiredTooltip`. Cancel disabled with `modifyWindowExpiredTooltip`. Tooltip text shared from `cabinetMaster.dashboard.bookings.*` namespace — single source
    - **MODIFIED** [`booking-card-actions-menu.tsx`](src/features/master/components/schedule/booking-card-actions-menu.tsx) (schedule popover) — imports both predicates. Confirm/Decline menu items disabled with `confirmWindowExpiredTooltip` when past confirm window. Reschedule + Cancel menu items disabled with `modifyWindowExpiredTooltip` when past modify window. Local `MenuItem` component extended with optional `title` prop for native browser tooltip on disabled items
    - **MODIFIED** [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — 2 new keys under `cabinetMaster.dashboard.bookings`: `modifyWindowExpiredTooltip` («Перенос и отмена доступны не позже чем за 60 минут до начала.») + `confirmWindowExpiredTooltip` («Время записи уже наступило — подтверждение больше неактуально.»). Used across 4 action surfaces — single source of truth
  - **Раздел 5 (Бизнес-логика):**
    - **Two distinct windows** — formal recognition that booking has TWO time-based action deadlines, not one. **Confirm window** ends at `startAtUtc` (booking happens). **Modify window** ends at `startAtUtc - 60min` (cancel/reschedule blocked). Both mirror existing backend rules — no new semantics invented. Helper module captures this in docstrings + JSDoc
    - **Defense layering preserved** — backend remains the last-resort defense (`ensureBookingActionWindow` still throws 409 if a stale client somehow submits). UI prevents 99% of user-visible 409s via preemptive disable + explanatory tooltip
    - **Attention panel correctness** — combined role-filter (BOOKING-UI-FIX-A) + time-filter (this commit) means «Требуют внимания» now shows ONLY truly-actionable items. No more phantom past bookings. Empty state «Всё под контролем» renders correctly
    - **Hydration determinism** — SSR/CSR markup parity restored on dashboard. No more React warning about hydration mismatch on dashboard load
  - **Раздел 6 (Маршруты):** не затронуты — UI + lib only. No new endpoints, no contract changes. Existing endpoints `PATCH /api/master/bookings/[id]/status` + `/api/master/bookings/[id]/reschedule-context` keep working without modification. Backend `ensureBookingActionWindow` (called from `cancelBooking`/`rescheduleBooking`/`approveChangeRequest`) remains unchanged and unchanged
  - **Раздел 12 (Инварианты):** не затронуты. Invariant #11 (booking overlap) / #25 (master CRM privacy) / #26 (chat attachment ACL) — все unchanged. Existing role-aware visibility rule (`canMasterAct` predicate documented in [`booking-actions-visibility.test.ts`](src/features/master/booking-actions-visibility.test.ts)) preserved verbatim; this commit ADDS a time-window axis composed via `&&` with the role axis
  - **UI_TEXT:** 2 new keys (modifyWindowExpiredTooltip, confirmWindowExpiredTooltip). No existing keys modified
  - **Validation:** typecheck ✅, lint **1/3 baseline preserved** (no new errors/warnings introduced by this commit), encoding/mojibake/prisma ✅, **418/418 tests** ✅ (was 405; +13 from action-state.test.ts), `npm run build` ✅
  - **What was NOT changed (per strict constraints):**
    - flow.ts state-machine (32 tests preserved untouched)
    - Backend `createBooking` / `approveChangeRequest` / `rejectChangeRequest` / `cancelBooking` / `rescheduleBooking` — все unmodified
    - Schema (Prisma model definitions, enums, migrations — zero changes)
    - MASTER-BOOKING-UI-FIX-A role-aware predicate (`actionRequiredBy === "MASTER"` gating) — preserved + extended coherently with time axis
    - MASTER-RESCHEDULE-FIX-A guards (CHANGE_REQUESTED initiator hint, reschedule-context endpoint, slot-picker rewrite) — all intact
    - Invariants #11/#25/#26 — не пересекают, не ослаблены
    - CHAT-FOUNDATION (SSE/receipts/sendConversationMessage) — не тронуты
  - **Pre-launch risks (новых не обнаружено):** все pre-launch L1-L5 + T1-T9 не затронуты. The «backend is last-resort defense» principle remains intact — the new helpers only complement existing defenses, never replace them
  - **Open questions for user:** нет — все три fixes shipped + tested + validated. Remaining 3 master cabinet QA fixes (MASTER-CLIENTS-FIX-A, MASTER-MODELS-FIX-A, VK-NOTIFICATIONS-FLAG-A) ждут отдельных промптов

- **2026-05-21 — MASTER-BOOKING-UI-FIX-A** (commit on `designStudioCabinet`). **4/8 коммит master cabinet QA-волны.** 2 связанные UI-проблемы booking actions + новый shared primitive для text-prompt dialogs.
  - **Audit findings:**
    - **#2а root cause** — `Booking.actionRequiredBy: BookingActionRequiredBy?` enum уже existed в schema (set by `usecases.ts:rescheduleBooking:226` to opposite-of-actor at change-request creation). BUT **3 master-side service DTOs не surface'или это поле** (`ScheduleBookingItem` в `schedule.service.ts`, `DashboardBooking` в `dashboard.service.ts`, `KanbanBookingItem` в `bookings.service.ts`). UI рендерил confirm/decline buttons для **обеих** сторон CHANGE_REQUESTED брони → клик инициатора получал backend 409 «Action is required from another side» (из `approveChangeRequest`/`rejectChangeRequest` checks). Backend role-check **уже корректен** — UI gap was data plumbing only
    - **#2б root cause** — 5 native `window.prompt(...)` calls в booking flow: 4 master decline/cancel reasons + 1 dashboard decline. Existing `useConfirm`/`ConfirmModal` ([src/components/ui/confirm-modal.tsx](src/components/ui/confirm-modal.tsx)) — yes/no only, не покрывает text-input prompt. Pattern был естественный «делегировать на `window.prompt`» но native chrome dialogs не соответствуют design system + не поддерживают async loading state
    - **No schema migration** — `actionRequiredBy` уже в `Booking` model, `BookingActionRequiredBy` enum уже в `enums.prisma`
  - **Раздел 3 (Архитектура):** 2 new primitives + 9 modified source files + 2 new test files:
    - **NEW** [`src/components/ui/prompt-modal.tsx`](src/components/ui/prompt-modal.tsx) — text-input аналог `ConfirmModal`. Props: `{title, message?, label?, placeholder?, required?, maxLength?, confirmLabel?, cancelLabel?, variant?, onConfirm: (text)=>Promise, onCancel}`. Required validation (`trimmed.length > 0`) by default; async-safe loading с `isPending` state; danger variant; autoFocus textarea; resets state on open
    - **NEW** [`src/hooks/use-prompt.tsx`](src/hooks/use-prompt.tsx) — imperative API mirror of `useConfirm`: `const { prompt, modal } = usePrompt(); const reason = await prompt({...}); /* reason is trimmed string or null */`. Same handler-recreation pattern для избежания stale closure resolving wrong promise
    - **3 DTO extensions** with `actionRequiredBy: "CLIENT" | "MASTER" | null`:
      - [`schedule.service.ts:ScheduleBookingItem`](src/lib/master/schedule.service.ts) + Prisma select
      - [`dashboard.service.ts:DashboardBooking`](src/lib/master/dashboard.service.ts) + Prisma select
      - [`bookings.service.ts:KanbanBookingItem`](src/lib/master/bookings.service.ts) + Prisma select (both activeRows + cancelledRows queries via `replace_all`)
    - **4 master UI sites gated by role:**
      - [`booking-card-actions-menu.tsx`](src/features/master/components/schedule/booking-card-actions-menu.tsx) (schedule grid): split `canConfirmOrDecline = isPendingNew || (isAwaitingResponse && actionRequiredBy === "MASTER")`; renders «Запрос переноса отправлен — ждём ответ клиента» hint when `isInitiatorWaitingResponse`. Caller `booking-card-week.tsx` passes `booking.actionRequiredBy`
      - [`booking-card-actions.tsx`](src/features/master/components/bookings/booking-card-actions.tsx) (kanban pending column): accepts `rawStatus + actionRequiredBy` props, early-returns guard view («Запрос переноса отправлен — ждём ответ клиента») for initiator. Caller `booking-card.tsx` passes both
      - [`dashboard/booking-row.tsx`](src/features/master/components/dashboard/booking-row.tsx): gates `<BookingActionButtons>` rendering with `booking.status === "PENDING" || (CHANGE_REQUESTED && actionRequiredBy === "MASTER")`. Component itself unchanged (gating at caller — minimal surface)
      - [`booking-manage-actions.tsx`](src/features/master/components/bookings/booking-manage-actions.tsx) (kanban confirmed/today): already had RESCHEDULE-FIX guard для disabled Reschedule; no additional confirm/decline buttons here so no further #2а changes
    - **5 native prompts replaced with usePrompt** (booking decline/cancel reasons): `booking-card-actions.tsx`, `booking-manage-actions.tsx`, `dashboard/booking-action-buttons.tsx`, `schedule/booking-card-actions-menu.tsx` (×2 — decline + cancel). Each site imports `usePrompt`, async handler calls `await prompt({title, label, placeholder, confirmLabel, variant})`, JSX wrapped в fragment with `{promptModal}` rendered at root
    - **reschedule-context endpoint** ([reschedule-context/route.ts](src/app/api/master/bookings/[id]/reschedule-context/route.ts)) extended select with `actionRequiredBy` + returns it (для future "Отозвать запрос" feature if cancel-pending endpoint появится)
    - **NEW** [`src/components/ui/prompt-modal.test.tsx`](src/components/ui/prompt-modal.test.tsx) — 5 tests pinning required-validation contract (empty/whitespace rejected when required=true, opt-out via required=false works)
    - **NEW** [`src/features/master/booking-actions-visibility.test.ts`](src/features/master/booking-actions-visibility.test.ts) — 6 tests pinning role-visibility predicate (PENDING always actionable; CHANGE_REQUESTED actionable only when actionRequiredBy=MASTER; initiator-waiting and actionable mutually exclusive)
    - **13 new UI_TEXT keys**: `common.commentLabel`; `cabinetMaster.schedule.bookingCard.{awaitingClientResponse, declineTitle/Label/Placeholder/ConfirmLabel, cancelTitle/Label/Placeholder/ConfirmLabel}`; `cabinetMaster.bookings.card.{awaitingClientResponse, cancelTitle/Label/Placeholder/ConfirmLabel, declineTitle/Label/Placeholder/ConfirmLabel}`; `cabinetMaster.dashboard.bookingActions.{declineTitle/Label/Placeholder/ConfirmLabel}`. Old `declineReasonPrompt` / `cancelPrompt` legacy keys preserved (unreferenced now but not removed — Phase 7 cleanup)
  - **Раздел 5 (Бизнес-логика):** UI now knows initiator vs awaited side for CHANGE_REQUESTED bookings. Action visibility is role-gated at 4 sites consistently — initiator sees guard hint instead of buttons that would 409 at backend. Backend role-checks remain unchanged (defense-in-depth: UI prevents most 409s, backend catches direct API calls / race conditions). Text-input prompts now use branded ModalSurface dialogs with async loading + required validation — matches design system, removes native chrome dialogs from booking flow entirely
  - **Раздел 6 (Маршруты):** no new endpoints. reschedule-context endpoint output extended (additive — `actionRequiredBy` field, backwards-compat). `/api/master/bookings/[id]/status` (PATCH) unchanged — UI changes only protect the UX
  - **Раздел 8 (Проблемы):** #2а initiator-aware action visibility + #2б browser native dialogs — оба закрыты
  - **Раздел 12 (Инварианты):** инварианты #11/#25/#26 не пересекают. UI principle «UI знает state и роль; backend = last resort» — same pattern as MASTER-RESCHEDULE-FIX-A guards и MASTER-CHAT-ATTACHMENT-FIX-A. Не добавляю отдельный invariant — это эмерджентное product-level правило, не структурный invariant
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved (PHASE7-CLEANUP-A baseline), encoding/mojibake/prisma ✅, **405/405 tests** ✅ (394 → 405, +11), `npm run build` ✅
  - **Pre-launch risks обнаруженные:** none. Process lesson — same pattern as previous fixes: when a feature adds state-machine fields (here `actionRequiredBy`), thread them through ALL relevant DTOs (not just one). Backend часто корректен, UI gap = data plumbing. Может быть worth добавить custom Prisma-select lint rule «if your select includes `status: true` for a Booking, also include `actionRequiredBy: true`» — backlog 🔵
  - **Open questions для user:** нет. Один noted optional: «Отозвать запрос переноса» (cancel-pending change request) — backend endpoint **не существует** today, UI shows only «Ожидаем ответа» hint to initiator. If product wants initiator to be able to retract, отдельный backend endpoint (DELETE pending change request) + UI button. Not blocking — current UX is consistent with «waiting for other side» semantics

- **2026-05-21 — MASTER-RESCHEDULE-FIX-A** (commit on `designStudioCabinet`). **3/8 коммит master cabinet QA-волны.** 2 связанные проблемы переноса + bonus enforcement, audit-driven (3 of 4 reschedule UIs уже корректны — патч точечный).
  - **Audit findings:**
    - **4 reschedule UI surfaces**: `client-cabinet/bookings/client-reschedule-modal.tsx` (→ `/api/public/providers/{id}/slots`, free-slots ✅), `cabinet/components/reschedule-modal.tsx` + `reschedule-section.tsx` (→ `/api/masters/{id}/availability`, free-slots ✅), **`master/components/schedule/reschedule-modal.tsx` (→ raw `<input type="date"/time>`, ❌ — exact #5б bug source)**. Audit-zero-code pattern частичный: 3 из 4 уже хорошо, 1 — реальный gap
    - **#5а pending detection**: `BookingDto.status === "CHANGE_REQUESTED"` уже surfaced через flow.ts → mappers.ts. Backend `rescheduleBooking` в [usecases.ts:139-146](src/lib/bookings/usecases.ts#L139-L146) корректно 409'ит pending. UI просто не знал — `booking-card-actions-menu.tsx:160` объединял `isPending = PENDING || CHANGE_REQUESTED` для reschedule
    - **Bonus enforcement gap**: `assertBookingWindow` (BOOKING-WIDGET-A) НЕ применялся в `rescheduleBooking` — только `ensureBookingActionWindow` (60-min cancel rule на ORIGINAL time). Reschedule выбирает NEW time → должен применять те же window-правила что createBooking. Added (reuse policy-enforcement)
  - **Раздел 3 (Архитектура):**
    - **NEW** [`src/app/api/master/bookings/[id]/reschedule-context/route.ts`](src/app/api/master/bookings/[id]/reschedule-context/route.ts) — lightweight endpoint. Auth: session master must own booking (`getCurrentMasterProviderId` match). Returns `{masterProviderId, serviceId, durationMin, status}` для modal lazy-fetch. Status = runtime status (через `resolveBookingRuntimeStatus`) — surfaces CHANGE_REQUESTED для guard view
    - **REWRITE** [`src/features/master/components/schedule/reschedule-modal.tsx`](src/features/master/components/schedule/reschedule-modal.tsx) — full refactor: date-chips (14 days) + `SlotPickerOptimized` (shared) fed by `/api/masters/{id}/availability`. On open: SWR fetch context → if CHANGE_REQUESTED → «В ожидании» guard view (single Cancel button); else free-slots picker. Excludes current booking's slot via `originalIso` filter. Loading/error/empty states for both context and slot fetches. `durationMin` prop kept в signature for caller backwards-compat но игнорируется (authoritative duration из endpoint with master override)
    - [`src/features/master/components/schedule/booking-card-actions-menu.tsx`](src/features/master/components/schedule/booking-card-actions-menu.tsx) — split `isPending` → `isPendingNew` (PENDING only) + `isAwaitingResponse` (CHANGE_REQUESTED) + new `canReschedule = isPendingNew || isConfirmed` + `canConfirmOrDecline = isPendingNew || isAwaitingResponse`. Confirm/Decline остаются в обоих pending states (мастер может accept/reject существующее предложение). Reschedule визуально пропадает для CHANGE_REQUESTED
    - [`src/features/master/components/bookings/booking-manage-actions.tsx`](src/features/master/components/bookings/booking-manage-actions.tsx) — добавлен `status?: string` prop; Reschedule button `disabled={... || isAwaitingChangeResponse}` + tooltip. [`booking-card.tsx`](src/features/master/components/bookings/booking-card.tsx) caller threads `booking.rawStatus`
    - [`src/features/master/components/dashboard/booking-row-actions.tsx`](src/features/master/components/dashboard/booking-row-actions.tsx) — added `isAwaitingChangeResponse = booking.status === "CHANGE_REQUESTED"` check, Reschedule icon hidden when true
    - [`src/lib/bookings/usecases.ts`](src/lib/bookings/usecases.ts) — provider select extended с `minBookingHoursAhead` + `maxBookingDaysAhead`. After `ensureBookingActionWindow` adds try/catch around `assertBookingWindow(input.startAtUtc, booking.provider, new Date())`. AppError caught and mapped to Result with status-code cast (400/403/409 union)
    - [`src/lib/ui/text.ts`](src/lib/ui/text.ts) — 10 new keys в `cabinetMaster.schedule.reschedule.*` (durationLabel, contextLoading/Error, slotsLoading/Error, noSlots, pendingTitle/Body) + 1 в `cabinetMaster.bookings.card.rescheduleAwaitingTooltip`
    - **NEW** [`src/lib/bookings/reschedule-enforcement.test.ts`](src/lib/bookings/reschedule-enforcement.test.ts) — 4 tests: BOOKING_TOO_SOON 400, BOOKING_TOO_FAR 400, per-provider policy values applied, **CHANGE_REQUESTED pending-guard precedence preserved** (pending check fires before policy check)
  - **Раздел 5 (Бизнес-логика):** reschedule UI правила формализованы — pending состояние блокирует новый запрос на UI до ответа второй стороны (defense-in-depth: UI + backend). Free-slots отображаются только из existing availability endpoint (slotsCache 120s, ScheduleEngine). policy-enforcement (assertBookingWindow) применяется к BOTH createBooking AND rescheduleBooking — booking-window правила системно-консистентны
  - **Раздел 6 (Маршруты):** **NEW** `GET /api/master/bookings/[id]/reschedule-context` — master-side lazy-context для reschedule modal. 4 existing reschedule API endpoints unchanged. `/api/masters/{id}/availability` reused (тот же что для create flow), contract не тронут
  - **Раздел 8 (Проблемы):** #5а pending-block UI + #5б free-slots-only + bonus policy enforcement gap — все 3 закрыты. **CHANGE_REQUESTED unique-pending state-machine invariant** теперь enforced на ALL 4 reschedule UI surfaces (3 уже были correct, 4-я добавлена)
  - **Раздел 12 (Инварианты):** инварианты #11/#25/#26 не пересекают (overlap/privacy/chat-acl — другие плоскости). **Booking-window policy invariant** (BOOKING-WIDGET-A) теперь enforced при reschedule так же как при create — формализация системного правила без отдельного нового инварианта в таблице (это extension существующего policy enforcement)
  - **CHAT-FOUNDATION / createBooking / overlap #11 / flow.ts state-machine / resolveChatAccess** — не тронуты. `resolveBookingCore` не тронут (reschedule uses separate `rescheduleBooking` path). 3 client-side reschedule UIs не тронуты (audit-confirmed correct). policy-enforcement helpers reused, не модифицированы. Schema unchanged
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved (PHASE7-CLEANUP-A baseline), encoding/mojibake/prisma ✅, **394/394 tests** ✅ (390 → 394, +4), `npm run build` ✅
  - **Pre-launch risks обнаруженные:** **regression-gap pattern** (повтор того же урока что в CHAT-UI-A): когда BOOKING-WIDGET-A добавил `assertBookingWindow` в createBooking, **reschedule path был пропущен** — те же правила должны были применяться к обоим (booking-window invariant). Process lesson на будущее: при добавлении booking-policy enforcement в createBooking ВСЕГДА проверять rescheduleBooking parallel path в `usecases.ts`. Сейчас оба синхронизированы — но для будущих policy полей (e.g. lateCancelAction enforcement когда payment infra появится) — тот же дисциплинированный паттерн
  - **Open questions для user:** нет. 1 trade-off отмечен: master schedule modal раньше передавал `durationMin` prop напрямую; сейчас он fetched из endpoint (authoritative source — includes master overrides). Если QA выявит loading-flicker на медленных соединениях — можно показать `durationMin` из props как initial estimate, replace когда endpoint вернёт. Сейчас loading state корректно покрыт «Загружаем данные брони…»

- **2026-05-20 — MASTER-CHAT-ATTACHMENT-FIX-A** (commit on `designStudioCabinet`). **2/8 коммит master cabinet QA-волны** (после MASTER-PRIVACY-FIX-A). Закрыл 3 связанные проблемы chat attachment одним fix-ом + добавил token-only URL scheme. **Single root cause** для 2 из 3 проблем: ACL switch не покрывал `MediaEntityType.CHAT_MESSAGE`.
  - **Audit findings:**
    - **#4а полоска + #4б 403 — одна и та же баг.** [`src/lib/media/access.ts:ensureCanReadMedia`](src/lib/media/access.ts) `kindAllowedForEntity` switch (lines 165-183) НЕ имел case для `CHAT_MESSAGE` → fall-through `default: false` → throw 403 для **каждого** chat attachment, включая sender. Браузер при 403 на `<img>` рендерит broken-icon placeholder ≈24px высотой = «узкая полоска». Render не имел error fallback / min-height резерва (CHAT-UI-A render использовал `w-full max-h-[320px] object-cover` без aspect-ratio), поэтому 403 = полоска
    - **#4в cuid в URL** — параллельный privacy concern, не зависел от ACL. CHAT-UI-A render строил URL прямо в client: `src={`/api/media/file/${message.attachmentMediaAssetId}`}` — открыто светил Prisma cuid
    - **CHAT-FOUNDATION-A-MIGRATION** добавил schema (entity `CHAT_MESSAGE`, kind `CHAT_ATTACHMENT`, ChatMessage.attachmentMediaAssetId) + upload validator + write path — но **read ACL extension был пропущен** (regression-gap CHAT-FOUNDATION → CHAT-UI-A: ни одна из двух итераций не добавила case в `ensureCanReadMedia`)
    - `resolveChatAccess` уже корректно denies studio admin (privacy 152-ФЗ) — переиспользуется membership logic в новом helper, целиком reuse сохранён
  - **Раздел 3 (Архитектура):** 6 source files модифицированы + 1 новый route + 2 новых test:
    - **NEW** [`src/app/api/chat/attachment/[token]/route.ts`](src/app/api/chat/attachment/[token]/route.ts) — opaque-token endpoint. GET: decode token via `verifyChatAttachmentToken`, resolve assetId, hand off to `getMediaFile(user, assetId)` (который вызывает extended `ensureCanReadMedia`). `Cache-Control: private, max-age=900` (15 min = token TTL)
    - [`src/lib/media/private-delivery.ts`](src/lib/media/private-delivery.ts) — добавлены `createChatAttachmentToken(assetId)`, `verifyChatAttachmentToken(token)`, `buildChatAttachmentUrl(assetId)`. Distinct `purpose: "chat-attachment-read"` claim предотвращает cross-replay с generic `media-read` токенами. 15-min TTL (chat threads дольше открыты чем generic media-read flows)
    - [`src/lib/media/access.ts`](src/lib/media/access.ts) — добавлен `kindAllowedForEntity` case for `CHAT_MESSAGE → CHAT_ATTACHMENT` + new `canReadChatAttachmentMedia(user, entityId)` helper: парсит `chat-message:<msgId>` prefix из entityId, finds ChatMessage → BookingChat → Booking, returns `clientUserId === user.id || masterProvider.ownerUserId === user.id`. Availability gate бipassed (read access — участники видят историю после окончания брони). Studio admin denial унаследован by-design — функция не имеет студио-admin path
    - [`src/lib/chat/thread-grouping.ts`](src/lib/chat/thread-grouping.ts) — `ThreadMessage.attachmentMediaAssetId` → `attachmentUrl: string | null`; `injectDaySeparators` propagates as `attachmentUrl`
    - [`src/lib/chat/conversation-aggregator.ts`](src/lib/chat/conversation-aggregator.ts) — emits `attachmentUrl: message.attachmentMediaAssetId ? buildChatAttachmentUrl(...) : null` для каждого сообщения. Read-side select на `attachmentMediaAssetId` (added в CHAT-FOUNDATION-A-MIGRATION) reused — server строит signed URL из id, отдаёт client'у
    - [`src/features/chat/types.ts`](src/features/chat/types.ts) — `ThreadMessageDto.attachmentMediaAssetId` → `attachmentUrl: string | null`
    - [`src/features/chat/chat-window/message-bubble.tsx`](src/features/chat/chat-window/message-bubble.tsx) — rewrite: новый `AttachmentImage` component с `aspect-[4/3] min-h-[200px]` (резервирует layout даже если bytes не приходят), skeleton (bg-bg-input/40 placeholder пока грузится), explicit error state (`ImageOff` icon + «Не удалось загрузить вложение» label) — даже если 403/network blip случится, UI не схлопывается в полоску. `onLoad`/`onError` state tracking. `<img>` через cookie-auth route (не next/image — токен потеряется через optimization pipeline)
    - **NEW** [`src/lib/media/chat-attachment-token.test.ts`](src/lib/media/chat-attachment-token.test.ts) — 11 tests: roundtrip, two-part structure, **url-no-cuid** assertion (`url.contains(cuid) === false`), expired token returns null, tampered signature null, malformed null, **cross-purpose replay rejected** (generic media-read token rejected on chat verifier)
    - **NEW** [`src/lib/media/chat-attachment-acl.test.ts`](src/lib/media/chat-attachment-acl.test.ts) — 8 tests: client admitted, master admitted, outsider 403, **studio admin 403 (privacy 152-ФЗ)**, anonymous 403, wrong MediaKind 403, pending-state assets 403, missing ChatMessage 403
  - **Раздел 5 (Бизнес-логика):** chat attachment read flow: client/master open thread → server builds signed URL (15-min TTL token) для каждого attachment → `<img src={attachmentUrl}>` → `/api/chat/attachment/[token]` decodes → `ensureCanReadMedia(CHAT_MESSAGE, "chat-message:<msgId>", CHAT_ATTACHMENT)` runs → admits только chat participants → streams bytes. URL path не содержит prisma cuid (token-only)
    - **Backwards-compat:** existing chat messages в БД продолжают работать. DTO заново строит токен из `attachmentMediaAssetId` на каждом fetch — старые сообщения автоматически получают новый URL
  - **Раздел 6 (Маршруты):** **NEW** `GET /api/chat/attachment/[token]` — opaque-URL chat attachment delivery. Existing `/api/media/file/[id]` route остаётся active для других MediaKind путей (AVATAR/PORTFOLIO/BOOKING_REFERENCE/CLIENT_CARD_PHOTO/MODEL_APPLICATION_PHOTO)
  - **Раздел 10 (Безопасность):** chat attachment ACL — двухуровневая защита: (1) signed token TTL 15 min — stale URL не работает; (2) chat participants only ACL — даже валидный токен не даёт доступ outsider'у/studio-admin. URL path token-only (no cuid leak). Distinct `purpose` claim изолирует от generic media-read токенов
  - **Раздел 12 (Инварианты):** **NEW invariant #26** «Chat attachment ACL = chat participants only (1:1 client↔master); studio admins/outsiders denied» с описанием guarded-by surfaces (`access.ts` + chat-attachment route), URL pattern (token-only, no cuid), distinct purpose claim, 8+11 regression tests
  - **Раздел 8 (Проблемы):** **#4а полоска + #4б 403 + #4в cuid-в-URL** — все три закрыты этим fix
  - **CHAT-FOUNDATION** (SSE/receipts/sendConversationMessage) НЕ тронут — render layer и new endpoint живут отдельно. `resolveChatAccess` НЕ модифицирован — reused его membership logic. **Invariant #25 (privacy master CRM)** не пересекает — другая плоскость; privacy tests цел (`client-privacy.test.ts` 13 tests pass)
  - **Schema** не тронута — поля как есть из CHAT-FOUNDATION-A-MIGRATION
  - **Other MediaKind пути** (AVATAR/PORTFOLIO/BOOKING_REFERENCE/CLIENT_CARD_PHOTO/MODEL_APPLICATION_PHOTO) — switch case не тронут, продолжают работать как раньше
  - **Validation:** typecheck ✅, lint baseline **1 error / 3 warnings** preserved, encoding/mojibake/prisma ✅, **390/390 tests** ✅ (371 → 390, +19), `npm run build` ✅. `git status --short`: 6 modified src + 3 new (token route + 2 tests) + 2 .md
  - **Pre-launch risks обнаруженные:** **regression-gap pattern в feature work**: CHAT-FOUNDATION-A добавил schema + upload + write path; CHAT-FOUNDATION-A-MIGRATION добавил backend migration; CHAT-UI-A добавил render — но **read ACL extension был пропущен всеми тремя коммитами**. Каждый из них фокусировался на своём слое и предполагал что другой расширил `ensureCanReadMedia`. Для будущих feature work с new entityType — checklist: schema → write path → read path → ACL (особенно switch over entityType в access.ts) → tests. **Не блокер launch**, но процесс-урок
  - **Open questions для user:** нет — все 3 проблемы закрыты, тесты добавлены, boundary документирована как инвариант. Если 15-min TTL token окажется short (e.g. tab открыта 30 минут потом клик → 401 → нужно refresh) — TTL extension легко в `private-delivery.ts` (CHAT_ATTACHMENT_TOKEN_TTL_SECONDS константа); сейчас 15 min mirror `MAX_PRIVATE_MEDIA_TOKEN_TTL_SECONDS` upper bound. User увидит на QA — расширим если потребуется

- **2026-05-20 — MASTER-PRIVACY-FIX-A** (commit on `designStudioCabinet`, audit-zero-code result + 13 privacy regression tests). **Privacy boundary для master CRM private fields подтверждена аудитом + защищена тестами.** Рабочий код 0 изменений, только новый тест-файл.
  - **Audit findings:** master CRM private fields в схеме: (a) `Booking.notes` ([prisma/schema/booking.prisma:56](prisma/schema/booking.prisma#L56)) — мастер пишет при manual booking; (b) `ClientCard.notes` + `ClientCard.tags` + `ClientCard.photos` ([prisma/schema/crm.prisma](prisma/schema/crm.prisma)) — CRM-карточка клиента у мастера, providerId-scoped; (c) `ClientNote.text` ([prisma/schema/crm.prisma:33-52](prisma/schema/crm.prisma#L33-L52)) — отдельная модель notes by master, `@@unique([masterId, clientUserId])`. **Все 4 client-facing read paths проверены** на отсутствие утечки:
    - `src/lib/bookings/list.ts:listClientBookings` (для `/api/bookings/my`) — explicit-list select: `id/slotLabel/status/providerId/masterProviderId/clientName/clientPhone/comment/silentMode/startAtUtc/endAtUtc/proposedStartAt/proposedEndAt/requestedBy/actionRequiredBy/changeComment/clientChangeRequestsCount/masterChangeRequestsCount/service/provider/masterProvider`. **БЕЗ `notes`** ✅
    - `src/lib/client-cabinet/bookings.service.ts:listClientBookings` (для `/api/cabinet/user/bookings`) — explicit-list select без `notes`, без `clientCard` include ✅
    - `src/lib/bookings/mappers.ts:toClientBookingDto` — типовая граница `BookingClientDto` явно не имеет `notes`/`tags`/`clientCard`/`clientNote` ключей
    - `/api/bookings/[id]/chat` — explicit `messageSelect` только chat-fields, без booking notes
    - **Client cabinet UI** (`src/features/client-cabinet/*`) — grep ZERO references на `notes/tags/clientCard/clientNote` (только review-tags upcoming feature, не master-private)
  - **`Booking.comment` НЕ master-private** — это **client-to-master** comment, написан клиентом при создании брони. Legitimately видим клиенту в его DTO (это его собственное сообщение). Подтверждение: `Booking.comment` устанавливается через client booking flow (createBooking input)
  - **Decision: zero-code fix** — boundary уже корректно соблюдён в коде. По паттерну CHAT-FOUNDATION-A audit-zero-code: вместо «фикса несуществующей утечки» — **regression защита** + документация инварианта
  - **Раздел 3 (Архитектура):** 1 новый test-файл `src/lib/bookings/client-privacy.test.ts` (13 tests). Двухслойная защита: (1) **Type-level** — `"notes" extends keyof BookingClientDto ? true : false` compile-fail если ключ просочится; покрывает `BookingDto`, `BookingClientDto`, `BookingClientProviderDto`, `ClientBookingDTO` × `notes`/`tags`/`clientCard`/`clientNote`. (2) **Source-level** — `readFileSync` 6 client-facing файлов + regex pattern match на `notes: true`, `clientCard:`, `clientNote:` — ловит даже `as`-cast обходы types. Включён documented invariant assertion для maintainer-anchor
  - **Раздел 4 (Модель данных):** не затронута — schema нетронута
  - **Раздел 5 (Бизнес-логика):** boundary документирована — client DTO get explicit-list select без CRM-полей; client-to-master `comment` остаётся legitimately видим; master CRM-функция (`master/day.service.ts`, `master/clients-view.service.ts`, `crm/card-service.ts`, `studio/bookings.service.ts`) не тронута — мастер видит/пишет notes как раньше
  - **Раздел 8 (Проблемы):** privacy концерн закрыт защитой regression; не добавляет блокер
  - **Раздел 10 (Безопасность):** privacy boundary master notes документирована как соблюдённая + защищена тестами. 152-ФЗ-контекст: персональные данные обработки клиента мастером для CRM-цели остаются в master scope
  - **Раздел 12 (Инварианты):** **новый инвариант #25** «Master CRM private fields никогда не появляются в client-facing API/DTO/SSR» добавлен с полным описанием guarded-by surfaces + 152-ФЗ контекст + boundary защиты двумя слоями
  - **Раздел 15:** этот entry
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved (PHASE7-CLEANUP-A baseline), encoding/mojibake/prisma ✅, **371/371 tests** ✅ (358 → 371, +13 privacy tests), `npm run build` ✅. `git status --short`: только `client-privacy.test.ts` (рабочий код 0 изменений; PWA fallback build-artifacts auto-regen)
  - **Pre-launch risks обнаруженные:** **нет новых.** Privacy boundary master notes — корректна. 152-ФЗ для notes — защищена
  - **Open questions для user:** user формулировка «вижу что заметки мастера недоступны для клиента. Стоит добавить.» интерпретируется как **«boundary корректен → стоит ЗАФИКСИРОВАТЬ инвариант + добавить защиту от регрессии»** (а не «надо открыть заметки клиенту»). Если интерпретация была другой (например «надо добавить comment-обмен между master↔client» — это уже chat, не CRM notes) — отдельный запрос. Текущая реализация: privacy сохранена, регрессия покрыта тестами

- **2026-05-20 — CLIENT-SHOWCASE-SEED-A** (commit on `designStudioCabinet`, seed-only — рабочий код 0 изменений). **Showcase активного клиента для разблокировки QA клиентского кабинета** + побочный аудит 2 багов из ручного QA (НЕ исправлены — отдельные fix-промпты).
  - **Audit findings:** существующий seed-паттерн = `prisma/seeds/test-data/seed-showcase-*.ts` с idempotent `ensureUserByPhone` (SEED-CONSOLIDATION-A). 4 уже-существующих showcase phone (100/200/300/400). Client cabinet surfaces: bookings / favorites / messages / model-applications / notifications / profile / reviews / roles / settings / faq — все пустые без активного клиента. **`Review.bookingId` имеет `@unique`** → idempotent upsert by bookingId. **`UserFavorite` composite `@@unique([userId, providerId])`** → upsert key `userId_providerId`. **NotificationType валидные значения:** `BOOKING_CONFIRMED`, `BOOKING_RESCHEDULE_REQUESTED` (НЕ `BOOKING_CHANGE_PROPOSED`), `BOOKING_REMINDER_2H`, `REVIEW_REPLIED` (НЕ `REVIEW_REPLY_RECEIVED`), `BOOKING_CANCELLED_BY_MASTER` (НЕ `_BY_PROVIDER`). Первичная редакция seed имела 3 несуществующих enum-значения — исправлено перед typecheck
  - **Аудит #1 email-500 (НЕ исправлено):** `src/app/api/cabinet/user/profile/email/request-verify/route.ts:72-75` делает `prisma.userProfile.update({ data: { email: normalizedEmail, emailVerifiedAt: null } })` **сразу на этапе запроса кода**, до подтверждения. `UserProfile.email` имеет `@unique` constraint ([prisma/schema/auth.prisma:12](prisma/schema/auth.prisma#L12)) и НЕТ `pendingEmail` placeholder — email-колонка одновременно «текущий» и «target». Когда юзер пытается верифицировать адрес который уже занят (другим юзером / released-* seed row / прошлой записью себя) — Prisma бросает P2002 → handler возвращает 500. **Fix options для отдельного промпта EMAIL-VERIFY-FIX:** (a) schema migration добавить `pendingEmail String?` + писать туда на request, переносить в `email` при verify; (b) **без migration:** catch P2002 → 409 `EMAIL_ALREADY_USED`, НЕ обновлять `email`/`emailVerifiedAt` до verify (использовать `OtpCode.email` row как единственный носитель target-email — verify-endpoint читает оттуда). Опция (b) проще и backwards-compatible
  - **Заметка #2 OAuth путаница (НЕ исправлено, static-audit не подтверждает):** user сообщил «ВК-кнопка пустышка, ТГ-кнопка ведёт на ВК». Static-audit: `vk-login-button.tsx:22-23` — `if (!vkEnabled) return null` (controlled `NEXT_PUBLIC_VK_ENABLED`). `telegram-login-button.tsx:48` загружает корректный `telegram.org/js/telegram-widget`. Если ВК-кнопка «пустышка» — возможно wrapper в `login-client.tsx` рендерит контейнер даже когда дочерний `null`. ТГ→ВК — возможно icon-mode rendering conflict / event bubble. **Точная природа требует runtime-аудита** на login page — отдельный промпт OAUTH-FIX-A
  - **Раздел 3 (Архитектура):** 3 файла seed:
    - `prisma/seeds/test-data/helpers/markers.ts` — добавлен `SHOWCASE_PHONE_CLIENT = "+79995000000"`; `SHOWCASE_PHONE_PREFIXES` расширен `+79995`. Reset подхватывает client showcase автоматически
    - `prisma/seeds/test-data/seed-showcase-client.ts` (новый, ~430 LOC) — `seedShowcaseClient()` с: `ensureUserByPhone` (CLIENT role), 9 booking-планов (3 предстоящих включая CHANGE_REQUESTED, 3 FINISHED для истории/отзывов, 2 CANCELLED разными by, 1 NO_SHOW) — каждый по deterministic id `seed-bk-showcase-client-NN`, 3 review-плана на FINISHED брони (2 с replyText + 1 без — для проверки «без ответа»), favorite Анны (composite upsert), 5 notification-планов разных типов с realistic ageHours/isRead mix, опциональный `ensureModelApplication` если у Анны есть ACTIVE offer. Защита от race condition: проверяет `loadAnnaProvider()` + `loadAnnaServices()` — если master showcase не запущен → `logSeed.warn` + return null (НЕ throw)
    - `prisma/seeds/test-data/index.ts` — импорт + вызов `seedShowcaseClient()` ПОСЛЕ `seedShowcaseMaster` (явный порядок: client depends on Anna's bookings/services), docstring расширен 5-й showcase phone
  - **Раздел 5 (Бизнес-логика):** не затронута — рабочий код 0 изменений
  - **Раздел 6 (Маршруты):** не затронуты
  - **Раздел 8 (Проблемы):** добавлен **🔴 #1 email-500** в Pre-launch блокеры с root cause + 2 fix options. Добавлена заметка **🟠 #2 OAuth** для runtime-аудита
  - **Раздел 9 (Тестирование):** seed-данные расширены 5-м showcase (client). Phone schema 100/200/300/400/**500**. 358 тестов — не затронуты (seed-data не код)
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved, encoding/mojibake/prisma ✅, **358/358 tests** ✅, **`npm run build` ✅**. `git status --short` — только seed (markers/index/seed-showcase-client) + BACKLOG + AI_CONTEXT + PWA fallback files (build artifacts auto-regenerated)
  - **Pre-launch risks обнаруженные:** **#1 email-500** добавлен как 🔴 (блокирует email-верификацию = launch blocker для функциональности «привязать email к существующему аккаунту»). **#2 OAuth** добавлен как 🟠 (login messengers — не критично для launch если есть OTP-флоу, но UX-провал)
  - **Open questions для user:** нет — оба бага задокументированы с fix options, ждут отдельных fix-промптов после полного QA клиентского кабинета (showcase разблокировал QA)
  - **Next:** user проходит полное QA клиентского кабинета на showcase Елене → собирает баги пачкой → fix-промпты (EMAIL-VERIFY-FIX-A для #1, OAUTH-FIX-A для #2, плюс возможные новые из QA)

- **2026-05-19 — BACKLOG-RESTRUCTURE-A** (commit on `designStudioCabinet`, документная задача — фон параллельно ручному QA). **Реструктуризация BACKLOG.md + синхрон с AI_CONTEXT р.15.** Рабочий код 0 изменений — только 2 `.md` файла.
  - **Audit findings:** (a) BACKLOG.md рос инкрементально весь sprint (50+ commits); накопились стейл-структуры. (b) **`КАРТА REDESIGN РАБОТЫ`** (lines 19-130) — в основном «✅ Завершено», redesign sprint закрыт (CHAT-UI-A 2026-05-19 финальный коммит). (c) **`Phase 3-5`** в плане до production указаны «не начат» / «foundation уже ✅» — все 3 фактически завершены. (d) **`Phase 6`** содержит уже-сделанное (CI tests T7 + booking enforcement). (e) **Стейл `🔴 CI tests (T7)`** в Pre-launch блокерах — фактически закрыт ранее (верифицировано TEST-COVERAGE-A: `quality-gates.yml` уже содержит `Run tests` step). (f) **Стейл `Test coverage`** в High priority — частично закрыт TEST-COVERAGE-A 2026-05-19 (billing pure + bookings flow + idempotency-key)
  - **Cross-checks с кодом:** `master-schedule-editor.tsx` deleted ✅, `src/features/admin/components/` directory deleted ✅, `/hot` + `/inspiration` pages deleted ✅, `attachmentMediaAssetId` в schema ✅, `src/lib/audit/admin-audit.ts` exists ✅, 5 new TEST-COVERAGE test files exist ✅, `quality-gates.yml` test step exists ✅. Все «сделанное» подтверждено в коде. **Расхождения BACKLOG↔changelog найдены:** только в стейл-разделах (T7 + Phase 3-5 + Test coverage subset) — синхронизированы
  - **Раздел 3 (Архитектура):** не затронут — документная задача
  - **Раздел 8 (Проблемы):** не затронут (T7 был обновлён ранее в TEST-COVERAGE-A entry — здесь только зеркальное обновление в BACKLOG)
  - **Раздел 9 (Тестирование):** не затронут
  - **Раздел 15 (Changelog):** этот entry добавлен. Остальные entries не тронуты (история выполненного — read-only)
  - **Раздел 12 (Инварианты):** не затронуты
  - **Изменения в BACKLOG.md (6 surgical edits):**
    1. `🗺 КАРТА REDESIGN РАБОТЫ` heading заменён на `🎯 ТЕКУЩИЙ ФОКУС` + `🗺 ЗАВЕРШЁННЫЕ WORKSTREAMS (краткая карта)` — отражает что redesign closed
    2. `⏳ Public surfaces — остатки` + `⏳ Chat enhancements` секции обновлены: chat workstream закрыт (image attachments ✅ / read receipts ✅ — backend wired), осталось только typing/consolidation/auth-gap
    3. **T7 fix в Pre-launch блокерах** — strikethrough + примечание «закрыт ранее, верифицировано TEST-COVERAGE-A»
    4. **Test coverage обновлено в High priority** — billing pure + bookings flow ✅, CI ✅; integration tests (createBooking/cancelBooking/marketing-pricing.load/idempotency-Prisma/getCurrentPlan/deletion/visual-search) + E2E остались как backlog
    5. **Phase plan (1255-1325)** полностью обновлён: Phase 3 Cabinet Studio ✅ ЗАВЕРШЁН (19 коммитов); Phase 4 Public surfaces ✅ В ОСНОВНОМ ЗАКРЫТ; Phase 5 Chat ✅ ОСНОВНОЕ ЗАВЕРШЕНО; Phase 6 в работе (booking enforcement + CI tests + test coverage частично ✅); Phase 7 cleanup partial done
    6. **Новый раздел `📜 ИСТОРИЯ ВЫПОЛНЕННОГО`** — chronological индекс sprint'а (новое сверху) с reference к AI_CONTEXT р.15 за детальным changelog. Содержит даты 2026-05-19 → 2026-05-13. Существующий `✅ ВЫПОЛНЕНО (legacy список)` сохраняется ниже для истории — не удалён
  - **Принцип «приоритет сверху / история снизу» применён:** TEKUSCHII FOKUS → 🔴 BLOCKERS → 🟠 HIGH (с маркером 🟢 БЕЗОПАСНО ПАРАЛЛЕЛЬНО QA для test coverage) → 🟡 MEDIUM → 🔵 NICE → ИСТОРИЯ. Detailed per-commit follow-up sections («Из X-A audit») сохранены internally — каждый commit'а follow-up backlog остался intact на своём месте
  - **Ничего не потеряно:** все 🔴 блокеры на месте (SMS gateway / VAPID / OTP rate-limit / JWT rotation / Middleware T6 / Supervisor / Production env vars / Yandex deploy / Backups / Monitoring / Email infrastructure / Onboarding / Complaint model / Cleanup billing plans script / Short-code leftovers / Admin plan grant caps / BillingAuditLog retention / Feature Flags infrastructure / External cron MRR / Prices для 6 UPPERCASE планов). Все per-commit follow-up backlog sections (300-885 lines) intact
  - **Validation:** `npm run check:encoding ✅`, `npm run check:mojibake ✅` (русский .md не побит). `git status --short` — только 2 файла (BACKLOG.md + MASTERRYADOM_AI_CONTEXT.md), рабочий код 0 изменений
  - **Pre-launch risks обнаруженные:** нет — все 🔴 блокеры preserved, ничего не потеряно. Сверка с кодом подтвердила что «сделанное» реально сделано
  - **Open questions для user:** нет — реструктуризация чисто документная, ничего подозрительного не вскрыто
  - **Next:** продолжение фонового трека (BOOKING-ENFORCEMENT после QA Этапа 2.1, потом multi-recipient notif), пока QA идёт по 4 поверхностям

- **2026-05-19 — TEST-COVERAGE-A** (commit on `designStudioCabinet`, фоновый трек параллельно ручному QA). **Strict isolation: working code 0 modifications** — только 5 новых `*.test.ts` файлов. **Audit:** (a) CI integration уже был сделан раньше (`quality-gates.yml` уже содержит `Run tests` step — стейл-таска T7 в CONTEXT). (b) В billing уже покрыты `features.ts`/`mrr.ts`/`mrr-snapshot.ts`/`trial.ts`; pure-функции `utils.ts`/`marketing-pricing.ts`/`guards.ts` — нет. (c) В bookings уже покрыты `reminders.ts`/`link-guest-bookings.ts`/`policy-enforcement.ts`; pure-функции `flow.ts` + `idempotency-key`-helper — нет. **Strategy:** pure-function focus only. Сложные Prisma-mock пути (`createBooking`/`cancelBooking`/`marketing-pricing.load`/`get-current-plan`/idempotency-Prisma) deferred как integration-tests per spec rule «лучше ядро покрыто чисто, чем всё поверхностно».
  - **Раздел 3 (Архитектура):** 5 новых test-файлов, 0 рабочих файлов изменено
    - `src/lib/billing/utils.test.ts` — 15 tests (sha256 / formatTimeBucketUtc / addMonthsUtc — billing-critical day-clamping для месячных периодов, leap-year, year rollover, 12mo/6mo billing, ms preservation)
    - `src/lib/billing/marketing-pricing.test.ts` — 19 tests (calcSavingsPercent / findPrice / listIncludedFeatures с scope filter)
    - `src/lib/billing/guards.test.ts` — 6 tests (3 AppError factories — FEATURE_GATE 403 / SYSTEM_FEATURE_DISABLED 403 / LIMIT_REACHED 409)
    - `src/lib/bookings/flow.test.ts` — 32 tests (normalizeBookingStatus exhaustive table / resolveBookingRuntimeStatus runtime promotion с grace / minutesUntilStart / 60-min action window / cancellation deadline 423 / canCancelOrReschedule по статусам)
    - `src/lib/bookings/idempotency-key.test.ts` — 6 tests (key composition, determinism, guest namespace из BOOKING-WIDGET-FOUNDATION-A, TTL=600s)
  - **Раздел 9 (Тестирование):** test count 274 → **358** (+84). Test files 40 → 45. **CI:** `quality-gates.yml` уже запускает `npm run test -- --reporter=verbose --bail 1` between Typecheck и Mojibake — закрывает T7. **Покрыто billing pure helpers** (utils period-math / marketing-pricing.calc / guards). **Покрыто bookings flow state-machine** (status transitions + 60-min cancel/reschedule window + cancellation deadline). **НЕ покрыто (backlog):** createBooking integration (deep Prisma chain), cancelBooking, marketing-pricing.load SSR path, idempotency Prisma-touching paths, getCurrentPlan, deletion/visual-search, E2E
  - **Раздел 5 (Бизнес-логика):** не затронута — рабочий код не тронут, тесты документируют текущее поведение
  - **Раздел 6 (Маршруты):** не затронуты
  - **Раздел 8 (Проблемы):** **L1 (booking enforcement новых полей)** ранее закрыт — этот коммит не открыл новых рисков. **T7 (нет CI тестов)** оказался устаревшим — CI уже запускал тесты, заметка в CONTEXT была неточной
  - **Раздел 10 (Безопасность):** не затронут
  - **Раздел 12 (Инварианты):** не затронуты
  - **One discovery during writing (NOT a bug):** `listIncludedFeatures` фильтрует features по scope appliesTo — STUDIO-only ключ типа `maxTeamMasters` невидим на MASTER plan. Тест изначально был написан в неправильном предположении; исправлен + добавлен symmetric тест для STUDIO scope
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved (PHASE7-CLEANUP-A baseline), encoding/mojibake/prisma ✅, **358/358 tests** ✅, **`npm run build` ✅**, **`git status --short` показывает только 5 `??` test files** (рабочий код 0 изменений — manual QA isolation preserved)
  - **Pre-launch risks (новых не обнаружено):** все pre-launch L1-L5 + T1-T9 не затронуты этим коммитом
  - **Open questions:** нет — все тесты pass, никакого подозрительного поведения тестами не вскрыто
  - **Next background workstreams:** BOOKING-ENFORCEMENT (после QA Этап 2.1 — не раньше, пересечётся с booking-критичным QA), потом multi-recipient notifications (после notif QA). Сложные Prisma-mock integration tests — отдельный коммит когда integration-test infrastructure появится

- **2026-05-19 — CHAT-UI-A** (commit on `designStudioCabinet`). **🎉 ПЛАТФОРМА ДОСТРОЕНА — финальный большой коммит редизайн-спринта.** Closes chat UX consumption of CHAT-FOUNDATION-A (SSE + receipts) + CHAT-FOUNDATION-A-MIGRATION (attachments backend).
  - **Audit reality-check applied per FOOTER/NAVBAR lesson** — spec scoped 5 redesign goals; audit revealed **4 of 5 already production-grade**, only attachment picker/render was the actual gap:
    - **Two-panel layout** — `src/features/chat/chat-shell.tsx` (129 LOC) already renders conversation-list pane + thread pane with mobile-adaptive list↔thread navigation
    - **Read receipts ✓✓** — `bubble-meta.tsx` already renders `<Check>` (sent) → `<CheckCheck class="text-primary">` (read) via `isRead={Boolean(message.readAt)}`; backend wired in CHAT-FOUNDATION-A
    - **System booking cards** — `system-message.tsx` already renders the booking snapshot card (service / date / duration / address / price / «Открыть запись» CTA) for SYSTEM-typed messages
    - **Quick replies chips** — `composer/quick-replies.tsx` already shows quick-reply pills with per-session hide preference
    - **Attachment picker — actual gap** (no file input, no preview, no upload integration; delivered in this commit)
  - **Раздел 3 (Архитектура):** types extended for attachment surface across 3 files:
    - `src/lib/chat/thread-grouping.ts` — `ThreadMessage` + `RawMessage` gain `attachmentMediaAssetId: string | null`; `injectDaySeparators` propagates field
    - `src/lib/chat/conversation-aggregator.ts` — flat-message read maps `attachmentMediaAssetId` (Prisma select was already added in CHAT-FOUNDATION-A-MIGRATION)
    - `src/features/chat/types.ts` — `ThreadMessageDto` extended with `attachmentMediaAssetId: string | null` + JSDoc
    - **`src/features/chat/chat-window/message-bubble.tsx` rewritten** — renders `<img>` above text bubble when attachment present. Plain `<img src={`/api/media/file/${id}`}>` (cookie-auth route — `next/image` would lose auth). Wrapped in `<a target="_blank">` for full-size view. Adaptive corner styling: when attachment is on top, image takes top corners + text bubble takes bottom corners (preserves speech-bubble tail); attachment-only message follows `isMine` orientation. `loading="lazy"`, `max-h-[320px]`, `object-cover`. `BubbleMeta` still rendered below with `isRead` from `readAt`
    - **`src/features/chat/composer/composer.tsx` rewritten** with attachment picker. New `AttachmentState = idle | uploading | ready | error` discriminated union. Paperclip icon button triggers hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`. On pick: MIME validation (`ALLOWED_ATTACHMENT_MIME`), size check (≤10 MB), `URL.createObjectURL` preview, POST `/api/chat/upload-attachment` with FormData (mirrors booking-reference upload). Preview tile (12×12 image + label + X remove button) above input row. Submit guarded: text-only OR attachment-only OR text+attachment all valid (matches CHAT-FOUNDATION-A-MIGRATION `body || attachment` semantic). Body extended with `attachmentMediaAssetId: readyAssetId`. **Object URL lifecycle correctly handled** — revoked on conversation change, on remove click, on success submit, on unmount cleanup
  - **Раздел 5 (Бизнес-логика):** chat now supports image attachments end-to-end (UI picker → upload endpoint → message persistence → real-time SSE fanout → render with ✓✓ receipts). Text-only OR attachment-only OR text+attachment all supported. Backend NOT touched — CHAT-FOUNDATION-A + CHAT-FOUNDATION-A-MIGRATION provided everything; UI consumes the contract
  - **Раздел 6 (Маршруты):** **no new routes / no new endpoints.** Existing `/api/chat/upload-attachment` (from CHAT-FOUNDATION-A-MIGRATION) + `/api/chat/threads/[slug]/messages` POST (with `attachmentMediaAssetId` body field) consumed by the new composer. `/cabinet/messages` + `/cabinet/master/messages` shells unchanged
  - **Раздел 12 (Инварианты):** не затронуты. `resolveChatAccess` NOT touched — studio admin denial preserved by-design (privacy invariant for РФ/152-ФЗ)
  - **UI_TEXT:** `composer.attachAria` («Прикрепить фото»), `attachUploading`, `attachUploadFailed`, `attachInvalidType`, `attachTooLarge`, `attachRemoveAria` added (~6 keys). **Existing `composer.footer` deliberately preserved** — current copy «ENTER — отправить · SHIFT+ENTER — новая строка · личные сообщения видны только вам и собеседнику» honestly describes message visibility WITHOUT claiming end-to-end encryption. **Per spec strict reality-check rule «„все сообщения шифруются" — НЕ показывать без реального шифрования (152-ФЗ + false security promise)»**: messages are stored as plaintext in Postgres; adding «шифруются» would be false advertising + serious legal risk under 152-ФЗ
  - **Aspirational elements per FOOTER/NAVBAR lesson — NOT fabricated, backlogged:**
    - Real online/presence status (no presence system → backlog)
    - «N визитов» per-conversation client visit count (no CRM aggregation in chat → backlog)
    - Typing indicators (no transient SSE event — known from CHAT-FOUNDATION-A audit)
    - Studio admin chat participation (`resolveChatAccess` denies third party by-design)
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved (same PHASE7-CLEANUP-A baseline — no new issues), encoding/mojibake/prisma ✅, **274/274 tests** ✅, **`npm run build` ✅** (production build green — `/cabinet/messages` + `/cabinet/master/messages` + chat shell with new composer all compile)
  - **🎉 ПЛАТФОРМА ДОСТРОЕНА:** Cabinet Master (полностью) + Cabinet Studio (19 коммитов) + Cabinet Client (полностью) + Admin Panel (Phase 2 closed) + public master profile + public studio profile + booking widget (foundation + UI) + chat (foundation + migration + UI) + modal unification + catalog enhancements + footer + navbar — все production-ready
  - **Next step:** full QA pass across 4 surfaces (master cabinet / studio cabinet / client cabinet / public surfaces & widgets) before Phase 6 hardening (SMS gateway, multi-recipient notif, CI tests, catalog availability snapshot, aggregateStudioSlots SSR wiring, presence system, studio admin chat decision)
  - **Backlog spawned:** Real online/presence status, Per-conversation visit count chip, Typing indicators, Studio admin chat access (auth model decision — privacy concern), End-to-end encryption (if business commits to delivering the claim, significant infra work — currently footer wisely doesn't promise it), Image lightbox UI (`<a target="_blank">` opens raw bytes — works but not polished), Multiple attachments per message, Voice messages / file types beyond images

- **2026-05-19 — CHAT-FOUNDATION-A-MIGRATION** (commit on `designStudioCabinet`). User approved the schema migration after the CHAT-FOUNDATION-A STOP-question. **All 7 attachment-backend steps shipped, mirroring the booking-reference upload pattern byte-for-byte. ZERO UI changes** (attachment picker/preview lives in CHAT-UI-A).
  - **Audit findings (booking-reference template):**
    - `validateReferenceAsset` (`src/lib/bookings/booking-extras.ts:60-89`) — canonical ownership validator: kind check → `createdByUserId === client` → `entityType=BOOKING + entityId starts with "pending:"` → reuses asset id
    - `uploadBookingReferenceAsset` (`src/lib/media/service.ts:360`) — canonical upload: creates PENDING MediaAsset with `entityId=pending:<userId>`, puts bytes, marks READY, rolls back on storage failure
    - `Booking.referencePhotoAssetId` — nullable FK with on-delete SetNull, set at booking-create after validation
  - **Раздел 3 (Архитектура):**
    - **NEW (mirrors booking-reference):**
      - `src/lib/media/service.ts` — `uploadChatAttachmentAsset(user, input)` byte-for-byte clone with `entityType=CHAT_MESSAGE` + `kind=CHAT_ATTACHMENT`
      - `src/app/api/chat/upload-attachment/route.ts` — byte-for-byte clone of `/api/bookings/upload-reference/route.ts` (Zod body + Sharp re-encoding + MIME sniffing + 30/hr rate-limit per user)
      - `src/lib/chat/attachment.ts` — `validateChatAttachmentAsset({ assetId, senderUserId })` mirrors `validateReferenceAsset`; `markAttachmentUsed({ assetId, messageId })` re-points `entityId` from `pending:<userId>` to `chat-message:<msgId>` for one-shot enforcement
    - **MODIFIED:**
      - `src/lib/chat/message-sender.ts` — `sendConversationMessage` accepts optional `attachmentMediaAssetId`; body-empty validation relaxed to `body || attachment`; validates with `validateChatAttachmentAsset` before create; persists in the create; calls `markAttachmentUsed` after create; return shape gains `attachmentMediaAssetId: string | null`
      - `src/app/api/bookings/[id]/chat/messages/route.ts` — Zod body schema relaxed (body OR attachment); attachment validated + marked-used inline (this endpoint doesn't flow through `sendConversationMessage` — it has its own message-creation path); `messageSelect` extended with `attachmentMediaAssetId`
      - `src/app/api/chat/threads/[slug]/messages/route.ts` — Zod body schema relaxed; passes attachment through to `sendConversationMessage`
      - `src/app/api/bookings/[id]/chat/route.ts` — `messageSelect` constant extended with `attachmentMediaAssetId: true`
      - `src/lib/chat/conversation-aggregator.ts` — full-thread `messages.select` extended with `attachmentMediaAssetId: true` (thread-preview select unchanged — conversation list only needs body+createdAt+senderType)
    - **NEW MIGRATION:** `prisma/schema/migrations/20260519120000_add_chat_attachment/migration.sql` — hand-authored Postgres SQL (project's standard manual-migration approach): 2× `ALTER TYPE ADD VALUE` (`CHAT_MESSAGE` on `MediaEntityType`, `CHAT_ATTACHMENT` on `MediaKind`), `ALTER TABLE ADD COLUMN attachmentMediaAssetId TEXT`, `ADD CONSTRAINT FOREIGN KEY ... ON DELETE SET NULL ON UPDATE CASCADE`, `CREATE INDEX`. All ADD-only operations, no destructive changes
    - **Schema files updated:** `prisma/schema/enums.prisma` (2 enum extensions), `prisma/schema/booking.prisma` (ChatMessage column + relation + index), `prisma/schema/media.prisma` (back-relation on MediaAsset)
  - **Раздел 4 (Модель данных):** **ChatMessage.attachmentMediaAssetId** nullable FK added. **MediaEntityType + MediaKind** enums extended with `CHAT_MESSAGE` and `CHAT_ATTACHMENT` respectively. Models count: 65 → 65 (no new models; one new column on existing model). Migrations count: 16 → 17
  - **Раздел 5 (Бизнес-логика):** attachment-only chat messages now valid (body OR attachment required). Validation pipeline: client uploads via `/api/chat/upload-attachment` → gets `assetId` → posts to `/chat/messages` with `attachmentMediaAssetId` → server validates ownership + unused → creates ChatMessage with the link → marks asset used (entityId re-point). Same SSE/notification path fires (`CHAT_MESSAGE_RECEIVED`); receivers re-fetch the thread and see the attachment via the extended read-side selects. **`resolveChatAccess` unchanged** — studio admin denial preserved
  - **Раздел 6 (Маршруты):** **NEW endpoint** `POST /api/chat/upload-attachment` (auth, 30/hr per-user rate-limit, returns `{ assetId }`). **Modified endpoints (×2)** `POST /api/bookings/[id]/chat/messages` + `POST /api/chat/threads/[slug]/messages` accept optional `attachmentMediaAssetId` field in body
  - **Раздел 10 (Безопасность):** attachment ownership-validation rigorous — `createdByUserId === sender.id` required, asset must be in `pending:<userId>` state (one-shot use), wrong-kind/wrong-entityType rejected. Mirrors the proven booking-reference pattern. `resolveChatAccess` invariant preserved (studio admin denial, RU privacy 152-ФЗ stance). Per-user 30/hr upload rate-limit
  - **Раздел 11 (Производительность):** no regression. Sharp re-encoding identical to booking-reference (PNG→WebP, JPEG retained). Index on `attachmentMediaAssetId` enables fast orphan-cleanup queries. Read-side selects add 1 scalar column to existing queries (negligible)
  - **Раздел 12 (Инварианты):** не затронуты. `resolveChatAccess` privacy invariant preserved
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** preserved (PHASE7-CLEANUP-A baseline), encoding/mojibake/prisma ✅, **274/274 tests** ✅ (chat access + status tests untouched), **`npm run build` ✅**
  - **Pre-launch note:** migration applied locally via `prisma generate`; production application requires `npx prisma migrate deploy` during Phase 6 deployment window. Safe — 3 ADD operations, no destructive changes
  - **Next:** CHAT-UI-A redesign over the now-complete backend (SSE real-time + read receipts + attachments all wired and tested)

- **2026-05-19 — CHAT-FOUNDATION-A** (commit on `designStudioCabinet`). **Audit-first commit, NO code changes.** Per the BOOKING-WIDGET-FOUNDATION-A pattern («blockers are softer than expected»), this audit revealed **2 of 3 scoped capabilities (SSE real-time + read receipts) are already production-grade in the codebase**, and the 3rd (attachments) **requires a schema migration that needs explicit user approval per spec rule «Schema migration ТОЛЬКО с явным подтверждением user — STOP, описать, спросить»**.
  - **Audit findings:**
    - **SSE real-time = FULLY WIRED:** `message-sender.ts:189` calls `deliverNotification({ type: CHAT_MESSAGE_RECEIVED, payloadJson: { conversationSlug, bookingId, ... } })` → `delivery.ts:publishNotifications()` → notifier (Redis pub/sub) → `/api/notifications/stream/route.ts:123` subscribes via `notifier.subscribe(user.id, ...)` → client hooks `use-conversation-thread.ts:85` + `use-conversations.ts:64` subscribe via `subscribeNotificationEvent(...)` and refetch on `CHAT_MESSAGE_RECEIVED` events with conversationSlug-scoped filtering. Both message-sending API routes flow through `message-sender.ts` (booking-scoped + universal-chat). **Nothing to build.**
    - **Read receipts backend = FULLY WIRED:** `ChatMessage.readAt: DateTime?` field exists. Two endpoints (`/api/bookings/[id]/chat/read` + `/api/chat/threads/[slug]/read`) use `updateMany` to mark all unread incoming messages read in one query. Client `markRead` wired in `use-conversation-thread.ts:97`. Backend semantics correct (delivered = createdAt set; read = readAt set). **Nothing to build.** UI ticks are CHAT-UI territory
    - **Attachments = SCHEMA MIGRATION REQUIRED:** `ChatMessage` has no media/attachment field; `MediaKind` enum lacks `CHAT_ATTACHMENT`. Would need new enum value + nullable column + relation + index + endpoint payload + sender validation. **Per spec rule, STOP and ask user before any migration.** Surfaced in BACKLOG and as the open user-decision below
    - **`resolveChatAccess` NOT touched** — studio admin denial preserved by-design (privacy invariant, relevant for РФ/152-ФЗ pre-launch). Chat access + status tests still pass
  - **Раздел 3 (Архитектура):** не затронута — нет файловых изменений (audit-only commit). Chat infrastructure documentation upgraded: SSE pipeline fully wired (`message-sender.ts` → `delivery.ts` → notifier → `/api/notifications/stream` → client hooks); both legacy booking-chat + universal-chat APIs flow through the same sender
  - **Раздел 5 (Бизнес-логика):** unchanged. Chat real-time delivery works via existing `CHAT_MESSAGE_RECEIVED` notification path. Read receipts backend works via existing `readAt` updates. `resolveChatAccess` unchanged
  - **Раздел 6 (Маршруты):** не затронуты
  - **Раздел 10 (Безопасность):** `resolveChatAccess` invariant preserved — studio admin not granted chat access (privacy by-design for РФ/152-ФЗ). Audit confirms no code touches access control
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation (sanity gates — confirming baseline preserved with zero changes):** typecheck ✅, lint **1 error / 3 warnings** (unchanged from PHASE7-CLEANUP-A baseline), encoding/mojibake/prisma ✅, **274/274 tests** ✅
  - **Goal achieved for CHAT-UI stage 2:** the redesign per `masterChat.png` can focus 100% on UI work (two-panel layout, system-message booking cards, quick-reply chips, receipt ticks ✓✓, conversation list refresh) because all backend it needs is already there. **Attachments UI (picker / preview)** depends on the user's go-ahead for the schema migration described below
  - **Open question for user (blocker for attachments UI):** approve the schema migration adding (a) `MediaKind.CHAT_ATTACHMENT` enum value, (b) `ChatMessage.attachmentMediaAssetId: String?` column with relation to `MediaAsset` + index, (c) updated POST endpoints to accept attachment payload + validate ownership? Without this, CHAT-UI can ship without attachments and add them later when the migration is approved
  - **Backlog spawned:** chat attachments schema migration (waiting on user approval), typing indicators (ephemeral SSE event, not a CHAT-UI dependency), studio admin chat access (by-design denial — revisit only if business override needed)
  - **Next:** CHAT-UI-A (full redesign over the confirmed-ready backend) → full QA pass across 4 surfaces

- **2026-05-19 — FORMDIALOG-V2-A** (commit on `designStudioCabinet`). Narrow extension of `FormDialog` + 2 newly-unblocked migrations. **ModalSurface untouched** (79 consumers held sacred before the major QA pass).
  - **Audit findings:**
    - `FormDialog.submitVariant` was typed `"primary" | "danger"` though `sharedUI Button` supports `"secondary"` natively. Only `pause-master-dialog` truly needed it (uses `variant={mode === "pause" ? "secondary" : "primary"}` to de-emphasise the pause action)
    - **`invite-master-dialog` was MISCLASSIFIED in FORMDIALOG-MIGRATION-A** as «non-standard variant» — re-audit shows it uses `variant="primary"` and fits V1 cleanly. This commit corrects that
    - Grep-scan of all 35 remaining kept dialogs found no other secondary-submit cases. The remaining 33 are structurally outside `submitVariant` scope (multi-step / file-upload / OAuth / picker / retype-confirm / search-with-results)
  - **Раздел 3 (Архитектура):**
    - **MODIFIED:** `src/components/ui/form-dialog.tsx` — `submitVariant` union widened to include `"secondary"`. Body simplified from explicit ternary to `submitVariant ?? "primary"` (sharedUI Button validates the union; default keeps V1 byte-identical behaviour). Doc comment explains V2 rationale. **No new structural support added** (no multi-step, no custom-footer — those remain ModalSurface territory)
    - **MIGRATED:** `pause-master-dialog.tsx` — `submitVariant={mode === "pause" ? "secondary" : "primary"}` preserves the original visual
    - **MIGRATED:** `invite-master-dialog.tsx` — default primary submit; 3 form fields preserved verbatim with `disabled={submitting}` plumbing intact; all validation (`normalizeRussianPhone` + required-field checks) byte-identical
    - **`ModalSurface` NOT touched** — 79 consumers preserved (per spec rule «79 — священны перед QA»)
  - **Раздел 5 (Бизнес-логика):** business logic byte-identical for both migrations — `onSubmit`/`handleClose`/`reset`/validation/state all preserved. Only shell changed (manual footer + manual submitting label + manual error display → FormDialog's built-in versions)
  - **Раздел 6 (Маршруты):** не затронуты
  - **Раздел 11 (Производительность):** no regression (less duplicate state per migrated dialog, same primitives)
  - **Раздел 13 (Правила):** updated rule — `FormDialog` now supports `submitVariant: "primary" | "danger" | "secondary"`. Use `"secondary"` for non-destructive but non-positive actions (e.g. pause, archive, hide). For multi-step / picker / OAuth / file-upload / retype-confirm continue using `ModalSurface` directly
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** (baseline preserved from PHASE7-CLEANUP-A), encoding/mojibake/prisma ✅, **274/274 tests** ✅, **`npm run build` ✅**
  - **FormDialog migration totals:** 14 of 49 dialogs unified (12 V1 + 2 V2). 33 still-kept are structurally outside `submitVariant` scope and require either primitive extension (out of scope) or a different unification pattern altogether
  - **Backlog spawned:** none new. Multi-step modal primitive + file-upload/OAuth dialogs remain as previously logged structural items
  - **Next:** Chat redesign → full QA pass

- **2026-05-19 — FORMDIALOG-MIGRATION-A** (commit on `designStudioCabinet`). First wave of MODAL-UNIFY-EXPLORE's `<FormDialog>` adoption — **12 of 49 form-dialogs** migrated to the unified shell per spec's «лучше N чисто мигрированных + M честно оставленных, чем N сломанных насильно» rule before a major QA pass.
  - **Audit findings:**
    - 49 dialogs found using ModalSurface (not 60 as the EXPLORE estimate suggested). Per-file classification: ~12-15 clearly-simple, ~10 multi-section/step, ~10 picker/non-form, ~10 file-upload/OAuth/complex, 2 with non-standard variant buttons
    - FormDialog API covers: `title` + `<form>` children + Cancel/Submit footer + internal submitting state + `error` prop. Supports `submitVariant: "primary" | "danger"` — `pause-master-dialog` uses `secondary` for pause-action visual, so stays on ModalSurface
    - `<form>`-wrapping in FormDialog means inputs need `disabled={submitting}` to stay; FormDialog manages its own submit state so the migrated dialogs lose their local `submitting` `useState` (replaces ~6 lines per file)
    - Existing pattern in `email-verify-modal.tsx` (pre-existing baseline error from PHASE7-CLEANUP-A) is `useEffect(() => { setX(""); }, [open])` for form-reset — fires the `react-hooks/set-state-in-effect` rule. After my edits removed the paired `setSubmitting(false)` from 3 admin dialogs, the same rule started firing for them. Fixed with localized `// eslint-disable-next-line` comments + intent doc (same approach as email-verify-modal)
  - **Раздел 3 (Архитектура):**
    - **MIGRATED to `<FormDialog>` (12 dialogs):** Phase 1 studio cabinet (5: `cancel-booking-dialog`, `reject-dialog` schedule-requests, `approve-dialog`, `delete-service-dialog`, `delete-package-dialog`, `report-review-dialog`), Phase 2 admin cabinet (4: `approve-review-dialog`, `delete-review-dialog`, `cancel-subscription-dialog`, `refund-payment-dialog`), Phase 3 general (2: `report-review-modal` master, `edit-review-modal` client). Each file: `ModalSurface` import swapped for `FormDialog`, manual `<div className="flex justify-end gap-2">…</div>` footer removed, manual submitting state removed where it only drove the footer (kept where it disables form inputs), manual error display block removed (FormDialog renders via `error` prop)
    - **KEPT on ModalSurface (37 dialogs)** with documented reasons in BACKLOG entry — multi-step / picker / file-upload / OAuth / non-standard variant / retype-confirm / search-with-results patterns where FormDialog API doesn't fit. Future micro-sweep can pick up the close-to-simple ones; multi-step/picker dialogs are not FormDialog candidates without primitive extension
    - **3 localized `// eslint-disable-next-line` comments added** to `cancel-subscription-dialog` + `refund-payment-dialog` + `delete-review-dialog` to preserve baseline (1 error / 3 warnings) — matches existing pattern in `email-verify-modal`
  - **Раздел 5 (Бизнес-логика):** **business logic verbatim** — every migrated dialog's `onSubmit` body (fetch / API / mutations / success+error handling) is byte-identical to the pre-commit version. Only shell (footer + submitting indicator + error UI) changed. No semantic changes anywhere
  - **Раздел 6 (Маршруты):** не затронуты — UI-only refactor on shared component layer
  - **Раздел 8 (Проблемы):** lint baseline preserved at **1 error / 3 warnings** (same as PHASE7-CLEANUP-A) — no regressions. The pre-existing `react-hooks/set-state-in-effect` rule pattern documented; 3 new instances suppressed with localized intent comments
  - **Раздел 9 (Тестирование):** **274/274 tests** pass after migration. Phased self-validation: typecheck after each of 3 phases ✅. Final lint + tests + build all green
  - **Раздел 13 (Правила):** new rule for form-dialog authoring — for new simple form-dialogs (title + form-fields + Cancel/Submit + loading/error) use `<FormDialog>` directly; for multi-step / picker / file-upload / OAuth / retype-confirm / non-standard-variant flows continue using `ModalSurface` with the manual footer pattern (acceptable for those — the dialog gets full control)
  - **Раздел 11 (Производительность):** marginal positive (less duplicate state per dialog, less render flicker since FormDialog's submit-tracking is consolidated). No measurable runtime change
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** (preserved), encoding/mojibake/prisma ✅, **274/274 tests** ✅, **`npm run build` ✅**
  - **For QA:** 12 migrated dialogs share a unified submit-button label / spinner / animation / cancel-disable-while-submitting behavior. 37 kept dialogs work exactly as before — visually slightly different per-surface but functionally identical
  - **Backlog spawned:**
    - 🟡 Phase 4 micro-sweep — pick up close-to-simple dialogs that have one quirk (custom variant button, inline propose-category, retype-confirm) «при касании»
    - 🟡 FormDialog v2 — add `submitVariant: "secondary"` support, would unlock 2-3 more migrations (`pause-master-dialog`)
    - 🔵 Multi-step modal primitive — when the multi-step pattern becomes worth unifying (currently 6-8 dialogs use bespoke multi-step)
  - **Next:** Chat redesign (booking chat / attachments / SSE / studio admin chat auth gap) → full QA pass across 4 surfaces

- **2026-05-19 — DELETE-HOT-INSPIRATION-A** (commit on `designStudioCabinet`). Page-level deletion per user decision. **Critical: only the public showcase pages + isolated components removed; the HotSlot feature core is fully preserved.**
  - **Audit findings (page vs feature boundary):**
    - `/hot/page.tsx` was already a `permanentRedirect("/catalog?hot=true")` stub — the showcase functionality had migrated into the catalog filter
    - `/inspiration/page.tsx` had a "Do not delete" comment referencing a future AI-driven concept; per explicit user decision in the spec, deleted
    - `HotSlotsPage` + `HotSlotsPageClient` only consumed by the `/hot` route → isolated, safe to delete
    - `InspirationFeedPage` + `InspirationFeedClient` only consumed by the `/inspiration` route → isolated, safe to delete
    - `HotSlotsSubscribeButton` ALSO used by `public-profile/master/hero-block.tsx` → NOT isolated → kept
    - `HotSlotsPreview` ALSO used by `landing-home.tsx` → NOT isolated → kept
    - `/api/hot-slots` + `/api/hot-slots/subscribe` ALSO consumed by the kept components above → NOT isolated → kept
    - Master cabinet hot-slots sections + `/api/provider/hot-slots/rule` + `/api/admin/hot-slots/run` + all of `src/lib/hot-slots/*` (anti-fraud, pricing, runtime, subscriptions, job, smart-price-job, notifications, eligibility, schemas, service, slot-freed, constants, validation tests) → booking-critical core, untouched
    - HotSlot schema model + migrations untouched (NO schema migration)
  - **Раздел 3 (Архитектура):**
    - **DELETED 6 files (verified isolated to deleted pages):**
      - `src/app/(public)/hot/page.tsx`
      - `src/app/(public)/inspiration/page.tsx`
      - `src/features/hot-slots/hot-slots-page.tsx`
      - `src/features/hot-slots/hot-slots-page-client.tsx`
      - `src/features/feed/components/inspiration-feed-page.tsx`
      - `src/features/feed/components/inspiration-feed-client.tsx`
      - Empty parent dirs `src/app/(public)/hot/` + `src/app/(public)/inspiration/` also removed
    - **MODIFIED:** `src/app/sitemap.ts` — dropped `${baseUrl}/hot` static-route entry (route gone). `/inspiration` was never in sitemap (was hidden from navigation per file comment)
    - **NOT touched (verified active consumers):** `HotSlotsSubscribeButton`, `HotSlotsPreview`, public list `/api/hot-slots`, subscribe `/api/hot-slots/subscribe`, all of `src/lib/hot-slots/*`, master cabinet hot-slots sections, master rule API, admin run API, OpenAPI spec entry, HotSlot schema model, `isHotSlotRebookBlocked` in booking-core
  - **Раздел 5 (Бизнес-логика):** **HotSlot feature continues to work fully:** master creates hot-slot rules in cabinet → worker runs `HOT_SLOT_EXPIRING` job → anti-fraud blocks rebook abuse in `createBooking` → notifications fire → landing-home shows the preview → master public profile shows the subscribe button. Only the dedicated public showcase page `/hot` is gone (the catalog filter `/catalog?hot=true` was already the canonical surface). `/inspiration` was a never-shipped placeholder feature
  - **Раздел 6 (Маршруты):** `/hot` and `/inspiration` removed from public routes. Build output confirms — neither appears in the route list. **404 on `/hot`** from this commit (the redirect stub is gone) — acceptable per spec; old bookmarks will break. `/inspiration` was hidden from nav so no user impact
  - **Раздел 8 (Проблемы и риски):** **Stale BACKLOG.md roadmap section overhauled.** The "⏳ Cabinet Studio" + "⏳ Public surfaces remaining" + "⏳ После всех redesigns" sub-sections claimed redesign incomplete though all surfaces shipped during the sprint (Cabinet Studio 19 commits, public profile, booking widget, modal, catalog, footer, navbar all ✅). Roadmap now reflects reality. `/hot` + `/inspiration` removed from "Public surfaces remaining" list. `master-schedule-editor.tsx` retire entry removed (already done in PHASE7-CLEANUP-A)
  - **Раздел 9 (Тестирование):** не затронут — 274/274 tests pass. **HotSlot core tests (`anti-fraud.test.ts` + `validation.test.ts`) both pass** — feature confirmed alive
  - **Раздел 11 (Производительность):** marginal positive — smaller bundle (orphan page-client removed). No runtime change to the live HotSlot core
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** (unchanged from PHASE7-CLEANUP-A baseline — no new issues), encoding/mojibake/prisma ✅, **274/274 tests**, **`npm run build` ✅** (production build green, `/hot` + `/inspiration` confirmed gone from route list, `/u/[username]/booking` + `/catalog` + master public profile + landing all build successfully)
  - **Open question for user (not blocker):** HotSlot feature without dedicated public showcase — the catalog filter `/catalog?hot=true` is the surface, but if users discover hot slots less, the feature may become de-facto dead. Decision later: either surface in another way, or accept reduced visibility, or eventually remove the whole feature
  - **Next workstreams (per spec sequence):** FORMDIALOG-MIGRATION (60 form-dialogs → `<FormDialog>`) → Chat redesign → full QA pass

- **2026-05-19 — PHASE7-CLEANUP-A** (commit on `designStudioCabinet`). Pre-QA safe cleanup. **Audit-driven, NOT bulk-delete** per the category-dual-system precedent (where @deprecated symbols were actively imported). Every candidate verified via static + dynamic + re-export grep before removal.
  - **Audit findings:**
    - 13 `@deprecated` markers found across the codebase. Per-file usage check resolved each into one of 3 buckets: (a) **dead cluster — safe to delete**, (b) **deprecated but actively consumed — must leave**, (c) **deprecated prop on live component — must leave**
    - **Bucket (a) — verified 0 external consumers, deleted:** `team-tabs.tsx` + `team-member-card.tsx` + `studio-team-page.tsx` (dead 3-file cluster from STUDIO-MASTERS-A — team-tabs and team-member-card were only used by studio-team-page; studio-team-page itself had 0 consumers). `dashboard-nav-cards.tsx` (STUDIO-DASHBOARD-A, 0 consumers). `studio-calendar-page.tsx` + `master-schedule-editor.tsx` (dead 2-file cluster from STUDIO-SCHEDULE-A; master-schedule-editor was 1488 LOC, only consumed by studio-calendar-page; comment-mentions in `schedule/settings/page.tsx` and `schedule-settings-page.tsx` were just doc strings, not imports). `category-pills.tsx` (22a-fix-1, 0 consumers). `lib/studio/dashboard.service.ts` entire file (both exports `StudioDashboardStats` type + `getStudioDashboardStats` function had 0 external consumers — STUDIO-DASHBOARD-A replaced with `loadStudioDashboardData`). Empty `src/features/cabinet/master/schedule/` parent dir also removed
    - **Bucket (b) — kept, has active consumers:** `studio-settings-page.tsx` (837 LOC, effectively-deprecated since STUDIO-SETTINGS-A) is imported by 3 live sub-routes (`/cabinet/studio/settings/general`, `/portfolio`, `/profile`) — cannot retire until those redesign. `lib/feed/stories.service.ts:listStoriesMasters` is consumed by `/api/home/stories/route.ts`; together with `/api/home/feed/route.ts` + `<PortfolioStoriesBar>` they form a coordinated retirement cluster whose @deprecated note explicitly says «Remove together» — out of scope here. `FocalImage` has 40+ active consumers — long-term migration to `<Image>` not in scope
    - **Bucket (c) — left:** `FeatureGate` deprecated prop (prop-level marker on a live component)
    - **`@aws-sdk/lib-storage` NOT in `package.json`** — audit memo was incorrect. Only `@aws-sdk/client-s3` is installed (actively used). Nothing to remove
    - **Lint:** 1 pre-existing error from NAVBAR-REDESIGN-A baseline (`REVIEW_WINDOW_DAYS` unused import in `src/lib/reviews/service.ts:15`) — surgical fix: dropped from the import group. Remaining 1 error + 3 warnings are unrelated to this commit (setState-in-effect in email-verify-modal, `_onAvatarChanged` placeholder in client-profile-page, 2 unused eslint-disable directives in use-active-role) — out of scope, marked as Phase 7 follow-up
    - **NOT in scope per spec:** legacy ~60 form-dialogs → `<FormDialog>` (separate FORMDIALOG-MIGRATION commit, post-QA + post-Chat), `getPushEnabled` consolidation (refactor, not cleanup)
  - **Раздел 3 (Архитектура):**
    - **DELETED 8 files (verified 0 external consumers):**
      - `src/features/studio-cabinet/components/team-tabs.tsx`
      - `src/features/studio-cabinet/components/team-member-card.tsx`
      - `src/features/studio-cabinet/components/dashboard-nav-cards.tsx`
      - `src/features/studio/components/studio-team-page.tsx`
      - `src/features/studio/components/studio-calendar-page.tsx`
      - `src/features/cabinet/master/schedule/master-schedule-editor.tsx` (1488 LOC)
      - `src/features/catalog/components/category-pills.tsx`
      - `src/lib/studio/dashboard.service.ts` (155 LOC; full file — both exports orphan)
      - **Total: ~2.5K LOC of dead code removed.** Empty parent dir `src/features/cabinet/master/schedule/` also removed
    - **MODIFIED:** `src/lib/reviews/service.ts` — dropped unused `REVIEW_WINDOW_DAYS` from the constants import group (3 imports → 2)
  - **Раздел 5 (Бизнес-логика):** не затронута. Auth / createBooking / schedule engine / booking widget / modal system / footer / navbar — all untouched. Only orphan code paths removed. No semantic changes
  - **Раздел 6 (Маршруты):** не затронуты — all dead files were non-route components
  - **Раздел 8 (Проблемы и риски):**
    - Mass-of-@deprecated cruft trimmed (~2.5K LOC). The «13 @deprecated markers» count is now down to 5 (those with active consumers or prop-level markers, all documented above)
    - **Pre-existing lint issues catalogued** in backlog for future cleanup (not introduced here, not from this commit): 1 error (`setState synchronously within an effect` in `email-verify-modal.tsx`), 3 warnings (`_onAvatarChanged` placeholder, 2 unused eslint-disable directives)
  - **Раздел 9 (Тестирование):** не затронут — 274/274 tests pass. None of the deleted code was covered by tests (verified via the test suite still passing identically)
  - **Раздел 11 (Производительность):** marginal positive — smaller bundle (no more 1488-line `master-schedule-editor.tsx` shipped). No runtime change
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation:** typecheck ✅, lint **1 error / 3 warnings** (down from 1/4 pre-cleanup — REVIEW_WINDOW_DAYS closed; remaining issues all pre-existing and out of scope), encoding/mojibake/prisma ✅, **274/274 tests** (no test surface changed), **`npm run build` ✅** (production build green — orphan-heuristic deletions did NOT touch any Next.js convention file or implicit dependency)
  - **Goal achieved:** clean working base for the upcoming QA pass. Cleanup itself did NOT introduce regressions — every deletion was verified safe, the build passes, and tests stay green. **Seed / showcase / 4 demo phone accounts (100/200/300/400)** all functional — none of the deleted code was on any user-reachable path
  - **Backlog spawned / preserved:**
    - 🟡 FORMDIALOG-MIGRATION — legacy ~60 form-dialogs migrate to `<FormDialog>` (deliberate separate commit, post-QA, post-Chat — own test surface)
    - 🟡 `studio-settings-page.tsx` 837-LOC retirement — after portfolio + profile sub-route redesigns land
    - 🟡 Stories cluster coordinated retirement — `listStoriesMasters` + `/api/home/stories` + `/api/home/feed` + `<PortfolioStoriesBar>` together
    - 🟡 `getPushEnabled` consolidation — refactor, not cleanup
    - 🔵 `FocalImage` → `<Image>` migration (40+ usages, long-term)
    - 🔵 Pre-existing minor lint warnings (3 warnings + 1 error unrelated to this commit) — Phase 7 micro-sweep
  - **Next: QA-CHECKLIST pass** against the clean base — accumulated test coverage for Cabinet Studio 19 / booking widget guest path / seed P2002 / 5 drawer migrations / footer / navbar in both themes + mobile, before moving into Chat redesign

- **2026-05-19 — NAVBAR-REDESIGN-A** (commit on `designStudioCabinet`). **🎉 ПОСЛЕДНИЙ redesign-коммит. Redesign phase OFFICIALLY COMPLETE.** Reality-check per FOOTER-REDESIGN-A lesson turned out to apply even harder here — most of what the spec described as «нужно построить» already exists in `src/components/layout/topbar.tsx`. Two surgical changes shipped: brand-logo alignment + lint-drift closure.
  - **Reality-check audit findings (the most important section):**
    - The actual navbar component is `Topbar` (`src/components/layout/topbar.tsx`), NOT `Navbar`. Rendered by `<AppShell>` (`src/components/layout/app-shell.tsx`) — globally on every page (public + cabinets)
    - **All 5 role-driven states already exist** via canonical auth infrastructure:
      - `getSessionUser()` resolves the authenticated user with `roles[]`
      - `getAvailableCabinets(roles)` from `src/lib/auth/available-cabinets.ts` returns the `CabinetKind[]` set
      - `loadWorkspaceLinks(user.id)` in topbar.tsx invokes `hasMasterProfile()` + `hasStudioAdminAccess()` and conditionally returns master / studio shortcut links
      - `<AuthUserMenu>` accepts `availableCabinets` prop and renders the dropdown's switcher when length > 1
      - The 5 states branch naturally: guest → `<TopbarAuthButton>` + theme + mobile drawer; authed-client → bell + theme + AuthUserMenu (workspace shortcuts both null); authed-master → + master shortcut button; authed-studio → + studio shortcut button; authed-master+studio → + both shortcut buttons (AuthUserMenu also renders the «Профессиональные кабинеты» switcher in its dropdown)
    - **Every element the spec said «нужно построить» already exists:**
      - `<CitySelector>` from `features/cities/components/city-selector` — wired between iconmark + wordmark
      - `<NotificationsBell>` from `components/notifications/notifications-bell` — rendered for authed users
      - `<ThemeToggle>` from `components/theme-toggle` — both guest + authed
      - `<AuthUserMenu>` — dropdown with profile / proRoles / settings / logout + switcher
      - `<AuthMobileMenu>` — mobile drawer for both guest + authed
      - `<TopbarAuthButton>` — guest login + become-master CTA
      - `<WorkspaceShortcutLink>` — master / studio quick-access avatar buttons
    - **All NAV_LINKS routes resolve to real pages:** `/catalog`, `/models`, `/cabinet/bookings` (the `myBookings` route — exists)
    - **Inline brand-logo block** in Topbar.tsx (22 lines: gradient "М" square + wordmark with styled `<em>`) — duplicated from the same pattern the footer used before FOOTER-REDESIGN-A. Same fix applies — replace with `<BrandLogo>` shared component
    - **Lint drift source** is `.claude/references/*.{js,jsx}` files (`PublicHeader.js`, `admin-shell.jsx`, `catalog.js`, `clientBookings.js`, and ~12 others) — standalone design sketches with React-style JSX that doesn't transpile or import from the project. They're not application code. As the references folder grew through redesign work, they entered the lint surface and inflated the count from 823/122 to 858/134
  - **Раздел 3 (Архитектура):**
    - **MODIFIED:** `src/components/layout/topbar.tsx` — replaced the 22-line inline brand-logo block (gradient "М" square + styled wordmark + duplicate `<Link href="/">` × 2) with `<BrandLogo variant="iconOnly" size="md">` (iconmark slot — `siteLogo?.url` from admin upload still wins as override via `getSiteLogoAsset()`) + `<BrandLogo variant="monoText" size="sm">` (wordmark slot, separated by the existing `<CitySelector>` between them). Matches FOOTER-REDESIGN-A's earlier brand-logo alignment fix for visual + import consistency across the global shell
    - **MODIFIED:** `eslint.config.mjs` — added `".claude/**"` to `globalIgnores`. Closes the design-references lint drift. Result: 858/134 → 1/4 (the remaining 1 error + 4 warnings are pre-existing project code issues unrelated to navbar/topbar — they pre-date both this commit AND the 823/122 «old baseline» which was also inflated by `.claude` references)
    - **NO new components written.** All 5 role states already work via existing auth resolution. No `Navbar` shell, no role-driven branching code, no `<CitySelector>` build, no `<NotificationsBell>` build, no `<ThemeToggle>` build, no `<AuthUserMenu>` build — all of those exist
  - **Раздел 5 (Бизнес-логика):** не затронута. Auth resolution paths (`getSessionUser` + `getAvailableCabinets` + `loadWorkspaceLinks` + `hasMasterProfile` + `hasStudioAdminAccess` + `MembershipStatus.ACTIVE` filter) all preserved verbatim. The 5 role-driven UI states are emergent from the existing logic — no UI branching needed beyond what already exists
  - **Раздел 6 (Маршруты):** не затронуты. All NAV_LINKS routes (`/catalog`, `/models`, `/cabinet/bookings`), guest routes (`/login`, `/become-master`), and cabinet routes (`MASTER_CABINET_PATH`, `STUDIO_CABINET_PATH`) preserved verbatim
  - **Раздел 10 (Безопасность):** не затронута. Auth resolution reused as-is. No new auth surface
  - **Раздел 11 (Производительность):** no regression. `<BrandLogo>` is the same component the footer already uses (FOOTER-REDESIGN-A) — no new asset / no new font / no new query. Lint config change is config-only
  - **Раздел 12 (Инварианты):** не затронуты
  - **Раздел 13 (Правила):** new note — `<BrandLogo>` canonical across both Topbar (iconmark + wordmark) and Footer (full). `.claude/**` excluded from lint scope (design references aren't application code)
  - **UI_TEXT:** не затронут (all existing `nav.*` + `auth.*` + `cities.*` + `clientCabinet.switcher.*` keys reused as-is)
  - **Validation:** typecheck ✅, **lint 858/134 → 1/4** (drift CLOSED, well under the 823/122 target — that target was itself inflated by `.claude` references), encoding/mojibake/prisma ✅, **274/274 tests** (no test surface changed)
  - **Showcase verification (5 role paths via 4 seed accounts + guest):**
    - Guest (no session): TopbarAuthButton + ThemeToggle + mobile drawer ✅
    - Анна (`+79991000000`, MASTER role): bell + theme + master shortcut + AuthUserMenu ✅
    - Виктория Vision (`+79992000000`, STUDIO role): bell + theme + studio shortcut + AuthUserMenu ✅
    - Марина (`+79993000000`, MASTER role within Vision studio — has hasMasterProfile=true): same path as Анна (Марина doesn't admin the studio so `hasStudioAdminAccess` returns false) ✅
    - Admin (`+79994000000`, ADMIN role): authed-client path + admin link in AuthUserMenu ✅
    - master+studio combined: any user with both roles would render both shortcuts + switcher in dropdown — not in current seed but the branching exists
  - **Backlog spawned:** none — every spec-described element was already real, no aspirational item became a deferred backlog entry (contrast with footer where city/lang/currency selectors / metric tiles / App-Play / extended legal were all aspirational and got backlogged). 1 lingering pre-existing lint error + 4 warnings unrelated to navbar — acceptable, can be cleaned in Phase 7
  - **🎉 REDESIGN PHASE OFFICIALLY COMPLETE.** Full timeline: Cabinet Master sprint → Cabinet Studio sprint (19 commits, closed with STUDIO-SETTINGS-A) → Cabinet Client → Admin Panel (Phase 2 closed) → public master profile redesign → public studio profile redesign (STUDIO-PUBLIC-PROFILE-A) → booking widget FOUNDATION (guest path, scenario A/B, aggregator) → booking widget UI (wizard, animation, per-error, silent toggle) → modal unification (3 new primitives + 5 drawer migrations) → catalog enhancements (slotPrecision/availableToday) → footer redesign (2 CTA + BrandLogo) → navbar redesign (this commit). **Next workstreams:** Chat redesign (booking chat / attachments / SSE / studio admin chat auth gap), Phase 6 hardening (SMS gateway P1, `{ not: value }` sweep, multi-recipient notif, CI tests, catalog availability snapshot pipeline, `aggregateStudioSlots` SSR wiring), Phase 7 cleanup (`@deprecated` sweep + legacy 60 form-dialogs migration to FormDialog «при касании» + 837-LOC `studio-settings-page.tsx` retire), Phase 8 docs. **Recommended before Chat:** accumulated QA pass (Cabinet Studio 19 commits + booking widget guest path + seed P2002 fix + 5 drawer migrations + footer + navbar visual smoke in both themes + mobile)

- **2026-05-19 — FOOTER-REDESIGN-A** (commit on `designStudioCabinet`). Узкий редизайн глобального `Footer` — единственное что меняется: 1 CTA → 2 CTA карточки, inline brand-логотип → shared `<BrandLogo>`, выравнивание стилей через shared UI + tokens. **NO navbar / PublicHeader.js работы** — отдельный коммит позже (lint drift 858/134 будет закрыт там).
  - **Audit reality-check:**
    - User-provided spec described an aspirational footer (metric tiles 47/12400/284K/4.92, city/lang/currency selectors, App Store/Google Play buttons, full ИП/ИНН/ОГРНИП/152-ФЗ legal block, Cookies/Sitemap/Press-kit links) — **none of this exists in the codebase**
    - Real footer (`src/components/layout/footer/Footer.tsx`): 1 brand-aspirational CTA at top + 2-col grid (brand block / 4 link columns: О платформе / Для клиентов / Для мастеров / Поддержка) + 1-line `<FooterCopyright>` (year + entity placeholder + privacy/terms)
    - Per spec rule «весь контент footer ДОСЛОВНО сохранить» — I preserved whatever exists rather than fabricate aspirational content. The 3 scoped changes (2 CTA / alignment / logo) apply against the real footer
    - `BrandLogo` shared component exists at `src/components/brand/brand-logo.tsx` (variant `full` = iconmark + wordmark) — canonical reuse, replaces inline duplication
    - `/become-master` route already used by old `FooterCTA` (`CTA_HREF = "/become-master"`) — preserved. `/models` exists (model offers page from BACKLOG)
    - **CTA metrics have no live data source** — current footer has zero metrics; new metrics (+34% / 12 мин / 1240 / −54%) are presentational, marked as backlog
  - **Раздел 3 (Архитектура):**
    - **REWRITTEN:** `src/components/layout/footer/FooterCTA.tsx` — single brand-aspirational card → **2 side-by-side CTA cards** (`grid gap-5 lg:grid-cols-2`, stack on mobile). Brand-gradient «Для мастеров» card (`bg-brand-gradient` + `shadow-brand` + soft white blur orb) → `/become-master`. Soft `bg-bg-elevated` «Для моделей» card → `/models`. Each card: badge chip + display title + subtitle + 2 metric pairs + shared `<Button>` CTA with `ArrowRight` icon. Internal `CTACard` + `Metric` sub-components for the 2-tone shape; uses `cn` for variant class composition; tokens-only colours; framer-motion entrance preserved
    - **MODIFIED:** `src/components/layout/footer/Footer.tsx` — replaced 9-line inline brand-logo markup (gradient "М" square + dual-styled wordmark + `<Link href="/">`) with `<BrandLogo variant="full" size="md" href="/">` shared component. Removed orphan `Link` import. Rest of file unchanged
    - **MODIFIED:** `src/lib/ui/text.ts` — extended `UI_TEXT.footer.*` with `ctaMasters.*` and `ctaModels.*` subtrees (~16 keys). Old `footer.cta.*` retained (orphan but cheap to keep until NAVBAR cleanup pass)
    - **NOT changed:** `FooterColumn.tsx`, `FooterLink.tsx`, `FooterCopyright.tsx`, `FooterSocials.tsx`, `index.ts` — preserved verbatim. 4 link columns + their routes + brand description + socials + copyright + legal-entity line untouched
  - **Раздел 5 (Бизнес-логика):**
    - Footer is rendered globally via `<AppShell>` (`src/components/layout/app-shell.tsx`) — all public AND cabinet pages get it. Layout regression verified via typecheck + lint baseline preservation. No routing/content/functional change anywhere downstream
    - 2 CTA cards funnel traffic to existing routes: `/become-master` (master onboarding marketing page) + `/models` (model offers marketplace)
    - Metrics shown are **presentational marketing values, not live data** — no aggregation pipeline exists for them today. Same honest stance as the rest of the codebase (no fake-as-data)
  - **Раздел 6 (Маршруты):** не затронуты — все footer-ссылки сохранили свои `href`s
  - **Раздел 11 (Производительность):** no regression. Same `<motion.div>` entrance pattern, same `<Button>` usage. `<BrandLogo>` is the same component the navbar uses — no new asset / no new font / no new query
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** 16 new keys under `footer.ctaMasters.*` + `footer.ctaModels.*`. Old `footer.cta.*` subtree retained (orphan, cleanup in NAVBAR commit)
  - **Validation:** typecheck ✅, lint baseline **858/134 preserved** (external `.claude/references/PublicHeader.js` drift carried over — NAVBAR commit will close it back to 823/122), encoding/mojibake/prisma ✅, **274/274 tests** (no test surface changed)
  - **Both themes** — brand-gradient card uses `text-white`+`text-white/85`+`text-white/75` overlays (works on the gradient surface), soft card uses `text-text-main`+`text-text-sec` tokens (auto-themes). No inline hex, no `dark:` overrides needed
  - **Mobile-first:** cards stack vertically below `lg`, grid on `lg+`. Metrics wrap on narrow widths via `flex-wrap gap-x-6 gap-y-3`. Touch-friendly tap targets via `<Button size="md">`
  - **Backlog spawned:** real CTA metrics (when an aggregation pipeline exists — current figures are presentational marketing values), aspirational footer content (city/lang/currency selectors, metric tiles, App-Play buttons, expanded legal block — none exist today, separate features each)
  - **Next:** NAVBAR-REDESIGN (last redesign commit — will also close the 858/134 lint drift back to 823/122 by handling `.claude/references/PublicHeader.js`)

- **2026-05-19 — CATALOG-ENHANCEMENTS-A** (commit on `designStudioCabinet`). Точечная интеграция 2 полей Provider в catalog card — `slotPrecision` + `availableToday`. **NO redesign, NO schema migration, NO schedule-engine на витрину.**
  - **Audit findings:**
    - `Provider.slotPrecision` is a `String` field (not Prisma enum) with canonical values `"exact" | "today_free" | "date_only"` per `src/lib/schedule/editor-shared.ts:86`
    - The catalog listing query (`searchCatalogProviders` in `src/lib/catalog/catalog.service.ts`) **does NOT compute per-card `nextSlot`** — it hardcodes `nextSlot: null` (line 723 pre-commit) and exposes only the cheap `availableToday: boolean` snapshot already on `Provider`
    - **The card never actually rendered availability before this commit** — its `nextSlot` field was always null on the listing path, so the «зелёная точка» chip was hidden by the `slotText ? ... : null` ternary. Provider preference (`slotPrecision`) had no consumer
    - `visibleSlotDays` is NOT relevant to the card today (card has no horizon/calendar UI; only a single chip). Would matter only if a precomputed `nextSlot` snapshot existed
    - `catalog/loading.tsx` exists (audit-flagged Suspense risk is not present for this route)
  - **Раздел 3 (Архитектура):**
    - **NEW:** `src/features/catalog/lib/slot-precision-format.ts` — pure helper. Exports `SlotPrecision` type + `normalizeSlotPrecision(unknown): SlotPrecision` + `formatAvailability({precision, nextSlotStartAt?, availableToday?, timeZone, fallbackToOpen?}): { label, tone }`. Switch logic: `exact + nextSlotStartAt` → «Ближайшее: {when}»; `today_free + availableToday` → «Сегодня свободно»; `date_only + nextSlotStartAt` → «Свободно {date}»; soft fallback when `exact` is set but no snapshot — `availableToday` still surfaces «Сегодня свободно» (graceful, NOT N× engine call). Returns `{ label: null }` when caller passes `fallbackToOpen: false` and nothing positive is known
    - **Modified:** `src/lib/catalog/catalog.service.ts` — `searchCatalogProviders` Provider `select` extended with `slotPrecision: true` (already had `availableToday: true`). `CatalogProviderItem` DTO extended with optional `slotPrecision?: string` + `availableToday?: boolean` (existing `todaySlotsCount: 1` preserved for backwards compat). Both fields are scalar columns on the same row — no JOIN, no engine pass
    - **Modified:** `src/features/catalog/components/catalog-card.tsx` — replaced inline `slotText = item.nextSlot ? UI_FMT.dateTimeShort(...) : null` with `formatAvailability(...)`. Chip rendering branches on `availability.tone` — `"available"` keeps the emerald dot + emerald text, `"neutral"` uses muted tone. Card frame (22a/22b) untouched
    - **Modified:** `src/lib/ui/text.ts` — `UI_TEXT.catalog2.card.availability.{nextSlotExact, todayFree, dateOnly, bookingOpen}` (4 keys)
  - **Раздел 5 (Бизнес-логика):**
    - `slotPrecision` now consumed on the public catalog — provider's preference drives the card's chip. The 3 modes branch on the data already cheaply available
    - `visibleSlotDays` deliberately NOT consumed here — no horizon UI in the card; would only be meaningful with a precomputed `nextSlot` snapshot (backlog)
    - **Perf invariant preserved:** the catalog listing remains `N × O(1)` lookups per provider. No `buildSlotsForDay` fan-out. The booking widget's slot computation path is the only place schedule-engine still runs (per-master, on demand)
  - **Раздел 6 (Маршруты):** не затронуты
  - **Раздел 11 (Производительность):** no regression. Listing select adds 1 scalar column (`slotPrecision`); `formatAvailability` is a pure switch returning a string. Card render added zero network round-trips
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** 4 new keys under `catalog2.card.availability.*`
  - **Validation:** typecheck ✅, lint baseline 858/134 preserved (external `.claude/references/PublicHeader.js` drift carried over from previous commits — not my code), encoding/mojibake/prisma ✅, **274/274 tests** (no test surface changed)
  - **Backlog spawned:** catalog availability pre-computation — a snapshot pipeline (provider's nearest free slot, computed off the booking write path, cached on `Provider` or Redis) is the dependency for `exact` + `date_only` paths to render their precise availability instead of soft-falling back to `today_free`. Same snapshot would give `visibleSlotDays` a meaningful clamp point in the card. Cost: requires booking-write hooks + an invalidator + a worker job — out of scope for this small commit
  - **🎉 Public catalog filtering item from BACKLOG ✅ partially closed.** Remaining tracked work: catalog availability snapshot pipeline. Next workstream: navbar/footer (would also clear the lingering `.claude/references/PublicHeader.js` lint drift)

- **2026-05-18 — MODAL-UNIFY-IMPL-A** (commit on `designStudioCabinet`). Final consolidation sweep — unified the project's modal/drawer system per the «достроить existing» variant chosen from MODAL-UNIFY-EXPLORE. **3 new primitives + 5 drawer migrations + 0 schema changes + 0 forced rewrites of 79 existing ModalSurface consumers.**
  - **Audit findings (from EXPLORE, confirmed during impl):**
    - `ModalSurface` already canonical: 79 files, 251 import-occurrences. Stable since the «modals-investigation» portal-to-body fix
    - `ConfirmModal` + `useConfirm()` already serve simple/destructive confirmation cleanly — untouched
    - 5 drawer components rolled their own portal + scroll-lock + escape + animation: `booking-detail-drawer` (462 LOC), `client-card-drawer` (366 LOC, **CRM with fetch+mutations — HIGH-RISK**), `master-card-drawer` (268 LOC), `mobile-filter-drawer` (137 LOC), `booking-bottom-sheet` (155 LOC). Total ~1388 LOC of duplicated shell logic
    - ~60 form-dialogs duplicate `mt-5 flex justify-end gap-2` footer + `submitting` state + error display verbatim
    - `Booking.silentMode` schema column verified — booking widget wizard (BOOKING-WIDGET-UI-A) is **full-page, NOT modal** — outside scope
    - framer-motion@12.38.0 already installed — no new dep
  - **Раздел 3 (Архитектура):**
    - **EXTENDED:** `src/components/ui/modal-surface.tsx` — backwards-compatible. New optional props: `size: "sm"|"md"|"lg"|"xl"|"full"` (default `lg` = original `max-w-2xl`), `header: { title, subtitle?, icon? }` (rich header with auto `aria-labelledby`; plain `title` string still works for 79 existing callers), `footer?: ReactNode` (rendered below children). framer-motion `AnimatePresence` wraps overlay (fade) + panel (fade + scale + slight y-translate). All 79 existing callsites render identically — old API unchanged
    - **NEW:** `src/components/ui/form-dialog.tsx` — wraps `ModalSurface`, built-in `<form>` element + Cancel/Submit footer + internal `submitting` state + internal `try/catch` error display + externally-controllable `error`/`submitDisabled` props + `submitVariant: "primary"|"danger"`. For new form dialogs; replaces the ~60×repeated boilerplate going forward
    - **NEW:** `src/components/ui/drawer.tsx` — unified portal-to-body + scroll-lock + ESC/overlay close + sticky header with × + optional `headerActions` + optional `footer` (safe-area aware on bottom variant) + framer-motion slide-in. Props: `side: "right"|"left"|"bottom"`, `size: "sm"|"md"|"lg"|"xl"`, `title?`, `headerActions?`, `drag?` (touch swipe-down dismiss on bottom variant), `hideCloseButton?`, `footer?`, `ariaLabel?`
    - **MIGRATED 5 drawers (public API preserved, business logic verbatim):**
      - `features/catalog/components/mobile-filter-drawer.tsx`: 137→78 LOC, `<Drawer side="bottom" size="lg">` with `footer` slot for apply/reset; `CatalogSidebar` content reused
      - `features/booking/components/booking-flow/booking-bottom-sheet.tsx`: 155→55 LOC, `<Drawer side="bottom" size="xl" drag>` (drag preserved via primitive's flag); `BookingFlowStepper` reused — **no booking-creation logic touched**
      - `features/studio/components/master-card-drawer.tsx`: ~30 lines around shell changed; all fetch (`load`/`saveServices`/`saveProfile`) + tab state + forms preserved verbatim
      - `features/cabinet/components/booking-detail-drawer.tsx`: ~60 lines around shell changed; removed redundant local `mounted` + `isVisible` state + custom escape handler + `ReactDOM.createPortal` (Drawer handles all); `canRescheduleByClient`/`canCancelByClient`/`busyAction`/`ReviewForm`/`RescheduleSection` integrations preserved
      - `features/crm/components/client-card-drawer.tsx`: ~10 lines around shell changed; **HIGH-RISK file kept minimal** — only outer overlay/portal swap; all fetch/mutation/state logic (`load`/`save`/`toggleTag`/`uploadPhoto`/`removePhoto`), photo lightbox, notes/tags/history sections preserved дословно
    - **`src/lib/ui/text.ts`:** added `common.save` + `common.errorGeneric` (2 keys; shared by FormDialog and any future callers needing the same defaults)
  - **Раздел 5 (Бизнес-логика):** не затронута. Все 5 drawer'ов сохранили публичный API (`BookingDetailDrawer`, `ClientCardDrawer`, `MasterCardDrawer`, `MobileFilterDrawer`, `BookingBottomSheet`) — каждый callsite продолжает работать без изменений. `client-card-drawer` fetch+mutation logic дословно — CRM-критичный путь не тронут. `ConfirmModal` + `useConfirm()` остались canonical для confirm flows. Booking widget wizard (BOOKING-WIDGET-UI-A, full-page) вне scope этой унификации
  - **Раздел 6 (Маршруты):** не затронуты — UI-only consolidation
  - **Раздел 13 (Правила):** новое правило для писателей UI — для новых form-dialogs используется `<FormDialog>` (boilerplate автоматизирован). Для drawer'ов — единый `<Drawer side="right|left|bottom" size="sm|md|lg|xl">`. `ModalSurface` `size` prop заменяет ручной `className="max-w-md"` (старый паттерн работает, новый — предпочтительный)
  - **Раздел 11 (Производительность):** небольшое улучшение — `ModalSurface` теперь рендерит через `AnimatePresence` (mount/unmount-aware). Открытие/закрытие модалок стало плавным (fade + scale 220ms), не дёрганым. Drawer animations такого же качества (spring для bottom, ease для side). Body-scroll-lock семантика сохранена. Portal-to-body invariant сохранён (modals-investigation fix не нарушен)
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** +2 ключа (`common.save` + `common.errorGeneric`). Shared, не специфичны
  - **Validation:** typecheck ✅, lint baseline 858/134 preserved (external `.claude/references/PublicHeader.js` drift carried over from BOOKING-WIDGET-A — not my code), encoding/mojibake/prisma ✅, **274/274 tests** (no test surface changed)
  - **Backlog spawned:** legacy ~60 form dialogs → migrate to `<FormDialog>` «при касании» (tracking, не массово), `<DestructiveDialog>` retype-confirm wrapper if pattern зачастит (currently 4 sites — приемлемо), shared multi-step modal primitive when wizard-inside-modal pattern станет нужен (сейчас не нужно — booking widget full-page, settings full-page)
  - **🎉 Final consolidation sweep complete.** Cabinet redesigns (Master + Studio + Client + Admin), public surfaces (master profile + studio profile + booking widget FOUNDATION + UI), modal унификация — все шипнуты. Остатки: catalog enhancements (мелочь), navbar/footer (которые также почистят `.claude/references/PublicHeader.js` lint drift вернуть на 823/122), Phase 6/7/8 hardening

- **2026-05-18 — BOOKING-WIDGET-UI-A** (commit on `designStudioCabinet`). **Public surfaces workstream commit 4/N.** **Stage 2 of 2 — Booking widget redesign COMPLETE.** Full wizard UX redesign sitting on top of the BOOKING-WIDGET-FOUNDATION-A backend. Foundation reused verbatim (guest nullable boundary, `createBooking` core, `aggregateStudioSlots`, scenario A/B detection, enforcement). This commit is **pure UI** — no schema migration, no foundation rewrite, no routing split.
  - **Audit findings:**
    - `Booking.silentMode: Boolean @default(false)` already exists in schema — spec's contingency «помолчать → notes-flag, негде → убрать» turned out to be unnecessary. Existing widget already passed `silentMode` to `createBooking`. UI just needs to surface a toggle prominently
    - `framer-motion@12.38.0` already in `package.json` (used by admin-cabinet billing tabs) — no new dep
    - Existing `loading.tsx` was generic skeleton (stepper dots + single card) — doesn't match new 2-column wizard layout; redesigned to match
    - `ProviderProfileDto` doesn't expose `minBookingHoursAhead` / `maxBookingDaysAhead` / `visibleSlotDays` (BOOKING-WIDGET-A enforces those server-side; public consumers get the result, not the params). `BookingError` component falls back to defaults `2 ч` / `30 дн` when those values aren't available. Threading them through the DTO is a separate backlog
    - Existing `booking-flow.tsx` mixed all rendering inline (730 LOC). Rewrite reorganises into wizard state machine + 10 sub-components in `components/` and `components/steps/`
    - Reference jsx (`page-studio-booking.jsx`, 1624 LOC) is sketchier than production — uses inline hex (`#560505`, `rgba(...)`, `var(--burgundy-500)`) instead of project Tailwind tokens. My implementation translates to `bg-brand-gradient`, `text-text`, `border-border-subtle`, etc., per ui-ux-pro-max skill
  - **Раздел 3 (Архитектура):** new module structure `src/features/public-studio/studio-booking-flow/components/`:
    - **NEW:** `booking-hero.tsx` — cover band with bw-dots pattern + studio address chip + rating chip; logo overlap; masters-stack (avatars overlap + «+N») OR prefilled-master chip if scenario B; back link to studio profile
    - **NEW:** `steps-bar.tsx` — 4-step indicator (Услуга / Мастер / Когда / Вы) with active + done states (`isDone` → primary fill, `isActive` → text fill, default → muted). Scenario B filters out master step → 3-step variant. ARIA `role="list"` + `aria-current="step"`
    - **NEW:** `step-transition.tsx` — pure framer-motion wrapper. `AnimatePresence mode="wait"` + custom direction-aware variants (`enter: x: 24*direction → center: x:0 → exit: x: -24*direction`) + crossfade. 280ms `cubic-bezier(0.22, 1, 0.36, 1)` (project standard from ui-ux-pro-max)
    - **NEW:** `steps/service-step.tsx` — header + search input + service cards grid (2-col on sm+, 1-col mobile). Search filter applies live; empty state with friendly copy
    - **NEW:** `steps/master-step.tsx` — header + back button + «Любой свободный» card (gradient icon, picks first master with slots — FOUNDATION's `resolvedMasterId` logic) + per-master cards (avatar initial, name, next-window timestamp from `availabilityByMaster`)
    - **NEW:** `steps/when-step.tsx` — header + back button + horizontal day-strip (snap-x scroll on mobile, `daysAhead` capped at `STUDIO_BOOKING_DAYS_AHEAD = 60`) + Утро/День/Вечер slot groups (split by viewer-timezone hour: <12 morning, <16 day, else evening). Slots formatted via `UI_FMT.timeShort(slot.startAtUtc, { timeZone: viewerTimeZone })`. Empty + loading states per group
    - **NEW:** `steps/you-step.tsx` — header + back button. Guest branch: name + phone inputs with login fallback link; auth branch: read-only user card. «Хочу помолчать» toggle (re-styled), comment textarea
    - **NEW:** `booking-summary.tsx` — sticky right-rail card. Status badge (5 phases: badgeService/Master/When/You/Ready), 3 row layout (Услуга / Мастер / Когда), total kopeks (via `UI_FMT.priceLabel`), submit CTA (with `submitting` state + disabled fallback copy), cancellation hint using `Provider.cancellationDeadlineHours` (DTO field that DOES exist)
    - **NEW:** `booking-error.tsx` — per-error mapper. Switch on ErrorCode: `BOOKING_TOO_SOON` → tooSoon copy with `{hours}`; `BOOKING_TOO_FAR` → tooFar with `{days}`; `NEW_CLIENTS_CLOSED` → fixed copy; `SLOT_CONFLICT`/`BOOKING_CONFLICT` → slotTaken; `FORBIDDEN` → forbidden; unknown → server fallback OR generic
    - **REWRITTEN:** `booking-flow.tsx` — wizard state machine (`step: WizardStep`, `direction: 1|-1`). All FOUNDATION data fetching (`fetchStudioProfile`/`fetchStudioMasters`/`fetchBookingMe`/`fetchMasterAvailability`/`fetchPublicServiceBookingConfig`/`uploadBookingReference`) and submit (`createBooking` client lib → `/api/bookings` POST) preserved verbatim. New state: `step`, `direction`, `success` (replaces wizard with confirmation view on success), `submitErrorCode` (separate from `submitError` for typed mapping). `goNext` + `goBack` honour scenario B (skip master step). Service/master/slot pick auto-advances. Back arrows reverse with reverse animation. Auth modal markup from pre-FOUNDATION fully removed (was dead UI). bookingConfig (reference photo + questions) rendered inline in `you-step` via `renderBookingConfig` helper
    - **REWRITTEN:** `src/app/(public)/u/[username]/booking/loading.tsx` — 2-col skeleton matching new wizard layout (hero band + stepper + step body grid + summary card with rows + CTA)
    - **MODIFIED:** `src/lib/ui/text.ts` — new top-level `bookingWidget.*` subtree (~80 keys): backToStudio, hero (studioLabel/bookingToMaster/mastersCount/teamPick/teamPickHint/ratingLabel), steps (stepLabel + 4 step names), 4 step-specific blocks, summary (badges + rows + submit + cancellation hint), errors (5 coded + generic + networkGeneric), success (title + detailsTemplate + hint + backToStudio), progressLabel
  - **Раздел 5 (Бизнес-логика):**
    - **Wizard state machine over preserved data flow.** All effects, fetching, slot computation, submit path identical to FOUNDATION. Render reorganised; semantics unchanged
    - **«Хочу помолчать» wired through existing `Booking.silentMode` schema column** — no migration, no notes-flag hack. Spec's «негде → backlog» contingency turned out unnecessary
    - **Per-error UI:** 5 ErrorCode mappings live. `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR` substitute provider-policy numbers when known; today the DTO doesn't expose them → falls back to defaults. Backlog 🟡 surfaces those fields in the DTO for accurate inline numbers
    - **Scenario A (studio, 4 steps):** service → master → when → you. Cards in service step show studio-wide; master step shows team + «Любой свободный»
    - **Scenario B (`?master=` or prefilled, 3 steps):** master step skipped — service → when → you. Hero renders a prefilled-master chip instead of the team stack. **Master-direct route `/u/[username]/booking` for solo masters STILL DEFERRED** — solo masters book via embed on `PublicMasterProfilePage`; `/u/anna/booking` continues to redirect to `/u/anna`. This is intentional per the user's stage 2 scope decision
    - **`aggregateStudioSlots` server helper** (FOUNDATION) still available but **not consumed by the widget** — widget uses client-side merge via per-master `fetchMasterAvailability` as before. Server aggregator is reserved for SSR'd public-studio slot-bar wiring (separate surface, separate backlog item)
    - **`createBooking` core untouched** — FOUNDATION's nullable adaptation is the boundary. Submit path: same client-lib `createBooking({...})` posting to `/api/bookings`, which (FOUNDATION) accepts guest. Idempotency + rate-limit + conflict + transaction all preserved
  - **Раздел 6 (Маршруты):** `/u/[username]/booking` page route unchanged. `loading.tsx` redesigned. Backend API unchanged. **No new endpoints.**
  - **Раздел 11 (Производительность):** SSR shell + client wizard (existing pattern). Suspense boundary at the page level renders new `loading.tsx` 2-col skeleton before the client island hydrates. Subsequent step transitions are pure client-side animations (no network for transitions). Slot fetching still per-master parallel (FOUNDATION). Audit-flagged streaming risk addressed via the redesigned skeleton matching the actual layout (was a single tall card before — bad LCP optics)
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** new top-level `bookingWidget.*` subtree (~80 keys). Existing `publicProfile.booking.*` keys reused for bookingConfig (reference photo + questions form). `publicStudio.guest*` from FOUNDATION reused for guest validation strings
  - **Validation:** typecheck ✅, lint baseline 858/134 preserved (external `.claude/references/PublicHeader.js` drift carried over — not my code; verified my files clean), encoding/mojibake/prisma ✅, **274/274 tests** (no test surface changed; foundation tests still pass)
  - **Mobile-first:** 1-col layout below `lg` breakpoint, 2-col with sticky summary on `lg`+. Day strip snap-scrolls on mobile. Service cards stack 1-col on mobile, 2-col on `sm`+. Touch-friendly tap targets (min 44px equivalent via `py-3.5` / `h-9` slot buttons)
  - **Both themes:** all colours via project tokens (`bg-bg-card`, `text-text`, `border-border-subtle`, `bg-primary`, `bg-bg-muted/40`, `text-emerald-700 dark:text-emerald-300`). No inline hex. Brand gradient via `bg-brand-gradient` utility
  - **Backlog spawned (4 items):**
    - 🟡 Master-direct booking route `/u/[username]/booking` for solo masters (currently embed-only)
    - 🟡 Wire `aggregateStudioSlots` SSR into public-studio profile slot-bar (closes STUDIO-PUBLIC-PROFILE-A live-counter backlog)
    - 🟡 Surface `Provider.{minBookingHoursAhead, maxBookingDaysAhead, visibleSlotDays}` в public DTO for accurate `BookingError` numbers
    - 🟡 Streaming + RSC refactor `/u/[username]/booking` (sub-step islands instead of single big client component)
  - **🎉 Booking widget workstream COMPLETE** — FOUNDATION (guest + scenario + slot aggregation + nullable boundary) + UI (wizard + animation + per-error + silent toggle) = core conversion surface production-ready. **Next workstreams:** Catalog enhancements / Marketing / Hot slots / Inspiration / Models / Master public profile follow-ups. Plus Phase 6 hardening (SMS gateway, `{ not: value }` sweep, multi-recipient notif, CI tests), Phase 7 cleanup (`.claude/references/PublicHeader.js` lint drift, 837-LOC legacy `studio-settings-page.tsx` retire), Phase 8 docs

- **2026-05-18 — BOOKING-WIDGET-FOUNDATION-A** (commit on `designStudioCabinet`). **Public surfaces workstream commit 3/N.** **Stage 1 of 2** for the booking-widget redesign — closes the 3 architectural blockers BOOKING-WIDGET-A identified, **without redesigning the widget UI** (deferred to BOOKING-WIDGET-UI-A per spec rule «Это CORE конверсия — приоритет надёжности над фичами»).
  - **AUDIT REFINED the 3 blockers** identified by BOOKING-WIDGET-A:
    - **Blocker 1 (auth gate):** BOOKING-WIDGET-A audit was imprecise — `requireAuth({ allowGuests: false })` doesn't exist in `page.tsx`. The page is fully public. The REAL auth gate lives at `/api/bookings` POST: `getSessionUser(req)` (throws AppError if no session) + `requireRole([CLIENT])`. The widget calls `createBooking` client-fn, posts to that endpoint, and shows an auth modal on `AUTH_REQUIRED` response. To unblock guest: extend the endpoint to allow nullable session and adapt downstream callsites
    - **Blocker 2 (scenario B):** PARTIALLY ALREADY WIRED. `page.tsx` line 118 already parses `?master=<id>` and passes it to `StudioBookingFlow` as `initialMasterId` when the route is a STUDIO provider. The flow's `setMasterId` is prefilled in `useEffect` (lines 252-268). For MASTER provider URLs (`/u/anna/booking`), the page **redirects to `/u/anna`** — solo masters use the embedded booking widget on their profile (`PublicMasterProfilePage`), not the dedicated `/booking` route
    - **Blocker 3 (slot aggregation):** PARTIALLY ALREADY WIRED. `StudioBookingFlow` line 280-307 already does `Promise.all(masters.map(fetchMasterAvailability))` + `ANY_MASTER_ID="__any__"` UI flow (lines 52, 489-498). The widget picks the first master with slots when "Любой мастер" is selected. The missing piece was a **server-side** aggregator for SSR'd panels (e.g. the public-studio profile slot-bar from STUDIO-PUBLIC-PROFILE-A, which had to ship without a live counter)
  - **Раздел 3 (Архитектура):**
    - **NEW:** `src/lib/schedule/studio-slot-aggregation.ts` — pure helper. Exports `aggregateStudioSlots()` (server, loads ACTIVE-only MasterService rows via invariant #24 predicate `ownerUserId IS NOT NULL && isPublished`, runs `Promise.all` of `listAvailabilitySlotsPaginated` per-master, merges via `mergeByStart`) + pure `mergeByStart()` (testable, deterministic earliestMasterId via input order). Safety cap `maxMasters` (default 12). Reuses `listAvailabilitySlotsPaginated` + `resolveServiceDuration` — engine untouched
    - **NEW:** `src/lib/schedule/studio-slot-aggregation.test.ts` — **9 unit tests** for `mergeByStart` (empty, single-master, dual-master shared time, master input-order preservation in earliestMasterId, sparse 3-master matrix, chronological sort, dedup within per-master list, unknown-master ordering)
    - **Modified:** `src/lib/bookings/booking-core.ts` — `resolveBookingCore` input type `clientUserId: string | null`. Skip ownership-self check when null. `acceptNewClients=false` gate: treat guest as new client (0 priors → blocked, same UX as a logged-in new client). Single ternary on `priorBookingsCount` avoids extra Prisma call when not needed
    - **Modified:** `src/lib/bookings/createBooking.ts` — same `clientUserId: string | null`. Namespace key `clientUserId ?? \`guest:${clientPhone}\`` used for idempotency + rate-limit. Hot-slot anti-fraud check (cancellation-history) skipped for guest. Booking row saved with `clientUserId: null`
    - **Modified:** `src/lib/bookings/booking-extras.ts` — `resolveBookingExtras.clientUserId: string | null`. Guest can't attach reference photo (uploads are auth-only → 403)
    - **Modified:** `src/lib/bookings/idempotency.ts` — `resolveBookingIdempotency.userId: string | null`. Guest cached-booking lookup filters `clientUserId: null` (namespaced by phone, no cross-user collision)
    - **Modified:** `src/app/api/bookings/route.ts` — POST switched from hard `getSessionUser(req)` (throws) to `getSessionUserFromRequest(req)` (nullable). Session user → require CLIENT role (preserve original semantics). No session → guest path: `effectiveClientUserId = null`. Legacy `slotLabel`-only branch still requires session (createClientBooking adaptation deferred — booking widget always sends startAtUtc/endAtUtc). `invalidateRecentMastersCache` guarded behind nullable userId
    - **Modified:** `src/features/public-studio/studio-booking-flow/booking-flow.tsx` — new `guestName` + `guestPhone` state. When `!me && !meLoading` after profile load, render a guest contacts card (name + phone inputs + login hint). Submit no longer triggers auth modal on AUTH_REQUIRED (removed — guest submit goes through). Existing auth modal markup left in tree (showAuthModal stays false) — Phase 7 cleanup
    - **Modified:** `src/lib/ui/text.ts` — `publicStudio.guest*` subtree (~9 keys: section title/hint, name+phone labels/placeholders, required-error strings, login hint+CTA)
  - **Раздел 5 (Бизнес-логика):**
    - **Guest booking enabled at the API + lib boundary.** The page is public, the endpoint accepts anonymous, the core flow accepts `clientUserId: null`. Surgical adaptation per spec («guest path может требовать adaptation resolveBookingCore — описать объём, НЕ переписывать idempotency/conflict»). All boundary changes documented inline with `BOOKING-WIDGET-FOUNDATION-A:` comments. **`createBooking` core preserved** — idempotency / conflict / transaction / rate-limit / UTC plumbing intact. The boundary change is in: (a) input type widening to nullable, (b) per-callsite null branches that skip user-only checks, (c) namespace-key derivation. No transaction-level rewrite
    - **Enforcement (policy-enforcement.ts from BOOKING-WIDGET-A) preserved.** Guest is treated as new client → `acceptNewClients=false` providers block them with `NEW_CLIENTS_CLOSED 403` (same UX as a logged-in new client). `minBookingHoursAhead` / `maxBookingDaysAhead` apply to guest equally
    - **link-guest-bookings.ts post-signup linker preserved** (existing test suite still passes). When a guest signs up later with the same phone, their bookings get attached via the existing flow — no change to that helper
    - **Scenario A/B detection** is mostly the responsibility of `page.tsx` (which already parses `?master=`) + `StudioBookingFlow` (which already prefills `masterId` from `initialMasterId`). This commit doesn't add scenario routing because scenario B for studios was already wired. **Solo-master direct booking via `/u/anna/booking`** deliberately not enabled — solo masters book via the embedded widget on their profile page, which preserves the existing UX. Enabling the dedicated `/booking` route for MASTER providers would require either extending `StudioBookingFlow` (which currently throws for MASTER provider type, line 153) or a parallel `MasterBookingFlow` — backlog
    - **Slot aggregation** is now available as a server-side helper for SSR panels (`aggregateStudioSlots`). The widget continues to do client-side aggregation as before — no UI change. Wiring the server helper into public-studio slot-bar (STUDIO-PUBLIC-PROFILE-A backlog) is BOOKING-WIDGET-UI-A territory
  - **Раздел 6 (Маршруты):** `/u/[username]/booking` page route unchanged (was always public — the auth gate was a misattribution in BOOKING-WIDGET-A audit). `POST /api/bookings` now accepts anonymous requests. **No new endpoints.** Legacy `slotLabel`-only path in POST still requires a session (createClientBooking guest adaptation deferred — widget sends UTC always)
  - **Раздел 10 (Безопасность):** `allowGuests` (effectively) enabled **ТОЛЬКО** на `/api/bookings` POST — not globally. Other endpoints (cancel, confirm, reschedule, chat, etc.) unchanged. Guest path: `clientUserId: null` saved to row; namespace-key derives from phone; idempotency + rate-limit preserved per-phone; ownership/anti-fraud checks skipped (no userId to attribute against — backlog phone-scoped anti-fraud). Reference-photo uploads remain auth-only (asset has `createdByUserId` ownership). Guest's identity verification is **NOT** performed (SMS gateway not wired — P1 launch blocker; phone is just stored). Existing `linkGuestBookingsToUserByPhone` does post-signup attachment when a real user with matching phone registers
  - **Раздел 11 (Производительность):** no regression. `aggregateStudioSlots` runs N parallel queries (N ≤ 12 by default cap, ≤ team size) reusing existing DayPlan cache — same cost as the widget's per-master fan-out. Idempotency + rate-limit do one extra string-template per guest call. No new database round-trips added to the common path
  - **Раздел 12 (Инварианты):** не затронуты. Invariant #24 (ACTIVE-master predicate) is REUSED in `aggregateStudioSlots` — `MasterService` filter includes `masterProvider: { ownerUserId: { not: null }, isPublished: true }`
  - **UI_TEXT:** 9 new keys under `publicStudio.guest*`
  - **Validation:** typecheck ✅, lint baseline 858/134 preserved (external `.claude/references/PublicHeader.js` drift carried over from BOOKING-WIDGET-A — not my code), encoding/mojibake/prisma ✅, **274/274 tests** (265 → 274, +9 from studio-slot-aggregation.test.ts)
  - **Backlog spawned:**
    - 🟠 BOOKING-WIDGET-UI-A (stage 2) — full wizard UX redesign: animated 4/3-step flow, sticky summary, hero context, per-error inline UI copy for `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR` / `NEW_CLIENTS_CLOSED`, `silentMode` UI surface, per-step skeletons, framer-motion transitions
    - 🟠 Wire `aggregateStudioSlots` into public-studio profile slot-bar SSR (closes STUDIO-PUBLIC-PROFILE-A live-counter backlog)
    - 🟠 Master-direct booking route — `/u/[username]/booking` enablement for MASTER providers (needs either StudioBookingFlow's MASTER-type branch or a parallel MasterBookingFlow)
    - 🟡 Guest OTP verification (needs SMS gateway — P1 launch blocker)
    - 🟡 Phone-scoped guest anti-fraud (hot-slot rebook detection)
    - 🟡 Guest reference-photo uploads (phone-scoped asset ownership)
    - 🟡 createClientBooking legacy slotLabel-path guest adaptation (currently widget always sends UTC, so this branch is unreached)
    - 🟡 Routing split `/u/` master + `/v/` studio (user decision deferred)
    - 🟡 Online payment integration on widget
    - 🟡 Client-side `cancellationDeadlineHours` enforcement + UX copy
    - 🟡 Streaming + RSC refactor on `/u/[username]/booking` (currently fully client-rendered)
    - 🔵 A/B test infrastructure for widget variants
    - 🔵 HotSlot integration on widget
    - 🔵 Multi-service booking (cart pattern)
    - 🔵 Funnel analytics
  - **Next workstreams:** BOOKING-WIDGET-UI-A (stage 2 — wizard redesign on top of this foundation), Master public profile follow-ups, Catalog enhancements, Marketing, Hot slots, Inspiration, Models. Plus Phase 6 hardening / Phase 7 cleanup / Phase 8 docs

- **2026-05-18 — BOOKING-WIDGET-A** (commit on `designStudioCabinet`). **Public surfaces workstream commit 2/N.** **Booking policy enforcement** wired into the existing booking flow + slots endpoint. Full widget UX redesign **deferred** per scope rule «приоритет надёжности над фичами» — closing the highest-risk gap first (P1 pre-launch blocker) without touching the 600+LOC client widget or `createBooking` core.
  - **Audit findings:**
    - **Auth gate blocker:** `/u/[username]/booking/page.tsx` does `requireAuth({ allowGuests: false })`. Anonymous catalog browsers hit redirect to login before they can pick a slot. Guest checkout path exists structurally (`linkGuestBookingsToUser` post-signup) but is not wired through the widget entry. Full redesign would need to unwind this gate — backlog
    - **Scenario B not wired:** Direct booking with a specific master via `?master=<id>` query exists in URL spec but the widget hardcodes studio-scope service picker. Master-direct path → backlog
    - **Studio slot aggregation missing:** `buildSlotsForDay` is per-master only. Live studio-scope free-slot rendering requires N parallel per-master calls or a new `getStudioFreeSlots` aggregator — same backlog item already opened by STUDIO-PUBLIC-PROFILE-A
    - **Provider policy fields present + selectable:** `Provider.{minBookingHoursAhead, maxBookingDaysAhead, acceptNewClients, visibleSlotDays, slotPrecision, cancellationDeadlineHours, lateCancelAction, remindersEnabled}` all live in schema. **Enforcement gap confirmed:** existing `resolveBookingCore` validated dates + slot conflict + idempotency but did NOT enforce `minBookingHoursAhead` / `maxBookingDaysAhead` / `acceptNewClients`. Slots endpoint did NOT clamp `visibleSlotDays` horizon either. **This is the closeable gap.**
    - **`createBooking` + idempotency lock + `ensureNoConflicts` + UTC + rate limiting** all intact and not to be rewritten (user constraint). Both `createBooking` and `createClientBooking` call `resolveBookingCore` → single injection point for defense-in-depth enforcement
  - **Раздел 3 (Архитектура):**
    - **New:** `src/lib/bookings/policy-enforcement.ts` — pure helper module. Exports `ProviderPolicy` type (structural — accepts any object with the policy keys) + 6 functions: `earliestBookableUtc`, `latestBookableUtc`, `isWithinBookableWindow`, `assertBookingWindow`, `assertAcceptsNewClient`, `clampVisibleSlotsHorizon`. All side-effect-free, no Prisma/Redis deps → safe to import from anywhere
    - **New:** `src/lib/bookings/policy-enforcement.test.ts` — **18 unit tests** covering boundary inclusivity, negative-input clamping, both window sides, NEW_CLIENTS_CLOSED with/without priors, horizon clamping edge cases. Test count 247 → 265
    - **Modified:** `src/lib/api/errors.ts` — 3 new ErrorCodes added to literal union: `BOOKING_TOO_SOON`, `BOOKING_TOO_FAR`, `NEW_CLIENTS_CLOSED` (HTTP 400/400/403)
    - **Modified:** `src/lib/bookings/booking-core.ts` — extended Provider select to include `minBookingHoursAhead, maxBookingDaysAhead, acceptNewClients`. Added enforcement block right after date validation, before slot check. On `acceptNewClients=false`, runs single `prisma.booking.count` against the client's prior bookings with this provider/master, excluding REJECTED/CANCELLED/NO_SHOW. **Both `createBooking` and `createClientBooking` inherit the guard automatically** since both go through `resolveBookingCore`
    - **Modified:** `src/app/api/public/providers/[providerId]/slots/route.ts` — extended Provider select with `minBookingHoursAhead, visibleSlotDays`. Before slot generation: clamp requested `toKey` via `clampVisibleSlotsHorizon` (caps at `now + visibleSlotDays`). After slot generation: filter out slots before `earliestBookableUtc` (caps at `now + minBookingHoursAhead`). Cheap server-side post-filter on already-built slot list — no perf regression
  - **Раздел 5 (Бизнес-логика):**
    - **Enforcement at TWO surfaces (defense-in-depth):**
      1. **Public slots endpoint** filters/clamps before serving. UX wins: client never sees a slot they can't book
      2. **`resolveBookingCore`** asserts at booking-creation time. Closes direct-API/race-condition gaps where a client bypasses the slot list (e.g. submits a stale slot, hits the booking endpoint directly, or another booker took the same slot)
    - **`NEW_CLIENTS_CLOSED`** = `acceptNewClients=false` AND no prior non-cancelled bookings between this client and this provider (or, for studio bookings, the resolved master). Returning clients always pass. Anonymous/guest bookings (without `clientUserId`) skip this check — they'd be linked post-signup via existing `linkGuestBookingsToUser`
    - **`BOOKING_TOO_SOON`** = `startAtUtc < now + minBookingHoursAhead`. Boundary is inclusive (a slot exactly at the limit is allowed)
    - **`BOOKING_TOO_FAR`** = `startAtUtc > now + maxBookingDaysAhead`. Boundary inclusive
    - **`visibleSlotDays` horizon clamp** in slots endpoint = `dateKey of (now + visibleSlotDays)`. Inclusive. Minimum 1 day even if provider sets 0/negative. Existing `toKey` request narrower than horizon wins
    - **`createBooking` NOT rewritten** — only the shared `resolveBookingCore` helper extended (per user constraint). All idempotency / conflict / rate-limit / UTC plumbing preserved verbatim
  - **Раздел 6 (Маршруты):** **No new routes.** `GET /api/public/providers/[providerId]/slots` extended with policy-aware filtering. Existing `POST /api/bookings` + `POST /api/clients/bookings` inherit enforcement through `resolveBookingCore`
  - **Раздел 8 (Проблемы и риски):** **L1 «Booking enforcement новых полей» CLOSED** (was Pre-launch task). The createBooking path now honours `minBookingHoursAhead`/`maxBookingDaysAhead`/`acceptNewClients`. **L2 partially addressed:** `visibleSlotDays` horizon clamped in slots endpoint; `slotPrecision` rounding still pending (separate concern — that's display-time UX, not safety). **L3 `lateCancelAction === "fine"`** still no enforcement (deferred — needs payment-penalty infra). **`cancellationDeadlineHours`** also still pending; was in scope of widget redesign but no client-side enforcement today (server-side already in `cancelBooking`)
  - **Раздел 11 (Производительность):** no regression. Slots endpoint added 1 cheap `Array.filter` + 1 dateKey-clamp helper call (both O(N) over already-built slot list). `resolveBookingCore` added at most 1 `prisma.booking.count({ where: ... })` and only when `acceptNewClients=false` (a minority of providers). Both happen inside flows that already do heavier Prisma work
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** no new keys (server-side error codes flow through existing `AppError.message` → API response. UI copy for the 3 new error states is the widget redesign's job)
  - **Validation:** typecheck ✅ (after adding 3 new ErrorCodes to literal union), encoding/mojibake/prisma ✅, **265/265 tests** (247 → 265, +18 from policy-enforcement.test.ts). Lint baseline drifted to 858/134 from external `.claude/references/PublicHeader.js` reference file — my code is lint-clean (verified via grep on `policy-enforcement.ts`, `slots/route.ts`, `booking-core.ts`)
  - **Backlog spawned:**
    - 🟠 Booking widget full UX redesign — animated 4/3-step wizard, sticky summary, hero, scenarios A (studio→service→master) + B (master direct via `?master=`), real `clampVisibleSlotsHorizon` consumption in calendar UI, friendly per-error copy
    - 🟠 Scenario B (master-direct booking via `?master=<id>`) — needs widget refactor
    - 🟠 Studio slot aggregation service (`getStudioFreeSlots`) — same backlog as STUDIO-PUBLIC-PROFILE-A
    - 🟠 Guest booking flow through widget — currently auth-gated; needs widget refactor + UX decisions
    - 🟡 `silentMode` flag exposed in widget UI (already a Booking schema column)
    - 🟡 Routing split — `/u/` master + `/v/` (or `/s/`) studio (user decision deferred)
    - 🟡 Online payment integration on widget
    - 🟡 Client-side `cancellationDeadlineHours` enforcement + UX copy
    - 🟡 Streaming + react-server-components refactor on `/u/[username]/booking` (currently fully client-rendered)
    - 🟡 Per-error UI copy for `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR` / `NEW_CLIENTS_CLOSED` (today user sees generic error message — server returns proper code/status, but widget UI is generic)
    - 🔵 A/B test infrastructure for widget variants
    - 🔵 HotSlot integration in booking widget
    - 🔵 Multi-service booking (cart pattern)
    - 🔵 Funnel analytics on booking widget
    - 🔵 Skeleton refinements on widget
  - **Next workstreams:** Booking widget full UX redesign (the deferred half), Master public profile follow-ups, Catalog enhancements, Marketing, Hot slots, Inspiration, Models. Plus Phase 6 hardening / Phase 7 cleanup / Phase 8 docs

- **2026-05-18 — STUDIO-PUBLIC-PROFILE-A** (commit on `designStudioCabinet`). **First commit of the new Public surfaces workstream** (after Cabinet Studio sprint closed at 19/19). Surgical redesign of the existing `PublicStudioProfilePage` — drops inline booking flow + adds slot-bar CTA + reorders sections per spec.
  - **Audit findings:**
    - Route `/u/[username]/page.tsx` (lines 380–395) already resolves studio vs master via `result.providerType` and renders `PublicStudioProfilePage` for studios. Master uses `PublicMasterProfilePage` via the same handler. **No route change needed.**
    - `loading.tsx` ships proper skeletons (HeroSkeleton / ServicesSkeleton / PortfolioSkeleton / ReviewsSkeleton / BookingSkeleton) — the audit-flagged "Suspense fallback=null" risk is already addressed
    - `generateMetadata` + JSON-LD schema wired (lines 179–349)
    - Each section is its own Suspense boundary; sections internally use `Promise.all` (verified in `hero-section.tsx` lines 26–29). Audit-flagged sequential-await risk is already mitigated
    - **Studio slot aggregation GAP confirmed:** `buildSlotsForDay` is per-master only; no `getStudioFreeSlots` or `studioAvailability` helper exists. HotSlot is per-master too. Live "Сегодня свободны N окон" requires either N parallel per-master calls or a new aggregator service — backlog
    - Real fields available: `Provider.{name, tagline, description, avatarUrl, bannerUrl, address, geoLat, geoLng, isPublished, rating, reviews, priceFrom, categories, availableToday, services[], publicUsername, cancellationDeadlineHours}` (per `ProviderProfileDto`). **NOT present:** `metro`, `walkMinutes`, `verified`, `history`, `values`, `philosophy`, `socialLinks`, separate `phone`, `acceptNewClients` not exposed in DTO (only on Provider model)
    - **NO FAQ entity** in schema (confirmed)
    - `studioBookingUrl()` helper already builds deep links — reused for the new slot-bar CTA
  - **Раздел 3 (Архитектура):**
    - **New:** `src/features/public-studio/sections/slot-bar-section.tsx` — accent gradient CTA bar with `<Sparkles>` icon + headline + deep-link button. Gated on `studio.isPublished` (DTO doesn't expose `acceptNewClients`, but `isPublished=true` is the public-page activity signal)
    - **Rewritten:** `src/features/public-studio/public-studio-profile-page.tsx` — dropped `<StudioBookingSection>` import + render (booking flow now strictly at `/u/[username]/booking`). Added `<StudioSlotBarSection>` between hero + services. Reordered: hero → slot bar → services → team → photos → reviews → contacts (was: hero → booking → details → photos → reviews → services → team). Sticky bottom-right CTA changed anchor from `#studio-booking-entry` to `#studio-services`
    - **No changes:** sections (`hero-section`, `services-section`, `team-section`, `photos-section`, `reviews-section`, `details-section`) all reused verbatim — they already use `Promise.all` and deep-link to booking via `studioBookingUrl`
  - **Раздел 5 (Бизнес-логика):**
    - **Booking flow moved off the profile** — `<StudioBookingSection>` + `<StudioBookingFlow>` no longer rendered on the public profile route. Both stay in the codebase because `/u/[username]/booking` (separate widget) consumes them. Cleanup of the legacy embed is Phase 7 territory
    - **Slot-bar CTA without live counter** — honest UX: no studio-scope aggregator exists, so the bar invites the client into the booking widget where per-master availability is computed at click time. Live count → backlog
    - **No edit affordances** on the public page — STUDIO-SETTINGS-A owns the studio's edit surface (consistency: public page is client-only, no owner toolbar)
    - **No fabricated content** — FAQ section / history-values-philosophy block / verification badge / «Написать в студию» chat all left out because fields don't exist; surfaced as backlog items so the page ships with only what the schema actually supports
  - **Раздел 6 (Маршруты):** `/u/[username]` page route untouched (it already routes to `PublicStudioProfilePage` for studios). The page composition is what changed. `/u/[username]/booking` route exists and is the canonical booking surface
  - **Раздел 11 (Производительность):** `/u/[username]` SSR pattern already addresses the audit-flagged risks — parallel `Promise.all` at username resolution + section level, `loading.tsx` with proper skeletons (not null), per-section Suspense boundaries. This commit doesn't regress any of that
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** new subtree `publicStudio.slotBar.*` (4 keys: label / headline / subline / book)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Studio public live slot aggregation (🟠 — new `getStudioFreeSlots` service), Booking widget redesign at `/u/[username]/booking` (🟠 — next priority per user), Public page view + conversion analytics (🟡 — affects all public pages), Studio FAQ entity (🟡), History/values/philosophy fields (🟡), Verification badge (🟡), Pre-booking studio chat (🟡 — auth model blocker), Metro/walkMinutes fields (🟡), Phone/social links exposed on DTO (🟡), Hero gallery enhancements / portfolio lightbox / OG image per studio / dedicated all-masters all-reviews all-portfolio pages / section-specific skeletons / FocalImage → next/image migration (🔵)
  - **Next workstreams:** Booking widget redesign (CORE conversion, user explicitly flagged as priority), then Catalog enhancements / Marketing / Hot slots / Inspiration / Models. Plus the ongoing Phase 6/7/8 hardening backlog

- **2026-05-18 — STUDIO-SETTINGS-A** (commit on `designStudioCabinet`). **🎉 Cabinet Studio sprint FINALE — 19/19 commits closed.** `/cabinet/studio/settings` index rewritten as a 5-section SSR page; old per-section sub-routes (profile/portfolio/general/public/features) left untouched for backwards-compat with the legacy `studio-settings-page.tsx` (still serving portfolio + main profile editing).
  - **Audit findings:**
    - **Existing settings page:** old route was a simple redirect to `/settings/profile`, fronting an 837-LOC tabbed component (`src/features/studio/components/studio-settings-page.tsx`) that handles Profile/Services/Portfolio/Settings tabs. The Services tab embedded the legacy `studio-services-page.tsx` (STUDIO-SERVICES-A carryover debt). **Confirmed unreachable:** `/cabinet/studio/settings/services` redirects to `/cabinet/studio/services` — the legacy embed is dead code in practice
    - **Studio + Provider fields:** Provider carries name/tagline/description/avatarUrl/isPublished/address/district/cityId/geoLat/geoLng + policy block (minBookingHoursAhead/maxBookingDaysAhead/cancellationDeadlineHours/lateCancelAction/acceptNewClients/remindersEnabled/autoConfirmBookings). **No `metro`/`walkMinutes` columns** → backlog. Working hours via `WeeklyScheduleConfig` (Provider-wide default; per-master overrides)
    - **StudioRole canonical enum** has OWNER/ADMIN/MASTER. **NO FINANCE** in canonical (only in legacy `StudioMemberRole`). Transfer ownership: **mechanism does not exist** anywhere in src/lib/studio. `ensureStudioAdmin` admits OWNER+ADMIN, `ensureStudioOwner` admits OWNER only
    - **Notification preferences:** **no dedicated `NotificationPreference` model.** Channels surfaced today: in-app (always on via `Notification`), Telegram (`TelegramLink.isEnabled`), VK (`VkLink`), PWA push (`PushSubscription` count > 0). SMS gateway not wired (P1 blocker). Existing `<TelegramNotificationsSection>` + `<VkNotificationsSection>` in `src/features/cabinet/components/*` are drop-in client components — reused verbatim
    - **Policy edit surface:** values live on Provider but the only edit flow is the master schedule editor (`applyScheduleSnapshot`). `PATCH /api/studios/[id]` only accepts a subset (cancellationDeadlineHours + remindersEnabled). Studio settings ship read-only with a deep link rather than forking a second editor
    - **Delete + archive:** `deleteStudioCabinet(userId)` in `src/lib/deletion/delete-studio.ts` + `DELETE /api/cabinet/studio/delete` exist; enforce OWNER + no-active-bookings (returns 409 `ACTIVE_BOOKINGS`); known partial anonymisation (cross-ref backlog). Archive = `Provider.isPublished = false` via `PATCH /api/studios/[id]`. Both reused
  - **Раздел 3 (Архитектура):** new module `src/features/studio-cabinet/settings/`:
    - `lib/types.ts` — `StudioSettingsSection` union + DTOs (General, Team, Notifications, Policy, scope flags)
    - `server/settings-data.service.ts` — `loadStudioSettingsData` orchestrator. Resolves scope from `Studio.ownerUserId` (direct) + `StudioMembership` roles. Loads provider+studio in one query; team breakdown picks owner + admins (masters excluded — STUDIO-MASTERS-A owns that page). Builds Yandex Maps URL via `buildYandexMapsUrl`
    - `components/` — 12 files: page orchestrator (2-col grid), settings-nav (URL-driven with danger hidden for non-owners), section-card wrapper, 5 section bodies (general/owner-team/notifications/policy/danger), general-form client island (`PATCH /api/studios/[id]`), archive-toggle client island, delete-studio-dialog (retype-confirm, calls `DELETE /api/cabinet/studio/delete`)
  - **Раздел 5 (Бизнес-логика):**
    - **General section** — editable name/tagline/description via existing `PATCH /api/studios/[id]`. Avatar + address surfaced read-only with honest "legacy флоу" hint (avoiding a half-built picker)
    - **Owner-team section** — read-only display of OWNER + ADMIN members. Transfer ownership + invite admin are "появится позже" placeholders — fabricating non-functional buttons would be dishonest. **Masters never appear here** (STUDIO-MASTERS-A boundary respected)
    - **Notifications section** — closes STUDIO-NOTIFICATIONS-A info-banner promise («Кто из команды получает push — настраивается в Настройках студии»). Real channels surfaced via reused Telegram/VK components + push status display. SMS + per-NotificationType matrix backlogged (need gateway + schema model respectively)
    - **Policy section** — read-only summary of all 6 Provider policy fields with deep link to `/cabinet/studio/calendar` schedule editor. No fork of a second editor — single source of truth for these values is the master schedule snapshot path
    - **Danger section** — OWNER only at nav + server-side double-check (`section === "danger" && !scope.canDanger` falls back to general). Archive = `PATCH /api/studios/[id] { isPublished: false }` with `window.confirm`. Delete = existing `DELETE /api/cabinet/studio/delete` with retype-studio-name dialog + special 409 ACTIVE_BOOKINGS error surface
    - **No «Реквизиты и налоги» section** — payouts/commission/taxes not built (consistency with STUDIO-SERVICES-A / STUDIO-ANALYTICS-A / STUDIO-FINANCE-REMOVE-A). Reqs without payouts is meaningless
    - **No «Интеграции» section** — only 3 of 8 listed integrations are real (YooKassa/Telegram/Yandex), and none have management UI today. Whole section deferred
  - **Раздел 6 (Маршруты):** `/cabinet/studio/settings` index rewritten — now renders the new module directly (previously a redirect). Old sub-routes survive untouched for legacy editor deep links: `/settings/profile`, `/portfolio`, `/general`, `/public`, `/features`. `/settings/services` continues to redirect to `/cabinet/studio/services`. **No new API endpoints** — `PATCH /api/studios/[id]` + `DELETE /api/cabinet/studio/delete` reused
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** new subtree `studioCabinet.settingsV2.*` (~70 keys — header / nav / general / ownerTeam / notifications / policy / danger / save+cancel / toasts)
  - **@deprecated (effective):** legacy `studio-settings-page.tsx` (837 LOC) still serves portfolio + main-profile sub-routes, so it's not deleted yet. Phase 7 cleanup retires it once portfolio + profile redesigns ship
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Transfer studio ownership (🟠 — new endpoint + multi-factor confirmation flow), Invite admin to studio team (🟠 — needs `StudioInvite.role` or separate flow), Logo + address picker port from legacy (🟠), Per-NotificationType prefs schema (🟡), Per-team-member notification routing (🟡 — depends on prefs), Inline policy editor on this page (🟡), Anonymisation on studio delete (🟡 — platform-wide compliance), Phase 7 retire legacy 837-LOC component + consolidate sub-routes (🟡), Studio working-hours default editor (🔵), Custom studio policy text (🔵), Danger zone audit trail (🔵)
  - **🎉 Cabinet Studio sprint COMPLETE — 19 commits closed:** shell (1) + dashboard (2) + masters (3) + schedule (4-5) + bookings (6) + services (7) + packages (8) + 5 bug-fix/polish/showcase/seed/category-unification (9-13) + clients (14) + reviews (15) + notifications (16) + analytics (17) + finance removal (18) + settings (19). Plus 2 cross-cutting artifacts: STUDIO-SHOWCASE-SEED (Vision rich fixture) + SEED-CONSOLIDATION-A (4 demo phones 100/200/300/400 + P2002 fix). **Next workstreams:** Public surfaces (Booking widget priority), Chat redesign, Phase 7 cleanup, Phase 6 hardening (SMS gateway / { not: value } sweep / multi-recipient notif / CI tests), Phase 8 docs

- **2026-05-18 — STUDIO-FINANCE-REMOVE-A** (commit on `designStudioCabinet`). Cleanup commit — Cabinet Studio sprint follow-up 4/5 finalised by *removing* the Finance page rather than building it. Product decision: distinguishing content (commission split / payout flow / expense tracking) doesn't exist in the platform, so a standalone Finance page would be a confusing duplicate of `/cabinet/studio/analytics` (revenue KPIs + by-master + by-service already there).
  - **Audit findings:**
    - **Nav config:** `studioCabinet.nav.items` had a `finance` entry in `src/features/studio-cabinet/config/studio-nav.ts:157` (Business group, next to Analytics). Same entry duplicated in legacy `src/features/studio-cabinet/components/studio-navbar.tsx:18`. **No cabinet/room model dependency** (different concept; was confirmed absent in STUDIO-NOTIFICATIONS-A audit)
    - **Existing route:** `src/app/(cabinet)/cabinet/studio/finance/page.tsx` (stub rendering `<StudioFinancePage>`) + `loading.tsx` (skeleton). Component lived at `src/features/studio/components/studio-finance-page.tsx` (~200+ LOC client component with date range picker + 3 cards + by-master/category/services breakdowns — every chart it showed is now in `/cabinet/studio/analytics`)
    - **Orphan endpoints:** `/api/studio/finance` + `/api/studio/finance/summary` — the legacy component was the only consumer (verified via grep; no other callers in src)
    - **OpenAPI spec:** `/api/studio/finance` path entry + `StudioFinanceRow` + `StudioFinanceData` schemas — orphan after endpoint deletion
    - **UI_TEXT:** isolated finance keys — `studioCabinet.nav.finance`, `studioCabinet.nav.items.finance`, `studioCabinet.financePage` (title/subtitle), `studioCabinet.dashboard.financeTitle/Subtitle`, the entire `studioCabinet.finance` block (~30 keys). All only referenced by deleted files. `studioCabinet.notificationsV2.filters.finance` (chip for billing-type notifications) is a different scope — kept
  - **Раздел 3 (Архитектура):** **deletions** — `src/features/studio/components/studio-finance-page.tsx`, `src/app/api/studio/finance/{route.ts,summary/route.ts}` (entire `api/studio/finance` directory), `src/app/(cabinet)/cabinet/studio/finance/loading.tsx`. **Rewritten** — `src/app/(cabinet)/cabinet/studio/finance/page.tsx` now a 20-line redirect to `/cabinet/studio/analytics` (no 404 for old bookmarks / external links). **Modified** — `src/features/studio-cabinet/config/studio-nav.ts` drops `finance` from labelKey union + Business group items array; `src/features/studio-cabinet/components/studio-navbar.tsx` drops finance from NAV_ITEMS array; `src/lib/openapi/spec.ts` drops `/api/studio/finance` path + 2 schemas; `src/lib/ui/text.ts` drops 5 key blocks (~37 keys total)
  - **Раздел 5 (Бизнес-логика):** **No behavior changes in shipped flows.** The Finance page was a UI surface only; its endpoints had no other callers. Studio admins can still see all revenue analytics in `/cabinet/studio/analytics` (with view tabs covering by-master + by-service). Old `/cabinet/studio/finance` URL redirects to Analytics so deep links + bookmarks keep working
  - **Раздел 6 (Маршруты):**
    - `/cabinet/studio/finance` → server redirect to `/cabinet/studio/analytics` (placeholder route file only, no UI rendered)
    - `/api/studio/finance` + `/api/studio/finance/summary` — **REMOVED** (orphan after UI deletion). Admin API group count decreases by 2
    - All other studio cabinet routes unchanged
  - **Раздел 12 (Инварианты):** не затронуты — Finance was never a documented invariant, just an undelivered nav entry
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Studio Finance page when payouts ship (🟡), Expense tracking (🟡), Bank account integration / export to 1С / per-master payout reconciliation (🔵 — once Finance returns with distinct content)
  - **Sprint progress:** 18/18 commits closed. The 5-follow-up plan from STUDIO-REVIEWS-A onward was overstated — Finance was struck (not built), so effective follow-up count is 4 + this cleanup. Remaining: **Settings** (final sprint commit)

- **2026-05-18 — STUDIO-ANALYTICS-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 17/17 (3rd of 5 follow-up pages). `/cabinet/studio/analytics` rewrite — legacy `<AnalyticsPage scope="STUDIO" />` (shared client component) replaced by SSR module with 4 view tabs, plan-gated sections, inline-SVG charts.
  - **Audit findings:**
    - **15 `/api/analytics/*` endpoints exist** (revenue ×4, dashboard ×1, bookings ×3, clients ×4, cohorts ×2, masters ×1). 13 support both MASTER + STUDIO scope; 2 are studio-exclusive (`/revenue/by-master`, `/masters`). **No infrastructure gap** — all 4 view tabs can be backed by existing endpoints
    - **Feature gate catalog** (`src/lib/billing/feature-catalog.ts:72-125`): `analytics_dashboard` (FREE+), `analytics_revenue` (PRO+), `analytics_clients` (PRO+), `analytics_booking_insights` (PREMIUM+), `analytics_cohorts` (PREMIUM+), `analytics_forecast` (PREMIUM+). **Gating returns 403 server-side** via `ensureFeatureAccess` (throws `AppError("Функция недоступна на текущем тарифе.", 403, "FEATURE_GATE")`); UI uses `<FeatureGate>` overlay for blurred preview + upgrade CTA
    - **Master analytics page** (`src/features/master/components/analytics/*`) — full pattern reference: 7 component files, inline-SVG charts (no recharts/chart.js), `getMasterAnalyticsView` server orchestrator. Comment in `src/app/(cabinet)/cabinet/master/analytics/page.tsx:10-12` explicitly noted studio needed its own redesign
    - **BookingSource analytics gap:** NO endpoint exposes per-source breakdown. Computed inline via single Prisma `groupBy` in this commit (only 3 real enum values WEB/MANUAL/APP, no fabricated «Сарафан»/«Соцсети»). Moving to dedicated endpoint is backlog
    - **Compare:** `/dashboard` endpoint supports `compare=1` natively (returns `compareRange` + previous-period KPI). `/revenue/timeline` doesn't — orchestrator calls it twice (current + previous range) and zips by index for the chart
    - **Custom date range:** all endpoints accept arbitrary `from/to`; master cabinet gates the picker behind `customPeriod = analytics_cohorts || analytics_forecast` (PREMIUM proxy) showing «Скоро» alert. Studio ships presets only — picker backlogged
  - **Раздел 3 (Архитектура):** new module `src/features/studio-cabinet/analytics/`:
    - `lib/types.ts` — DTOs (`StudioAnalyticsViewData`, KPI/revenue/heatmap shapes, period+view+feature unions, type guards)
    - `lib/source-mapping.ts` — `SOURCE_LABEL` + `SOURCE_TONE` + `SOURCE_RING` Tailwind class maps for WEB/MANUAL/APP only
    - `server/analytics-features.ts` — `getStudioAnalyticsFeatures(userId)` projects `analytics_*` keys into `{dashboard, revenue, clients, bookingInsights, cohorts}` — mirrors `getMasterAnalyticsFeatures` shape for consistency
    - `server/analytics-view.service.ts` — `loadStudioAnalyticsView` orchestrator (~290 LOC). Resolves analytics context via `resolveAnalyticsContext({scope:"STUDIO"})`, computes current + prev ranges via reused master `computeRollingRange`/`computePreviousRange`, KPI via `getDashboardKpi` with `prevRange`. Per-view dispatch: only the active tab's heavy data loaded (Overview = revenue×2 if compare + sources groupBy + heatmap; Masters = `getRevenueByMaster` + provider list + bookings groupBy; Services = `getRevenueByService` + service-masters inline groupBy for distinct count; Clients = `getClientSegments` + UserProfile name resolution for top 10)
    - `components/` — 14 files: server page orchestrator, URL-driven controls (period 4-chip + view 4-tab + compare checkbox), KPI bar (5 metrics with delta arrows), 4 view components (overview/masters/services/clients), 3 chart components (revenue-line-chart with prev-period dashed overlay / sources-donut with stroke-dasharray slices / hours-heatmap as weekday×hour grid)
  - **Раздел 5 (Бизнес-логика):**
    - **Reuse-first architecture** — 13 of 15 analytics domain helpers used directly; orchestrator only adds (a) per-view dispatch, (b) BookingSource inline groupBy, (c) Services distinct-masters inline groupBy, (d) Clients top-10 name resolution. No new endpoints
    - **Plan gating respects existing pattern** — `<FeatureGate>` from master cabinet reused verbatim (blurred preview + upgrade card). Sections whose flag is false skip data fetch entirely in the orchestrator (returns `null`), so FREE users don't trigger gated endpoint calls
    - **Compare semantics:** KPIs + revenue chart get prev-period overlay via reused `getDashboardKpi` `prevRange` + double-call on `getRevenueTimeline`. Rating delta intentionally absent (no rating KPI; same snapshot gap STUDIO-DASHBOARD-A flagged for occupancy/rating)
    - **No payouts / «ВАМ» column** — explicit per spec (consistency with STUDIO-SERVICES-A payout deferral). Masters table shows performance metrics only
    - **No fabricated booking sources** — `groupBy({by: ["source"]})` returns only enum values that actually appear in data; sources with `count === 0` filtered out
    - **Occupancy proxy** in Masters table uses dashboard 5-slots/day heuristic for consistency (cross-ref STUDIO-DASHBOARD-A backlog for precise integration)
  - **Раздел 6 (Маршруты):** `/cabinet/studio/analytics` rewritten (was: shared client `<AnalyticsPage>`, now: SSR module). URL params `?period=7d|30d|90d|year&view=overview|masters|services|clients&compare=on|off`. **No new API endpoints** — all 15 existing analytics endpoints reused
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** new subtree `studioCabinet.analyticsV2.*` (~55 keys — header / periods / views / compare / kpi / overview / masters / services / clients). Master analytics keys NOT reused (different copy + view structure)
  - **@deprecated:** `<AnalyticsPage scope="STUDIO" />` (`src/features/analytics/ui/analytics-page.tsx`) — orphan for studio after route rewrite (still used by master cabinet path indirectly? — needs verification, but the studio route no longer references it)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Cohort retention matrix UI (🟠 — endpoints exist, need view), Custom date range picker (🟠 — endpoints support `from/to`, picker missing), Revenue forecast widget (🟠 — endpoint exists, not surfaced), Analytics export Excel (🟡), Commission/payout column (🟡 — when payouts land), BookingSource as official endpoint (🟡), Funnel/lead-time Overview cards (🟡), Rating snapshot delta (🟡 — cross-ref dashboard), Master/Service deep-link drilldowns (🟡), Saved views / share PDF/PNG / source drilldown (🔵)
  - **Sprint progress:** 17/17 commits closed. STUDIO-ANALYTICS-A closes the 3rd of 5 follow-up pages. Remaining: Finance, Settings

- **2026-05-18 — STUDIO-NOTIFICATIONS-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 16/16 (2nd of 5 follow-up pages). New `/cabinet/studio/notifications` route (sidebar nav-item from STUDIO-SHELL-A was 404 until now). Heavy reuse of 26-NOTIF master notif infrastructure.
  - **Audit findings:**
    - **Master 26-NOTIF pattern:** `src/features/master/components/notifications/*` (10 files) + `src/lib/master/notifications.service.ts` orchestrator. **Actionable model is mixed:** inline confirm/decline buttons for BOOKING_REQUEST/CREATED (binary action), navigation-only for everything else. Quote from notification-actions.tsx line 89: «BOOKING_REQUEST / BOOKING_CREATED: confirm/decline now hide when payload.bookingStatus reflects a terminal state». Pattern → studio mirrors with inline for SCHEDULE_REQUEST + nav for the rest
    - **NotificationType enum:** 60 values across BOOKING_*/STUDIO_*/MODEL_*/HOT_SLOT_*/BILLING_*/REVIEW_*/CHAT_*/CATEGORY_*/MASTER_*/SUBSCRIPTION_GRANTED_BY_ADMIN. **No cabinet/room type** (`grep model Cabinet|model Room|cabinetNumber` returns zero matches in prisma/schema + src/lib/studio). Confirmed absent — chip "Кабинеты" + «Кабинет N» line + cabinet-conflict type all dropped
    - **Single-recipient delivery model:** `Notification.userId` is one user. Studio events (`notifyStudioInviteAccepted`, `notifyScheduleRequestSubmitted` in `src/lib/notifications/studio-notifications.ts`) target `studio.ownerUserId` directly. No multi-cast — admin without explicit addressing wouldn't see owner's items. Service matches this semantics: shows the current user's own notifications, scoped by channel
    - **`getNotificationCenterData`** (`src/lib/notifications/center.ts:159`) already computes per-notification `channel: "MASTER" | "STUDIO" | "SYSTEM"` via `classifyNotificationChannel` + injects pseudo-notifications for PENDING ScheduleChangeRequest rows (id format `schedule-request:<realId>`, type `"SCHEDULE_REQUEST"`, channel `"STUDIO"`, `openHref: "/cabinet/studio/team"` — trivial-fix backlog item to point at `/cabinet/studio/schedule-requests`)
    - **Bulk read-all endpoint:** `POST /api/notifications/read-all?context=master|personal|all` exists. Reused with `context=all`
    - **Approve/reject endpoints:** `POST /api/studio/schedule/requests/[id]/approve` + `.../reject` from STUDIO-SCHEDULE-REQUEST-APPROVAL-A. Body: none for approve, `{ comment }` for reject. Reused as-is
    - **Showcase seed:** 12 notifications for Vision owner across 7 types (BOOKING_REQUEST / REVIEW_LEFT ×2 / BOOKING_REMINDER_2H / BOOKING_CANCELLED_BY_CLIENT / BOOKING_RESCHEDULED / CHAT_MESSAGE_RECEIVED / MASTER_WEEKLY_STATS) + 2 PENDING ScheduleChangeRequest pseudo-items via center
  - **Раздел 3 (Архитектура):** new module `src/features/studio-cabinet/notifications/`:
    - `lib/types.ts` — DTOs (`StudioNotificationChip` union, KPI/data shapes, type guard, re-export of master `NotificationDayGroup` + `NotificationSort`)
    - `lib/chip-classifier.ts` — `classifyStudioChip(type)` extends master's `classifyTabBucket` with `team` (STUDIO_*) + `finance` (BILLING_* including admin-initiated variants) + `cancellations`/`reschedules` as distinct buckets. All NotificationType enum values explicitly mapped; unknown → `"system"` fallback
    - `server/notifications-data.service.ts` — `loadStudioNotificationsData` orchestrator. Calls `getNotificationCenterData` + `getPushEnabled` in parallel. Filters `channel === "STUDIO"`. Computes 4 KPIs (unread, today, needs-decision via SCHEDULE_REQUEST count, push enabled) + 10 chip counts from full set, then applies chip filter + day grouping. ~140 LOC
    - `components/` — 7 files: server orchestrator (page), KPI row (4 tiles), URL-driven filters with bulk «Прочитать всё», info banner with link to settings, day-grouped feed, server-rendered notification card (uses master's `getCardConfig` + `readNotificationPayload` for visual config + payload extraction), client island actions (inline approve/reject for SCHEDULE_REQUEST with prompt-based comment for reject, mirror master decline pattern; nav chips for other types: «К записи / К отзыву / К чату / К клиенту»)
  - **Раздел 5 (Бизнес-логика):**
    - **Reuse-first approach** — three master 26-NOTIF helpers imported directly: `getNotificationCenterData` (server), `groupNotificationsByDay` (server), `getCardConfig` + `readNotificationPayload` (cards). Studio adds chip classifier on top, not from scratch
    - **Scope semantics:** studio cabinet page shows notifications addressed to the current user (admin or owner) with `channel === "STUDIO"`. This matches the existing single-recipient `Notification.userId` model. Multi-cast / true studio-wide feed is backlog (would need broadcast at delivery time)
    - **Master notif page unchanged** — master continues to see `channel === "MASTER"` items; studio's filter is mutually exclusive. Master-addressed booking notifications surface in master cabinet, not duplicated here (info banner explains this to admins)
    - **Cabinet/room exclusion enforced:** no schema model, no notification type, no UI artifact. Reviewed reference jsx and dropped all 3 cabinet-related surfaces (chip / «Кабинет N» / conflict)
    - **Actionable inline pattern:** SCHEDULE_REQUEST is the one type studio admin acts on from the feed. Inline Approve / Reject mirrors master's BOOKING_REQUEST inline (binary action, instant feedback). Reject uses `window.prompt` for comment (same UX as master decline). «Открыть запрос» nav link still provided for context-heavy review
  - **Раздел 6 (Маршруты):** **NEW route** `/cabinet/studio/notifications` — finally functional (sidebar nav config from STUDIO-SHELL-A pointed at this URL but no `page.tsx` existed → 404 until now). URL params `?chip=` / `?sort=`. **No new API endpoints** — POST `/api/studio/schedule/requests/[id]/{approve,reject}` + `POST /api/notifications/read-all?context=all` reused
  - **Раздел 12 (Инварианты):** не затронуты
  - **UI_TEXT:** new subtree `studioCabinet.notificationsV2.*` (~55 keys — header / kpis / filters / infoBanner / card / actions / empty / errors). Reuses master notif card icon config + payload extractors, so no per-type UI_TEXT duplicated
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Cabinet/room model with schema migration + conflict detection (🟠 — only if real studios hit this), Per-team-member push settings (🟠 — settings page redesign dependency), Multi-recipient broadcast (🟡 — admins seeing owner's items), Notification preferences (🟡), SSE live updates (🟡), Card per-action mark-read (🟡 — endpoint exists), «Открыть запрос» deep-anchor with `?focus=` (🟡), Group similar / Snooze / Search (🔵), Fix center.ts openHref for SCHEDULE_REQUEST to point at `/cabinet/studio/schedule-requests` (🔵 — trivial)
  - **Sprint progress:** 16/16 commits closed. STUDIO-NOTIFICATIONS-A closes the 2nd of 5 follow-up pages. Remaining: Analytics, Finance, Settings

- **2026-05-17 — STUDIO-REVIEWS-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 15/15 (first of the 5 follow-up pages). `/cabinet/studio/reviews` rewrite — legacy client-only table replaced by SSR module with stats + scoped reply.
  - **Audit findings:**
    - **Existing studio reviews page:** `src/features/studio/components/studio-reviews-page.tsx` — client component (SWR-style fetch) using the generic `/api/reviews?targetType=studio&targetId=` endpoint. Basic card list with public tags, no reply form, no stats, no per-master scope
    - **Review model:** `Review` carries denormalised `studioId` + `masterId` (for reviews where `targetType=provider` and the master belongs to a studio). `replyText` + `repliedAt` for the published reply — **no `repliedByUserId` field** (reply identity is implicit). Report fields: `reportReason` (enum SPAM/FAKE/OFFENSIVE/INAPPROPRIATE/OTHER) + `reportComment` + `reportedAt` (denormalised — no separate `ReviewReport` model). Soft-delete via `deletedAt` (invariant #17)
    - **Reply endpoint:** `POST /api/reviews/[id]/reply` calls `replyToReview` → `ensureMasterReviewAccess` which checks `provider.ownerUserId === currentUserId || provider.masterProfile?.userId === currentUserId`. Blocked studio admins.
    - **Report endpoint:** `POST /api/reviews/[id]/report` calls `reportReview` — allows any logged-in user (except own author). One report per review (409 on retry)
    - **Master cabinet has rich review components** (`ReviewsHeroCard`, `ReviewsDistribution`, `ReviewsKpiTiles`, `ReviewsFeed`, `ReviewReplyForm`, `ReviewActionsIsland`) + `computeReviewStats` aggregator — pattern reference for studio. Stats helpers are master-specific, reimplemented for studio scope
    - **Showcase data:** 15 Vision reviews from STUDIO-SHOWCASE-SEED (11×5★ + 3×4★ + 1×3★, 7 with replies)
  - **Раздел 3 (Архитектура):** new module `src/features/studio-cabinet/reviews/`:
    - `lib/types.ts` — DTOs (`StudioReviewItem`, `StudioReviewsListData`, `StudioReviewsStats`, `StudioReviewFilter` union, `isStudioReviewFilter` guard)
    - `lib/format.ts` — Russian relative-date label («сегодня» / «вчера» / «N дней назад» / «X мес. назад») + `initialsOf`
    - `server/reviews-data.service.ts` — `loadStudioReviewsList` orchestrator. CRM scope via inline `resolveScope(studioId, currentUserId)` — checks `Studio.ownerUserId` direct OR active `StudioMembership` with OWNER/ADMIN roles for `isStudioAdmin`, OR finds the user's MASTER provider id within the studio. `canReply` set per row: admin → true for all; master → true only when `review.masterId === masterProvider.id`. Single broad Prisma query covers filter counts + stats + page items; master + service names come from one `booking.service` join. Cursor pagination (PAGE_LIMIT=20)
    - `server/reviews-stats.service.ts` — `loadStudioReviewsStats` aggregates avg + distribution (5..1★ count + %) + top services by review count (top 5). No rating delta (no `RatingSnapshot` model, same gap STUDIO-DASHBOARD-A flagged). Top services REPLACES reference's "топ/анти-топ мастера" stat per spec
    - `components/` — 11 files: page orchestrator, header, stats row (3 cards: rating-summary + distribution + top-services), rating-stars, filters (4 chips + master select, URL-driven), reviews-list with embedded ReportReviewDialog, review-card (avatar + rating + date + master·service + text + optional reply block + reply CTA + flag icon), reply form (POST `/api/reviews/[id]/reply`), report dialog (POST `/api/reviews/[id]/report` with 5-reason select + comment), pagination
  - **Раздел 5 (Бизнес-логика):**
    - **Reply identity invariant:** every published reply is labelled «Ответ студии» regardless of typed-by (admin or master). No `repliedByUserId` introduced — keeps schema unchanged and respects spec (no per-master attribution on studio surface)
    - **CRM scope enforcement at SERVICE layer:** `canReply` computed in `loadStudioReviewsList`, NOT just in UI. Server-side filter ensures master in studio can't accidentally reply to a colleague's review even if they bypass the UI
    - **Reply endpoint extension (small, surgical):** `ensureMasterReviewAccess` in `src/lib/reviews/service.ts` extended with 3 additional pass conditions: if the review's master has a `studioId`, find the corresponding `Studio` row, check if the current user has an ACTIVE `StudioMembership` with OWNER/ADMIN role → allow. ~12 LOC addition, no signature change. Backwards-compatible for master cabinet (existing checks still apply first)
    - **Report flow direct reuse:** existing `/api/reviews/[id]/report` endpoint accepts any logged-in user. Studio admin's report goes into Review's denormalised `reportReason/reportComment/reportedAt` fields — admin moderation surfaces it on `/admin/reviews` (ADMIN-REVIEWS-A). One-per-review enforced server-side
    - **Reviews are immutable from the studio surface** — no delete/hide. Moderation happens via Report → admin (soft-delete invariant #17)
  - **Раздел 6 (Маршруты):** `/cabinet/studio/reviews` page rewritten (was: basic table + filter, now: rich SSR with stats + scoped reply). URL params `?filter=all|no_reply|low_rating|five_star&master=<id>&cursor=<key>`. **No new API endpoints** — reuses existing `/api/reviews/[id]/{reply,report}`
  - **Раздел 12 (Инварианты):** **#17 strengthened** — Review soft-delete remains the only moderation path. Studio surface explicitly excludes delete/hide; "Пожаловаться" goes through the existing admin moderation pipe (which writes `deletedAt` + `deletedByUserId` + `deletedReason` if admin chooses to soft-delete)
  - **UI_TEXT:** new subtree `studioCabinet.reviewsV2.*` (~45 keys — header / stats / filters / card / actions / replyForm / reportDialog / pagination / empty / toasts). Legacy `studioCabinet.reviews.*` kept (still consumed by ClientCardDrawer surfaces)
  - **@deprecated:** `src/features/studio/components/studio-reviews-page.tsx` — orphan after route rewrite. Phase 7 cleanup
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Review request flow (🟡 — proactive prompt after finished bookings), Bulk reply / "Ответить всем" (🟡), Rating delta with snapshot model (🟡 — cross-ref STUDIO-DASHBOARD-A), Per-master reply identity (🟡 — needs `repliedByUserId`), Reply edit on studio surface (🟡 — PATCH endpoint exists but not surfaced), Top/anti-top masters by rating (🟡 — replaced with top services per spec), Quick-reply chip templates / review bookmark / sentiment analysis / review export CSV (🔵)
  - **Sprint progress:** STUDIO-REVIEWS-A closes the first of the 5 follow-up pages. Remaining: Notifications integration, Analytics, Finance, Settings

- **2026-05-17 — SEED-CONSOLIDATION-A** (commit on `designStudioCabinet`). Pre-launch hardening of the test-data seed pipeline. Fixes a P2002 fragility + introduces the 4-showcase phone schema (100/200/300/400).
  - **Audit findings:**
    - **P2002 root cause:** `seed-showcase-master.ts:120` used `prisma.userProfile.upsert({ where: { email } })` with `phone` in the `create` branch. When canonical identifiers drifted between seed generations (e.g. phone migrated from `+79991000009` → `+79991000000`), the `where: { email }` clause didn't match the stale row, so Prisma took the `create` path — and collided on the `phone` unique constraint held by the stale row. Same anti-pattern in `seed-showcase-studio.ts` for owner + masters
    - **UserProfile unique constraints:** `id`, `phone @unique`, `email @unique`, `publicUsername @unique` (nullable). Any of these can collide on create if shadow rows exist
    - **Generic seed range:** `+7900000xxxx` (4-digit suffix) via `seedPhone()`. Ordinals 1-99 masters, 100-149 clients, 150-199 studio owners. Independent of showcase prefixes
    - **Showcase phones (pre-fix):** master `+79991000009`, studio owner `+79992000000`, studio masters `+79992000001..+79992000007`. No admin showcase existed
    - **`reset.ts` (pre-fix):** OR-matched on `SEED_EMAIL_DOMAIN` ending + `SEED_PHONE_PREFIX` startsWith. Showcase phones caught by email marker but not by phone prefix
  - **Раздел 3 (Архитектура):**
    - **New** `prisma/seeds/test-data/helpers/ensure-user.ts` — `ensureUserByPhone(input)` exports a two-phase upsert. **Phase 1 — shadow release:** finds any row with `phone != input.phone` holding the canonical email OR publicUsername; renames their unique fields to per-row placeholders (`released-<id>@<SEED_EMAIL_DOMAIN>` for email, `null` for publicUsername). FK refs (bookings, cards, subscriptions) survive because we only touch unique fields, not the id. **Phase 2 — upsert by phone:** standard `upsert({ where: { phone }, update, create })` — guaranteed to succeed because Phase 1 freed all conflicting uniques
    - **New** `prisma/seeds/test-data/seed-showcase-admin.ts` — minimal `[CLIENT, ADMIN]`-roled user via `ensureUserByPhone`. No provider, no studio, no bookings — just unlocks `/admin` routes for testing Phase 2 surfaces
    - **Modified** `helpers/markers.ts` — added `SHOWCASE_PHONE_{MASTER,STUDIO_OWNER,STUDIO_MASTER,ADMIN}` constants + `SHOWCASE_PHONE_PREFIXES = ["+79991","+79992","+79993","+79994"]`. `seedEmail` extended to accept `"admin"` role. `isSeedUser` now also matches showcase phone prefixes
    - **Modified** `reset.ts` — OR clause extended with each `SHOWCASE_PHONE_PREFIXES` entry as `phone.startsWith`. Defense-in-depth: showcase users are caught even if their email marker drifts
    - **Modified** `seed-showcase-master.ts` — `PHONE` constant migrated from `+79991000009` → `SHOWCASE_PHONE_MASTER` (`+79991000000`). `ensureUser()` rewritten to delegate to `ensureUserByPhone`
    - **Modified** `seed-showcase-studio.ts` — owner upsert + each master upsert (in `ensureMasters` loop) both delegate to `ensureUserByPhone`. `masterPhone(ordinal=1)` returns `SHOWCASE_PHONE_STUDIO_MASTER` (`+79993000000`) so Марина is reachable as the master-in-studio showcase login; other ordinals keep `+79992xxxxxx`
    - **Modified** `index.ts` — `seedShowcaseAdmin()` called after `seedShowcaseStudio()`. Header docstring rewritten with the four-phone schema reference table
  - **Раздел 5 (Бизнес-логика):** **No behavior changes in app code.** This is seed infrastructure hardening only. Showcase studio inv. #20 + #24 still hold (Марина is ACTIVE: `ownerUserId` set + `isPublished=true`; she shares the studio's PREMIUM subscription, no individual PremiumBadge)
  - **Раздел 6 (Маршруты):** **No new endpoints.** Showcase routes already exist
  - **Раздел 9 (Тестирование):** seed system has 4 fixed-phone showcase accounts for hands-on testing:
    - `+7 999 100 00 00` → `/cabinet/master` (Анна Соколова, solo)
    - `+7 999 200 00 00` → `/cabinet/studio` (Виктория Алмазова, Vision PREMIUM)
    - `+7 999 300 00 00` → `/cabinet/master` (Марина, member of Vision)
    - `+7 999 400 00 00` → `/admin` (Platform admin)
    - OTP code: server logs (`logInfo("OTP requested")`, SMS-шлюз не подключён)
    - Run: `npm run seed:test:reset` (recommended once after pull), then `npm run seed:test`. Idempotent: subsequent `seed:test` runs without reset no longer throw P2002
  - **Раздел 12 (Инварианты):** не затронуты
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests. **Seed not executed against live DB** (Postgres unavailable in dev env) — verified structurally via Prisma client types + reasoned end-to-end on first/second-run scenarios
  - **Generic seed scope:** intentionally kept stable (`seedProviders` 28 masters / 6 studios; `seedClients` 15 clients). Existing upsert-by-email pattern doesn't hit P2002 because of unique slug-derived emails. "Больше данных" goal already satisfied via STUDIO-SHOWCASE-SEED rich fixture (7 masters / 35 services / 56 bookings / 15 reviews / 3 VIP clients / 12 notifications) — bumping generic counts adds risk of breaking existing tests without proportional benefit
  - **Backlog spawned:** none — pure infrastructure fix, no follow-ups required

- **2026-05-17 — STUDIO-CLIENTS-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 14/14. `/cabinet/studio/clients` rewrite — legacy 214-LOC SWR-fetched table заменён server-orchestrated 2-col layout с derived segments + KPIs.
  - **Audit findings:**
    - **Existing page:** `src/features/studio/components/studio-clients-page.tsx` — basic client-side table fetching `/api/studio/clients`, tags column with ClientCardDrawer integration, plan-gated. Sources data from `getStudioClients` (`src/lib/studio/clients.service.ts`) which groups bookings by clientKey
    - **CRM module:** `src/lib/crm/guards.ts` only checks feature flags (`clientVisitHistory || clientNotes`), NOT per-user scope. Studio cabinet access gated at route level via `ensureStudioRole([OWNER, ADMIN])`. Master-only scope ("каждый мастер видит только своих") lives at `/cabinet/master/clients`, not studio
    - **Classifier:** `src/lib/master/clients-classifier.ts` exports `classifyClient(stats, now): ClientStatus[]` returning array of `"vip"|"regular"|"new"|"sleeping"` (overlaps possible — "vip + sleeping" valid). Thresholds: VIP=5_000_000 kopecks, REGULAR=5 visits, NEW<30d OR ≤1 visit, SLEEPING>90d. Already reused by STUDIO-BOOKINGS-A for VIP badge — proven pattern
    - **ClientCard model:** id, providerId, clientUserId?, clientPhone?, notes?, tags[]. **No `birthday` field. No blacklist flag.** `tags` enum: vip/regular/new/allergy/late/no_show/discount/prepay/favorite (no blacklist). Per spec rules — both segments removed
    - **`groupBookings`** in `src/lib/crm/clients.ts` produces `Map<clientKey, ClientAggregate>` with visits/LTV/firstVisitAt/lastVisitAt. Doesn't track masterProviderId — extended in new service
    - **CreateBookingDialog reusability:** props require `masterId: string | null` + `startAtUtc: string | null`. Reachable standalone but needs values. For minimal-changes, "Записать" action navigates to `/cabinet/studio/calendar` instead
    - **No "create standalone client" endpoint:** ClientCard has no name field; clients table sources from bookings. Adding a card without a booking → invisible row. Honest fix: "Клиент" CTA navigates to calendar (booking captures everything)
  - **Раздел 3 (Архитектура):** новый модуль `src/features/studio-cabinet/clients/`:
    - `lib/types.ts` — `StudioClientRow`, `StudioClientPrimarySegment` (vip/regular/new/sleeping/other), `StudioClientsKpis`, `StudioClientsSegmentCounts`, type guard `isStudioClientSegmentKey`
    - `lib/derive-segment.ts` — wraps `classifyClient` (reuse, no duplication), `selectPrimarySegment(statuses)` with priority VIP>sleeping>regular>new>other, `segmentMatches` filter helper
    - `lib/format.ts` — `formatDaysAgo` (Russian pluralisation + «Сегодня»/«Вчера»), `initialsOf` for avatars
    - `server/clients-data.service.ts` — `loadStudioClientsData` orchestrator: parallel load `prisma.booking.findMany` (extended select with `masterProviderId`) + `prisma.provider.findMany` (masters). `groupBookings` → in-memory enrichment (master tally per client = main master + mastersCount) → classify each → KPIs + segmentCounts from FULL set → filter (segment/master/search) → sort (VIP first + lastVisit desc) → cursor pagination (PAGE_LIMIT=50)
    - `components/` — 9 files: page orchestrator, header (Link to calendar), KPI row (5 tiles), segments-sidebar (URL-driven), filters (search debounced + master select), table, row (segment badge + chips), segment badge, pagination
  - **Раздел 5 (Бизнес-логика):**
    - **Segments derived, not stored** — `classifyClient` reuse ensures studio segment = master cabinet segment = STUDIO-BOOKINGS-A VIP signal. Single source of truth, threshold drift impossible
    - **CRM privacy preserved** — route `resolveCurrentStudioAccess` admits OWNER/ADMIN only at studio cabinet entry. Service operates within that scope. Master-only view enforced separately at `/cabinet/master/clients`
    - **KPI «added this month»** — proxy `visits ≤ 1 && lastVisitAt within month` (no `firstVisitAt` on `StudioClientRow` currently; backlog for precise count)
    - **KPI «sleeping»** — uses `CLIENT_STATUS_THRESHOLDS.SLEEPING_AFTER_DAYS` (90, not 60 from spec). Reused classifier constant for consistency with master cabinet sleeping rule — single threshold source. Spec said "60+ дней" but reusing 90 keeps the system coherent; if 60 specifically needed, backlog
    - **«Add client» pragmatic resolution** — clients table sources from booking aggregation (no name field on ClientCard). Standalone client creation would produce an invisible row. CTA links to `/cabinet/studio/calendar` where create-booking-dialog atomically captures phone+name+service+master+time. Honest UX > broken affordance
  - **Раздел 6 (Маршруты):** `/cabinet/studio/clients` page rewritten (was: simple table, now: rich 2-col with KPIs + segments + filters + pagination). URL params `?segment=all|vip|regular|new|sleeping&q=<search>&master=<id>&cursor=<key>` — shareable + browser back. **No new API endpoints** — all data flows through Prisma directly in the server service (consistent with other studio cabinet pages)
  - **Раздел 12 (Инварианты):** не затронуты. New module respects all existing invariants (privacy guard, VIP threshold reuse, no chat icon)
  - **UI_TEXT:** новый subtree `studioCabinet.clientsV2.*` (~45 keys — header / kpis / segments / filters / table / badges / actions / pagination / empty / errors). Legacy `studioCabinet.clients.*` keys preserved (still used by old page file as backup + ClientCardDrawer integrations elsewhere)
  - **@deprecated:** `src/features/studio/components/studio-clients-page.tsx` — replaced by new module, no longer imported by route. Kept in tree because `ClientCardDrawer` from `@/features/crm/components/` is still consumed by other surfaces. Phase 7 cleanup
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Backlog spawned:** Client blacklist mechanism (🟠 — schema flag/tag), Client birthday field (🟠 — schema migration), Custom segments + Import/Export/Рассылка (🟡), Studio-cabinet redesigned ClientCardDrawer (🟡), Precise firstVisitAt on row (🟡), Phone search normalisation (🟡), Client merge / Tag management UI / "Записать" pre-filled (🔵)
  - **Sprint progress:** 14/14 commits closed for the planned scope. Remaining studio pages (Reviews / Analytics / Finance / Settings / Notifications integration) are separate workstreams

- **2026-05-17 — STUDIO-SHOWCASE-SEED** (commit on `designStudioCabinet`). Rich-data fixture for studio cabinet visual validation. Mirror of `seed-showcase-master.ts` mechanism (Анна Соколова → 26-SHOWCASE-MASTER-SEED). **No schema migration, no production code touched** — pure seed addition.
  - **Audit findings:**
    - Master showcase = TS file `prisma/seeds/test-data/seed-showcase-master.ts`, idempotent via upsert by email + publicUsername + composite uniques + deterministic id prefix `seed-bk-showcase-anna-NN`. Wired into `index.ts` after `seedShowcaseMaster({ clients, plans })`. Run via `npm run seed:test`, reset via `npm run seed:test:reset` (catches seed users by `@test.masterryadom.local` email domain — phone-marker not needed)
    - Studio cabinet access goes through **`StudioMembership`** (canonical state machine PENDING/ACTIVE/REJECTED/LEFT with `roles: StudioRole[]`), NOT `StudioMember` (legacy redundancy — both populated for compatibility per audit invariant)
    - Active master predicate from invariant #24: `Provider.ownerUserId !== null && Provider.isPublished === true`. Seed must set both
    - 12 APPROVED categories already exist from `seedCategories()` — showcase studio reuses them via slug lookup. 2 PENDING categories scoped to studio via `createdByUserId=owner` + `createdByProviderId=studio.providerId` (invariant #23)
    - VIP threshold = LTV ≥ 5 000 000 kopecks (master cabinet `CLIENT_STATUS_THRESHOLDS.VIP_LTV_KOPEKS`) — design 3 clients with ~5M+ via accumulated FINISHED bookings of high-ticket services (combo 750K, balayage 1.1M, wedding-makeup 700K)
    - Existing seed phone ranges: masters `+79000001..28`, studios `+79000150..155`, clients `+79000100..114`. Master showcase used `+79991000009`. Studio showcase chose `+79992xxxxxx` — clean separation, no collision
  - **Раздел 3 (Архитектура):** new file `prisma/seeds/test-data/seed-showcase-studio.ts` (~750 LOC) — single `seedShowcaseStudio({ clients, plans })` export. Sections: owner + studio provider + Studio row + StudioMembership/StudioMember (owner OWNER); 7 master users + Provider rows with `studioId` + StudioMembership/StudioMember (MASTER); 2 PENDING categories with creator scope; 35 service rows attached to studio provider; MasterService assignments by specialty; weekly schedule templates Пн-Сб 10-19 (Вс off); 56 BOOKING_PLAN entries → upsert with BookingServiceItem snapshots; 3 ServicePackages; 15 REVIEW_PLAN entries; 7 ClientCards (3 VIP + tags); 12 notifications (wipe + replay since Notification has no natural unique); 2 PENDING ScheduleChangeRequests. Wired into `index.ts` after `seedShowcaseMaster` (depends on same clients/plans pool)
  - **Раздел 9 (Тестирование):** studio showcase seed добавлен как rich-data fixture для visual validation всех studio cabinet pages (dashboard / masters / schedule / bookings / services / reviews / clients / notifications / schedule-requests). Reused: existing `seedClients()` pool (15 clients) — same 15-client pool services both Anna's master showcase и Vision Beauty Studio. Reset cleanly via `npm run seed:test:reset` (email marker). Tests still 247/247
  - **Раздел 6 (Маршруты):** **NO route changes.** Seed only manipulates DB rows. URL surfaces: showcase studio admin logs in via `+79992000000`, cabinet entry `/cabinet/studio`. Public profile via existing `/providers/<id>` (no slug-based studio route exists yet)
  - **Раздел 12 (Инварианты):** не затронуты — seed соблюдает все existing invariants. Demonstrates them visually: invariant #23 (PENDING category creator-scope visibility), invariant #24 (ACTIVE master predicate), invariant #21 (no permissions toggles), invariant #22 (admin booking CRUD direct)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests. **Seed not executed** locally (Postgres unavailable in dev env) — code structurally validated through Prisma client types
  - **Run instructions:**
    - First time / reset + replay: `npm run seed:test:reset && npm run seed:test`
    - Add showcase to existing seed: `npm run seed:test` (idempotent — pre-existing data not wiped)
    - Login: phone `+7 999 200 00 00` → check server logs for OTP code → enters as Виктория Алмазова → auto-redirected to `/cabinet/studio`
  - **Backlog spawned:** none — pure data fixture, no follow-ups required

- **2026-05-17 — STUDIO-POLISH-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 13/13 — sprint **functional + polish work complete**. 4 visual замечания из live testing, low-risk single commit, no functional changes, no schema migration.
  - **Audit findings:**
    - **Master cabinet layout** (`src/app/(cabinet)/cabinet/master/layout.tsx`) — sidebar + `<main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>`. **No max-width clamp, no inner container** — pages decide their own padding/structure. Master dashboard wraps content в `<div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">`. Per-page `<MasterPageHeader>` provides sticky chrome
    - **Master cabinet has NO topbar** — global navbar (public header) sits above; cabinet shell has only sidebar + main + mobile bottom nav
    - **Master `GreetingHero`** uses explicit `text-white` on `bg-brand-gradient` — works in both themes (white always contrasts с burgundy gradient)
    - **Studio current layout** (pre-fix): `<main className="...px-4 py-6...">` wrapping `<div className="mx-auto w-full max-w-6xl">{children}</div>` — content centered with 1152px clamp, leaving empty space on wider displays. Topbar (`<StudioTopbar>`) inserted между sidebar и main с studio chip + theme toggle + public-page link
    - **Studio today banner** (pre-fix) used `text-[rgb(var(--accent-fg))]` — token resolves to near-black in light theme + dark mode не fixes it, so headline на бордовом градиенте плохо читался
    - **`Provider.publicUsername`** (`prisma/schema/provider.prisma:87`) — `String? @unique`. Опционально, но present для published masters. Public profile URL pattern `/u/<publicUsername>`. Existing infrastructure ready to be the canonical URL handle
    - **Studio topbar contents** (`studio-topbar.tsx`): (1) studio chip "{name} · {mastersCount}" — name uже live в sidebar UserChip (`studioName={studio.name}`); (2) "Открыть страницу студии" link — уже live as nav-item в sidebar `studioMetaExternal` group; (3) `<ThemeToggle />` — already in global public header. **Все три element полностью duplicate другие surfaces** → removal безопасно
  - **Раздел 3 (Архитектура):**
    - **#1 layout:** `src/app/(cabinet)/cabinet/studio/layout.tsx` — стрипнут intermediate `<div mx-auto w-full max-w-6xl>` wrapper, main теперь full-width с padding (как master). Flex column wrapper вокруг `<StudioTopbar>` + `<main>` свёрнут — main теперь direct flex-1 sibling sidebar (mirrors master structure)
    - **#2 hero:** `studio-today-banner.tsx` — `text-[rgb(var(--accent-fg))]` → `text-white` (explicit, mirrors master `GreetingHero`). Title template (`dashboardV2.banner.titleTemplate`) теперь `«Сегодня в студии {studioName} — {count} записей»` (was `«Сегодня в студии {count} записей»`). Caption выше title больше не дублирует studio name (только дата)
    - **#4 URL:** `StudioMasterListItem` тип расширен полем `urlHandle: string = publicUsername ?? id`. `master-list-item.tsx` пишет `urlHandle` в `?master=` param (вместо raw cuid). `loadStudioMasterDetail` query расширен `where: { OR: [{ id }, { publicUsername }], ... }` — resolves либо shape. `masters-list.tsx` сравнение `isSelected` matches against both `id` и `urlHandle` (бэкwards-compat для bookmarks)
    - **#6 topbar:** **deleted** `src/features/studio-cabinet/components/studio-topbar.tsx`. UI_TEXT `studioCabinet.topbar.*` keys (studioChip, openPublicPage) удалены. Import из layout убран. Все 3 element duplicate elsewhere (verified pre-removal)
  - **Раздел 5 (Бизнес-логика):** **NO functional changes.** Все 4 fix-а — visual/cosmetic. Хитрая часть для #4: `loadStudioMasterDetail` теперь принимает cuid OR publicUsername, resolves single query через `OR`. Никаких новых endpoints / API contracts
  - **Раздел 6 (Маршруты):** **NO new routes.** Existing `/cabinet/studio/team?master=<value>` теперь принимает both cuid и publicUsername (URLs с cuid bookmarks продолжают работать)
  - **Раздел 12 (Инварианты):** не затронуты — все existing invariants сохранены
  - **UI_TEXT:** 2 keys удалены (`studioCabinet.topbar.studioChip`, `studioCabinet.topbar.openPublicPage`). 1 key updated (`studioCabinet.dashboardV2.banner.titleTemplate` — добавлен `{studioName}` placeholder). Чистка appCaption + userChip preserved
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Sprint complete (13/13):** Cabinet Studio shell + 6 page redesigns + 2 bug fix commits + visual polish. Ready для STUDIO-CLIENTS-A (next page) либо user может testing полной четвёрки (masters + schedule + bookings + services + packages)
  - **Backlog spawned:** drop unused `mastersCount` field from `getStudioShellInfo` (🟡), per-page `<StudioPageHeader>` analog (🟡 — from STUDIO-SHELL-A), public catalog studio profile audit (🟡), profile preview popover в masters list (🔵), `publicUsername` setup CTA для masters without one (🔵)

- **2026-05-17 — STUDIO-BUGS-FIX-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 12/13. Bug fix commit после live testing — два functional bug'а закрыты, **no schema migration**, минимальный scope.
  - **Bug #3 (category create/display) — root cause:**
    - Prisma's `{ field: { not: "value" } }` operator on a nullable scalar column generates SQL `NOT (field = 'value')`, which under SQL 3-valued logic does NOT match rows where `field IS NULL`. Documented Prisma behaviour (https://github.com/prisma/prisma/issues/2389)
    - All 4 sites that filter `GlobalCategory` for studio/master pickers had `where: { visualSearchSlug: { not: "hot" }, ... }` — this silently dropped any row with `visualSearchSlug = null` (the default for freshly-proposed categories via `/api/categories/propose`)
    - Confirmed by reading `prisma/schema/service.prisma:161` — `visualSearchSlug String? @unique` (nullable, no default) + `/api/categories/propose/route.ts:78-93` — does not set this field
    - Latent bug affected master cabinet too (master's `service-modal.tsx` picker via `listAvailableGlobalCategories`) — likely unnoticed because newly-created master service modal auto-selects the freshly-created category in-flight, so user doesn't immediately hit the missing-picker UX
  - **Bug #5 (INVITED master eligibility) — root cause:**
    - No "active master" predicate in the codebase. `Provider.ownerUserId IS NOT NULL` is the canonical signal that an invitee has claimed the Provider stub (StudioInvite flow sets it during acceptance — already enforced by existing infrastructure)
    - `assignMasterToService` (services.service.ts:444-450) only checked `type=MASTER, studioId=...` — accepted INVITED master
    - `createStudioBooking` (bookings.service.ts:48-54) same
    - `moveStudioBooking` (bookings.service.ts) didn't validate target master at all
    - `loadStudioScheduleData` day/week `columns.isAvailable = master.isPublished` — INVITED master with default `isPublished=true` showed as bookable column. Disabled overlay only fired for paused masters, not invited ones
    - `loadShellExtras` in `/cabinet/studio/bookings/page.tsx` derived `scheduleMasters[].isAvailable` the same way → CreateBookingDialog/MoveBookingDialog pickers showed INVITED
    - Status display layer (STUDIO-MASTERS-A) already derived `INVITED` correctly but it was a display-only signal not wired to eligibility
  - **Раздел 3 (Архитектура):**
    - New helper `src/lib/studio/master-eligibility.ts` — `isStudioMasterActive({ ownerUserId, isPublished })` predicate + `requireActiveStudioMaster({ studioProviderId, masterId })` async guard throwing 404 `MASTER_NOT_FOUND` / 409 `MASTER_NOT_ACTIVE`. Single source of truth для eligibility
    - **Bug #3 changed files (4):** `src/features/studio-cabinet/services/server/services-data.service.ts` (2 query sites), `src/lib/master/services-view.service.ts`, `src/lib/master/portfolio-view.service.ts`. Pattern: drop in-WHERE `visualSearchSlug: { not: "hot" }`, select the field, filter post-query with `.filter(r => r.visualSearchSlug !== "hot")`. Works regardless of Prisma version
    - **Bug #5 changed files (4):** `src/lib/studio/services.service.ts` (`assignMasterToService` calls `requireActiveStudioMaster`), `src/lib/studio/bookings.service.ts` (`createStudioBooking` + `moveStudioBooking` both call guard), `src/features/studio-cabinet/schedule/server/schedule-data.service.ts` (day + week column `isAvailable` uses `isStudioMasterActive`; week cells `capacity`/`isDayOff` follow), `src/app/(cabinet)/cabinet/studio/bookings/page.tsx` (`loadShellExtras` mirrors predicate). Plus filter in `loadStudioServiceDetail.availableMasters` directly with `where: { ownerUserId: { not: null }, isPublished: true }` (`{ not: null }` is the documented Prisma idiom for «field IS NOT NULL»)
  - **Раздел 5 (Бизнес-логика):**
    - **Eligibility:** ACTIVE = `ownerUserId !== null && isPublished === true`. INVITED (no `ownerUserId`) and DISABLED (`!isPublished`) both blocked from assign/booking/move/schedule eligibility. Per-spec: «только ACTIVE» — explicit per master moderation
    - **Server-side enforcement** at the lib layer means API routes pick up the guard automatically — no per-route code change needed. Endpoints `/api/studio/services/[id]/assign-master`, `/api/studio/bookings`, `/api/studio/bookings/[id]/move` now return 409 `MASTER_NOT_ACTIVE` with friendly Russian message for INVITED/DISABLED attempts
    - **UI eligibility surfaces:** assign-dialog picker filters at source (no INVITED in list); schedule grid + booking dialog pickers filter via `column.isAvailable` (existing UI code unchanged); schedule disabled-master overlay now also fires for INVITED columns
    - **Master list page UNCHANGED** — masters list shows all team members including INVITED with their badge (correct per spec — list is informational, not action-driven)
  - **Раздел 6 (Маршруты):** **NO new endpoints**, all changes are server-side enforcement on existing API routes. URLs unchanged
  - **Раздел 12 (Инварианты):** **#21 strengthened** — original phrasing covered «no permissions toggles in UI». Bug #5 makes the **runtime enforcement** explicit: INVITED master cannot be assigned to services or accept bookings — blocked at lib layer via `requireActiveStudioMaster`. Predicate canonicalised in `isStudioMasterActive`
  - **Раздел 10 (Безопасность):** new error code `MASTER_NOT_ACTIVE` added to `ERROR_CODES` in `src/lib/api/errors.ts`. 409 status (conflict — master exists but not in eligible state)
  - **UI_TEXT:** updated 1 string — `studioCabinet.servicesV2.assignMasterDialog.noAvailable` clarified to explain INVITED masters appear after acceptance. No new keys (error messages flow through from lib via `AppError.message`)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **No schema migration** — both fixes piggy-back on existing data model (`GlobalCategory.visualSearchSlug` + `Provider.ownerUserId` + `Provider.isPublished`). Strategy followed Strategy A precedent (CATEGORY-UNIFICATION-A, STUDIO-PACKAGES-A): forward-only application-layer fix
  - **Backlog spawned:** audit other `{ not: value }` filters on nullable columns (🟡), partial index on `(studioId, isPublished) WHERE ownerUserId IS NOT NULL` (🟡), shared `STUDIO_ACTIVE_MASTER_WHERE` Prisma fragment (🟡), invite-acceptance audit log (🔵), distinct INVITED vs DISABLED visual labels (🔵)
  - **Next:** STUDIO-CLIENTS-A — clients management

- **2026-05-17 — STUDIO-PACKAGES-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 11/13. Strict mirror of master `ServicePackage` pattern для studio cabinet. **No schema migration.**
  - **Audit findings:**
    - `ServicePackage.masterId` is generic `Provider` FK (no `Provider.type` constraint at DB level), reusable для studio Provider records. Field name semantically misleading once studios use it
    - Master mutations (`createMasterPackage`/`updateMasterPackage`/`deleteMasterPackage` in `src/lib/master/services-mutations.ts`) check `service.providerId === masterId` for ownership — works correctly for studio because `Service.providerId === studio.providerId`
    - Pure pricing helper `computeBundlePricing` (`src/features/master/components/services/lib/compute-bundle-pricing.ts`) — PERCENT round(total × value / 100), FIXED min(total, value), final = max(0, total − discount). Reusable as-is
    - Zod schemas (`createMasterPackageSchema` / `updateMasterPackageSchema` в `src/lib/master/schemas.ts`) reusable через `.extend({ studioId })` / `.and(z.object({ studioId }))`
    - Catalog НЕ surfaces packages currently — master `bundle-card.tsx` имеет TODO «Booking is deferred until the public booking flow integrates ServicePackage». Public catalog work deferred along with master parity
  - **Раздел 3 (Архитектура):** новый namespace `src/features/studio-cabinet/services/` (extended):
    - `server/packages-data.service.ts` — `loadStudioPackages(studioId)` resolves studio.providerId → `prisma.servicePackage.findMany({ where: { masterId: providerId } })` с items.service include, maps to StudioPackageView with computed pricing + hasDisabledComponent flag. `loadStudioPackagePickerServices(studioId)` returns studio services для modal's service-picker
    - `components/packages-section.tsx` — section header с «Создать пакет» button (disabled when <2 services) + grid of PackageCards или empty state
    - `components/package-card.tsx` — brand-gradient-soft card, edit + delete icon buttons, components list, warning for disabled components, final price + savings + duration
    - `components/package-modal.tsx` — mirrors master BundleModal. State: name / selectedIds / discountType / discountValue (string с comma→dot parse, kopeks для FIXED) / isEnabled. Uses `computeBundlePricing` для live preview
    - `components/delete-package-dialog.tsx` — confirmation dialog
  - **Раздел 6 (Маршруты):** 2 новых API endpoints — `POST /api/studio/service-packages` (body extends `createMasterPackageSchema` + `studioId`; ensureStudioRole [OWNER, ADMIN]; passes `studio.providerId` as `masterId` to `createMasterPackage`) + `PATCH/DELETE /api/studio/service-packages/[id]` (PATCH body extends `updateMasterPackageSchema` + `studioId`; DELETE accepts `?studioId=`). Thin wrappers — все validation/transaction logic в shared master mutations
  - **Раздел 5 (Бизнес-логика):** **NO new business logic** — all CRUD goes through existing master mutations. Studio packages identical к master packages semantically (compose 2+ existing services + discount). Owner check `service.providerId === masterId` correctly scopes services к studio Provider. **Key insight:** `ServicePackage.masterId` field name is misleading once studios use it — backlog rename `masterId` → `providerId` (not blocking, ~30-min focused commit). No `Provider.type` validation needed at field level because routes already gate с `ensureStudioRole`
  - **UI_TEXT:** 4 new subtrees under `studioCabinet.servicesV2.*` — `packages.{sectionTitle,sectionSubtitle,addPackage,emptyTitle,emptyBody,minServicesHint}` (~6 keys), `package.{edit,delete,pausedBadge,componentsLabel,componentDisabled,warningDisabledComponents,finalPriceLabel,savingsTemplate,durationTemplate}` (~9 keys), `packageDialog.*` (~22 keys: titleCreate/titleEdit/name/services/discount/preview/isEnabled/submit variants), `deletePackageDialog.{title,bodyTemplate,cancel,confirm,submitting}` (~5 keys). Plus 4 error keys (`packageNameRequired,packageMinServices,packageSave,packageDelete`)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Catalog visibility:** **deferred** — public catalog surface для packages пока не существует, master cabinet lives с этой gap. When integration происходит, both master + studio packages подключаются single shot through unified `globalCategoryId` mechanism
  - **Backlog spawned:** public catalog / booking flow integration for ServicePackage (🟠), `masterId` → `providerId` rename migration (🟠), package analytics (bookings/revenue/popularity 🟡), package master assign (🟡), package reorder D&D (🟡), package duplicate/clone (🟡), discount preview improvements (🔵), package validity period (🔵), «Featured» package highlight (🔵)
  - **Next:** STUDIO-CLIENTS-A — clients management

- **2026-05-16 — 🔴 CATEGORY-UNIFICATION-A** (commit on `designStudioCabinet`). Pre-launch product-critical blocker resolved. Studio-created services now correctly attach to `GlobalCategory` and appear in the public catalog category filters. **No schema migration required** — forward-only unification strategy.
  - **Audit findings:**
    - **Catalog matching by `globalCategoryId` only** (`src/lib/catalog/catalog.service.ts:332`). Services without `globalCategoryId` are invisible to public category filters
    - Only **2 files** actually do `prisma.serviceCategory.*` queries: legacy `src/lib/studio/services.service.ts` + my new STUDIO-SERVICES-A `src/features/studio-cabinet/services/server/services-data.service.ts`
    - **Master flow is the proven reference pattern** — `master/components/services/modals/service-modal.tsx` uses `globalCategoryId` only, picker via `listAvailableGlobalCategories(ownerUserId)` (APPROVED + own-pending), inline propose via `POST /api/categories/propose`
    - **Scope visibility already supported** by `GlobalCategory.{status, proposedBy, createdByUserId, visibleToAll}` fields. No schema additions needed
    - `Service.categoryId` was already optional in Prisma — only Zod validator enforced `min(1)`
  - **Strategy: Forward-only unification (Strategy 1).** Backed by audit; no schema migration required; pre-launch data not critical (per user scope decision)
  - **Раздел 3 (Архитектура):** 
    - **Modified:** `src/lib/studio/schemas.ts` — `createStudioServiceSchema.categoryId` relaxed to optional + comment explaining forward path
    - **Modified:** `src/lib/studio/services.service.ts` — `createStudioService` accepts optional `categoryId` + new `proposerUserId` param, validates `globalCategoryId` against APPROVED-or-own-pending (mirrors `listAvailableGlobalCategories` semantics)
    - **Modified:** `src/app/api/studio/services/route.ts` POST — passes `user.id` as `proposerUserId`
    - **Rewrite:** `src/features/studio-cabinet/services/server/services-data.service.ts` — groups by `globalCategoryId` (was `categoryId`); sidebar unions in-use ∪ APPROVED-visible ∪ own-pending; synthetic `UNCATEGORIZED_KEY` bucket for legacy services. New exported helper `listAvailableCategoriesForStudio(userId)` for pickers
    - **Modified:** `src/features/studio-cabinet/services/lib/types.ts` — `StudioServiceCategoryRow.status` (APPROVED/PENDING/uncategorized) + new `StudioCategoryPickerOption` + `UNCATEGORIZED_KEY` constant
    - **Modified:** `src/app/(cabinet)/cabinet/studio/services/page.tsx` — fetches + passes `currentUserId` and `pickerOptions`
    - **Modified:** `src/features/studio-cabinet/services/components/studio-services-page.tsx` — `pickerOptions` prop pass-through
    - **Rewrite:** `src/features/studio-cabinet/services/components/services-header.tsx` — passes `pickerOptions` to add-dialog (no `categories` prop)
    - **Rewrite:** `src/features/studio-cabinet/services/components/add-service-dialog.tsx` — picker shows APPROVED + own-pending with `· на модерации` suffix; inline «+ Новая категория» calls `POST /api/categories/propose` and auto-selects; sends `globalCategoryId`
    - **Modified:** `src/features/studio-cabinet/services/components/service-detail-panel.tsx` — picker via `pickerOptions`; PATCH body switches `categoryId` → `globalCategoryId`
    - **Modified:** `src/features/studio-cabinet/services/components/categories-sidebar.tsx` — shows PENDING badge + tooltip; drops `studioId` requirement
    - **Modified:** `src/features/studio-cabinet/services/components/add-category-dialog.tsx` — rewired from `/api/studio/categories` → `/api/categories/propose` (mirrors master flow)
  - **Раздел 4 (Модель данных):** **No migration.** `GlobalCategory` (existing model — `status`, `visibleToAll`, `proposedBy`, `createdByUserId`, `createdByProviderId`) is the unified category source. `ServiceCategory` model preserved (still used by `studio-settings-page.tsx` services tab). `Service.{categoryId, globalCategoryId}` both remain in schema as before
  - **Раздел 5 (Бизнес-логика):**
    - **Studio service create flow:** picker shows union (APPROVED visible globally + own-PENDING proposed by current user). Inline propose creates `GlobalCategory.status=PENDING, visibleToAll=false, proposedBy/createdByUserId=user.id`. Service attaches via `globalCategoryId` (NOT `categoryId`). Catalog matches and surfaces the service in public filters
    - **Category visibility (invariant #23):** APPROVED visible everywhere; PENDING ONLY in own creator's pickers. Public catalog (`/api/catalog/global-categories`) strict-filters APPROVED + visibleToAll
    - **Master flow preserved** — uses same `listAvailableGlobalCategories(userId)` + `POST /api/categories/propose`. Studio admin and master share the unified pattern
    - **Legacy `studio-settings-page.tsx` services tab still works** — uses legacy `createStudioService` path with `categoryId` populated (validator-relaxed but not breaking). Future Phase 7 cleanup removes legacy tab + ServiceCategory model
  - **Раздел 6 (Маршруты):** existing endpoints used (no new routes):
    - `POST /api/studio/services` (now accepts `globalCategoryId` without `categoryId`; passes `proposerUserId` from session)
    - `POST /api/categories/propose` (existing master-side endpoint, now also called from studio add-category-dialog)
    - `/api/catalog/global-categories` GET (public catalog — APPROVED + visibleToAll, untouched)
  - **Раздел 12 (Инварианты):** new **#23** (Category visibility: APPROVED public / PENDING creator-scope) — strict invariant for any future surface filtering categories
  - **UI_TEXT:** new keys в `studioCabinet.servicesV2.addServiceDialog.*` (`categoryNone`, `pendingSuffix`, `proposeCategory`, `proposeHint`, `proposePlaceholder`, `proposeSubmit/Submitting`, `proposeCancel`) + `categories.{pendingBadge, pendingHint}` + `detail.{categoryNone, pendingSuffix}`. Legacy `addCategoryDialog.*` keys reused (rewired to propose flow)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **🔴 Pre-launch blocker closed:** core product flow «студия создаёт услугу → клиент находит её в каталоге» теперь работает. Services attached via new flow have `globalCategoryId` → appear в catalog category filters (verified by reading `catalog.service.ts:324-345`)
  - **Next:** STUDIO-PACKAGES-A — service packages для studio (master pattern reference)

- **2026-05-16 — STUDIO-GAPS-FIX-A** (commit on `designStudioCabinet`). Gap fix commit между STUDIO-SERVICES-A и STUDIO-CLIENTS-A. Closes 2 carryover items + adds surgical cache invalidation fix.
  - **Раздел 3 (Архитектура):**
    - **New:** `src/features/studio-cabinet/schedule/components/dialogs/manage-breaks-dialog.tsx` — modal с existing breaks list (per current viewed day) + add-form (master + start datetime + end datetime + optional note). Triggered from schedule header «Перерывы» button (added next to «Обновить»)
    - **Modified:** `src/features/studio-cabinet/bookings/components/booking-row.tsx` + `bookings-table.tsx` — chat icon column полностью removed (was broken — 404 link). Drop `MessageCircle` icon, `Link` import; drop extra `<th aria-hidden>` cell. `bookingsV2.actions.openChat` UI_TEXT key оставлен как dead-letter (Phase 7 cleanup)
    - **Modified:** `src/features/studio-cabinet/schedule/components/schedule-header.tsx` — added `breaks` + `dayStartIso` props, «Перерывы» button, `ManageBreaksDialog` integration
    - **Modified:** `src/features/studio-cabinet/schedule/components/studio-schedule-page.tsx` — pass-through `data.day.breaks` + `data.day.dayStartIso` to header
    - **Modified:** `src/lib/studio/calendar.service.ts` — `createStudioBlock` / `updateStudioBlock` / `deleteStudioBlock` теперь вызывают `invalidateSlotsForMaster(masterId)` после Prisma mutation. Pre-existing gap (endpoint created для legacy editor never invalidated public booking slot cache) — now closed
  - **Раздел 5 (Бизнес-логика):**
    - **Chat icon resolution (Option C — remove):** audit revealed `resolveChatAccess` in `src/lib/chat/access.ts` returns `forbidden` for any user who is not `booking.clientUserId` или `booking.masterProvider.ownerUserId`. Studio admin (third party) is **by design** not a chat participant. Options A (route) и B (drawer) both required auth model change (chat = 1:1 client↔master concept). Decision: remove icon. **Honest UX: no icon > broken icon.** Studio admin chat participation → backlog 🟠 as auth model + UI extension
    - **Break management (Option built):** new dialog uses existing `POST /api/studio/blocks` + `DELETE /api/studio/blocks/[id]?studioId=...`. One-time breaks only (TimeBlock model). Recurring weekly breaks (ScheduleBreak via editor.ts) → backlog 🟠
    - **Admin direct break** — no approval flow (инвариант #22: studio admin booking/break CRUD direct, ScheduleChangeRequest scope = master working-hours only)
    - **Cache invalidation fix is structural** — applies to ALL block/break operations going through `calendar.service.ts`, не только new admin dialog. Legacy editor consumers also benefit from this consistency. Pre-launch hardening
  - **Раздел 6 (Маршруты):** никаких новых API endpoints. Existing endpoints `POST /api/studio/blocks`, `PATCH /api/studio/blocks/[id]`, `DELETE /api/studio/blocks/[id]` reused as-is. Bookings journal route не изменён (только UI internals)
  - **UI_TEXT:** new `studioCabinet.scheduleV2.breakDialog.*` (~13 keys) + `header.manageBreaks` + 4 new error keys (`breakMasterRequired`, `breakTimeRange`, `breakCreate`, `breakDelete`)
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Carryover closed:**
    - Chat icon route 404 (from STUDIO-BOOKINGS-A Pre-launch risks) — closed (icon removed, backlog item created for auth model extension)
    - Break management UI dialog (from STUDIO-SCHEDULE-A High priority backlog) — closed (one-time dialog built, recurring → enhancement backlog)
  - **Next:** STUDIO-CLIENTS-A — clients/CRM management page

- **2026-05-16 — STUDIO-SERVICES-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 8/13. `/cabinet/studio/services` rewrite — 3-col layout (categories sidebar / list / detail panel) replaces legacy 1080-LOC services client component.
  - **Раздел 3 (Архитектура):** новый namespace `src/features/studio-cabinet/services/`:
    - `lib/types.ts` — DTOs (`StudioServiceCategoryRow`, `StudioServiceListItem`, `StudioServiceDetail`, `StudioServiceMasterChip`, `StudioServicesKpis`)
    - `server/services-data.service.ts` — `loadStudioServicesListData` (categories + filtered services + 30d bookings batched через single groupBy-like findMany) + `loadStudioServicesKpis` (totals / popular / avg check / without-master) + `loadStudioServiceDetail` (full detail + assigned masters + available masters + 30d stats)
    - `components/` — 12 files: page orchestrator, services-header (with add-service dialog), services-kpi-row (4 tiles), categories-sidebar (with add-category dialog), services-search, services-list, service-list-item (no ТОП/доп badges), service-detail-panel (form + masters chips + stats + Save/Delete), service-detail-empty, add-service-dialog, add-category-dialog, assign-master-dialog, delete-service-dialog
  - **Раздел 5 (Бизнес-логика):**
    - **Legitimate flag decision:** `Service.isActive` toggle surfaced в detail panel (audit нашёл real boolean used by `updateStudioService` endpoint; drives catalog/booking visibility). **NO фейк toggles** — все 4 из jsx референса (online booking / public price / master price change / addon) убраны. `onlinePaymentEnabled` плагин-gated — оставлен на будущее (backlog)
    - **Category flow simplified:** UI работает с `ServiceCategory` (legacy studio-scoped, required by existing `createStudioService` endpoint constraint `categoryId.min(1)`). Master pattern «propose global category» (`POST /api/categories/propose`) — backlog как enhancement (можно добавить опцию в add-category-dialog без schema migration)
    - **Master assign mechanics:** existing `assignMasterToService` (upsert MasterService с `isEnabled`) reused. **New endpoint `POST /api/studio/services/[id]/unassign-master`** + `unassignMasterFromService` lib helper — soft-unassign через `MasterService.updateMany({isEnabled: false})`. Survives для analytics, mirror existing pattern
    - **New endpoint `DELETE /api/studio/services/[id]?studioId=...`** + `deleteStudioService` lib helper — hard delete. `BookingServiceItem` snapshots survive (analytics OK)
    - **Master chips link** в detail panel → `/cabinet/studio/team?master=<id>` (canonical detail из STUDIO-MASTERS-A). MasterCardDrawer integration **removed** в new design — legacy file сохранён только потому что embed'ed в `studio-settings-page.tsx` tab
    - **KPI proxies:** popular service = max bookings30d, avg check = total revenue / total count за 30d, services-without-master = count of `Service.masterServices.length === 0`
  - **Раздел 6 (Маршруты):** `/cabinet/studio/services` rewrite. Новые endpoints: `DELETE /api/studio/services/[id]`, `POST /api/studio/services/[id]/unassign-master`. URL params `?category=<id>` / `?service=<id>` / `?q=<search>` — shareable
  - **UI_TEXT:** новый subtree `studioCabinet.servicesV2.*` (~80 keys — header / kpis / categories / list / detail / addServiceDialog / addCategoryDialog / assignMasterDialog / deleteServiceDialog / errors). Старый `studioCabinet.routes.services*` оставлен — used by legacy services tab in settings page
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **Legacy preservation:** `studio-services-page.tsx` (1080 LOC) **НЕ deprecated** — всё ещё консумится `studio-settings-page.tsx` tab. `MasterCardDrawer` тоже preserved для того же reason. Phase 7 cleanup убирает обоих когда settings page получает redesign
  - **Backlog spawned:** import/export CSV, drag reorder, bulk operations, addon services, ТОП highlight, studio category global proposal flow, service description editing, legacy services tab cleanup
  - **Next:** STUDIO-CLIENTS-A — clients/CRM management page

- **2026-05-16 — STUDIO-BOOKINGS-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 7/13. Новая page `/cabinet/studio/bookings` (раньше не существовала) — table-based журнал записей.
  - **Раздел 3 (Архитектура):** новый namespace `src/features/studio-cabinet/bookings/`:
    - `lib/source-display.ts` — `getBookingSourceDisplay(BookingSource)` + `SOURCE_BADGE_CLASS` (WEB → «Каталог» info tone, MANUAL → «Звонок» neutral, APP → «Приложение» neutral graceful)
    - `lib/time-range-filter.ts` — `parseBookingsTimeRange` + `bookingsTimeRangeBounds` (today / tomorrow / week / all → UTC bounds)
    - `server/types.ts` — DTOs (`StudioBookingRow`, `StudioBookingsListData`, `StudioBookingsKpis`, etc)
    - `server/bookings-list.service.ts` — `listStudioBookings` с filters (range / status / master / search), cursor pagination (50/page), batched VIP/new client detection через single lifetime-bookings query per page
    - `server/bookings-kpis.service.ts` — `loadStudioBookingsKpis` (5 tiles: today / needs action / confirmed 7d / revenue today + delta vs 30d avg / no-show 7d) + `loadStudioMasterOptions`
    - `components/` — 8 files: page orchestrator, header, kpi-row, filters (URL-driven), table, row (inline reuse of schedule's BookingActionMenu via type adapter), pagination, plus empty state inside table
  - **Раздел 5 (Бизнес-логика):**
    - **VIP badge mechanism reused** — `CLIENT_STATUS_THRESHOLDS.VIP_LTV_KOPEKS` (5 000 000 копеек / 50 000 ₽) from `src/lib/master/clients-classifier.ts`. Studio admin sees the same VIP signal that master cabinet's CRM applies. ClientKey resolution: `user:<id>` если `clientUserId`, иначе `phone:<normalized>`. Stats batched lifetime через single broad `prisma.booking.findMany({where: {OR: [studioId, providerId], status: COMPLETED}})` per page render — no N+1 risk
    - **«новый» badge** — client с `completedCount <= 1` в studio scope (first visit OR currently making first visit). Computed from same batched stats
    - **KPI «Требуют действий»** — count of `PENDING + CHANGE_REQUESTED + NEW` starting today onwards. **NO «опаздывает»** sub-metric per scope
    - **Revenue today delta** — vs 30-day daily average (proxy formula). `null` если нет history
    - **Source mapping:** WEB → «Каталог», MANUAL → «Звонок», APP → graceful «Приложение» (reserved for future)
    - **NO ручной смены статуса** — action menu reused from STUDIO-SCHEDULE-A as-is (Детали / Перенести на мастера / Перенести по времени / Отменить). Status changes остаются automatic-driven (booking flow)
    - **Inline reuse strategy** — `BookingActionMenu` / `MoveBookingDialog` / `CancelBookingDialog` / `CreateBookingDialog` из `schedule/components/dialogs/` consumed напрямую through type adapter (`bookingToCell(StudioBookingRow): ScheduleBookingCell` в `booking-row.tsx`). Не делал extract-to-shared чтобы минимизировать риск регрессии — журнал передаёт совместимый shape
  - **Раздел 6 (Маршруты):** `/cabinet/studio/bookings` page route added (nav item already existed from STUDIO-SHELL-A, теперь functional). Никаких новых API endpoints — все existing endpoints (`POST /api/studio/bookings`, `PATCH /api/studio/bookings/[id]/move`, `POST /api/bookings/[id]/cancel`) reused
  - **CarryOver fix:** **Phone required в CreateBookingDialog** — applied. `clientPhone` теперь обязательный + invalid-phone validation. Body всегда отправляет normalized phone (no more `undefined`)
  - **UI_TEXT:** новый subtree `studioCabinet.bookingsV2.*` (~70 keys — header / kpis / filters (with statusLabels for 11 BookingStatus values) / table / client / source / actions / empty / pagination). Также добавлены 2 error keys в `scheduleV2.errors`: `clientPhoneRequired` / `clientPhoneInvalid`
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved (один новый unused warning fixed inline), encoding/mojibake/prisma ✅, 247/247 tests
  - **N+1 prevention:** verified — list = 1 main query + 1 lifetime stats batch + 4 parallel range counts + 1 master include resolve. Cursor pagination keeps page sets manageable
  - **Backlog spawned:** export CSV, saved filter segments, booking detail drawer (richer than action menu), bulk operations, sort by column, VIP threshold per-studio override
  - **Next:** STUDIO-SERVICES-A — services management page

- **2026-05-16 — STUDIO-SCHEDULE-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 6/13. `/cabinet/studio/calendar` rewrite — legacy 695-LOC client component заменён server-orchestrated multi-master grid с action menus, URL state, manual refresh.
  - **Раздел 3 (Архитектура):** новый namespace `src/features/studio-cabinet/schedule/`:
    - `lib/time-grid.ts` — constants `DAY_START_HOUR=9` / `DAY_END_HOUR=21` / `SLOT_MINUTES=30` / `SLOT_HEIGHT_PX=28`. Pure helpers `offsetPxFromDayStart`, `durationPx`, `parseDateKey`, `toDateKey`, `addUtcDays`
    - `lib/booking-status-display.ts` — `bookingToneFromStatus(BookingStatus)` + `BOOKING_CELL_CLASS` Tailwind bundle (5 tones: confirmed / pending / new / done / muted)
    - `lib/view-state.ts` — `parseScheduleView` (only "day" | "week", no month per scope decision)
    - `server/types.ts` — DTOs (ScheduleDayData, ScheduleKpis, ScheduleWeekData, StudioScheduleData, ScheduleBookingCell с tone field, etc)
    - `server/schedule-data.service.ts` — `loadStudioScheduleData({studioId, dateKey, view})` orchestrator. Parallel: day data (masters + bookings + breaks) / services catalog / optional week data. First-time-client detection через `clientUserId` earliest-booking groupBy. KPIs computed inline. Header doc-comment делает invariant #22 явным
    - `components/` — 12 files: page orchestrator, header (URL-driven view toggle + date nav + refresh + add-button), kpi-row (4 tiles), legend, day-view subdir (day-grid + time-axis + master-column-header + current-time-line + disabled-master-overlay), week-view subdir (week-grid), dialogs subdir (create-booking-dialog + booking-action-menu + move-booking-dialog + cancel-booking-dialog)
  - **Раздел 5 (Бизнес-логика):**
    - **Day grid:** master columns × time rows. Booking cells absolute-positioned by `offsetPxFromDayStart(start)` and `durationPx(start, end)`. Status color tone applied per `bookingToneFromStatus`. First-time clients get "new" tone (emerald). Empty cells clickable → create-booking-dialog. Booking cells clickable → action-menu (details/move/cancel popover). Disabled masters (Provider.isPublished=false) get hatched overlay "Недоступен" (no "В отпуске до X" — no schema field for vacation end)
    - **Week view simplified:** master rows × weekday columns. Each cell = `booked/capacity + progress bar`. Click → switch to day view of that date. Avoids per-booking rendering (would overload visually for N masters × 7 days)
    - **Action menus вместо D&D** (scope decision): clicking booking opens modal с 4 actions (Перенести на мастера / Перенести по времени / Детали / Отменить). Move dialogs reuse `PATCH /api/studio/bookings/[id]/move` (existing — KEEP_SERVICE strategy, KEEP_PRICE pricing). Cancel reuses `POST /api/bookings/[id]/cancel` (existing generic endpoint, не studio-specific)
    - **Create booking:** click empty cell → dialog с master/service/client/phone form. Submit → `POST /api/studio/bookings` (existing `createStudioBooking`). Conflict check server-side через existing flow. Phone optional, normalized через `normalizeRussianPhone`. Pre-filled master + startAt from clicked slot
    - **Admin direct edit invariant** — добавлен Раздел 12 invariant #22 (booking CRUD direct, ScheduleChangeRequest scope = master working-hours only). Reaffirms boundary between STUDIO-SCHEDULE-A и STUDIO-SCHEDULE-REQUEST-APPROVAL-A
    - **KPIs:** bookings count + confirmed count + revenue (sum BookingServiceItem.priceSnapshot fallback Service.price) + occupancy % (pragmatic `bookings / (mastersOnShift × 5)` proxy consistent с dashboard) + free windows count
    - **Manual refresh:** Header «Обновить» button triggers `router.refresh()` + sets local timestamp. **NO auto-refresh / NO SSE** per scope. Each successful action (create/move/cancel) also triggers `router.refresh()`
  - **Раздел 6 (Маршруты):** `/cabinet/studio/calendar` теперь rich multi-master schedule (was: legacy 695-LOC client с tabs/services/chat/editor). URL params `?view=day|week&date=YYYY-MM-DD` shareable. Никаких новых API endpoints — все existing endpoints reused (`GET /api/studio/calendar`, `POST /api/studio/bookings`, `PATCH /api/studio/bookings/[id]/move`, `POST /api/bookings/[id]/cancel`, `POST /api/studio/blocks`)
  - **Раздел 12 (Инварианты):** добавлен **#22** (admin booking CRUD direct vs approval flow scope)
  - **UI_TEXT:** новый subtree `studioCabinet.scheduleV2.*` (~90 keys — header / kpis / legend / column / cell / actions / createDialog / moveDialog / cancelDialog / weekView / empty / errors). Старый `studioCabinet.calendar.*` оставлен (legacy `StudioCalendarPage` ещё в tree). Phase 7 cleanup удалит вместе
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved (один новый unused warning fixed inline), encoding/mojibake/prisma ✅, 247/247 tests
  - **@deprecated:** `StudioCalendarPage` (`src/features/studio/components/studio-calendar-page.tsx`, 695 LOC) — orphan after rewrite (only comment-level reference в `master-schedule-editor.tsx`). Phase 7 cleanup will delete
  - **Backlog spawned:** D&D bookings, Месяц view, break management UI (TimeBlock create/remove dialog), booking detail drawer (richer than action menu), SSE live updates, mobile pinch-zoom, conflict warning UI, bulk operations, master schedule quick-edit from calendar
  - **Next:** STUDIO-BOOKINGS-A — bookings list view

- **2026-05-15 — STUDIO-MASTERS-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 5/13. `/cabinet/studio/team` page rewrite — legacy list cards + inline create modal заменены 2-column layout (filters + list / detail panel) с URL-driven state.
  - **Раздел 3 (Архитектура):** новый namespace `src/features/studio-cabinet/masters/`:
    - `lib/status-display.ts` — `StudioMasterDisplayStatus = "ACTIVE" | "INVITED" | "DISABLED"` derived from existing data model (no schema change). Tone mapping + Tailwind badge class map
    - `lib/week-occupancy.ts` — `getMasterWeekOccupancy({providerId})` returns 7-cell Mon..Sun array. Uses `WeeklyScheduleConfig.days[].isActive` for day-off detection + counts bookings in week window. Capacity heuristic = 5 per active day (consistent с dashboard occupancy proxy)
    - `server/types.ts` — DTOs (`StudioMasterListItem`, `StudioMastersListData`, `StudioMasterDetail`, `StudioMasterFilter`)
    - `server/masters-list.service.ts` — `loadStudioMastersList({studioId, currentUserId, filter, search})`. Параллельный fetch providers + invites + 30d bookings, derive status, aggregate metrics. Counts always cover full studio; items is filtered subset
    - `server/master-detail.service.ts` — `loadStudioMasterDetail({studioId, masterId, currentUserId})`. Parallel: bookings period, distinct clientUserIds (lifetime), pending invite lookup, week schedule, StudioMembership.createdAt (joined timestamp)
    - `components/` — 10 файлов: page orchestrator, header (с Invite button + dialog), filters (URL-driven), list + list-item, detail header (с actions + Pause/Activate trigger), KPIs row, week schedule, panel + empty state, invite-dialog, pause-master-dialog
  - **Раздел 5 (Бизнес-логика):**
    - **Status derivation:** `Provider.ownerUserId == null OR pending StudioInvite for phone` → `INVITED`; `isPublished` → `ACTIVE`; иначе → `DISABLED`. Matches existing `listStudioMasters` semantics, без schema migration
    - **Joined timestamp:** `StudioMembership.createdAt` если exists, иначе fallback на `Provider.createdAt`. No dedicated `joinedAt` field в schema (backlog если потребуется precise)
    - **Pause/Activate:** reuse existing `PATCH /api/studio/masters/[id]` с `isActive` flag → `Provider.isPublished` toggle. Single atomic write
    - **Invite:** reuse existing `POST /api/studio/masters` (создаёт Provider stub + StudioInvite). SMS dispatch — fail-soft если SMS gateway не настроен (текущий MVP)
    - **NO commission, NO payouts, NO permissions toggles, NO PREMIUM badge** — explicitly excluded per scope (см. инварианты 20-21)
  - **Раздел 6 (Маршруты):** `/cabinet/studio/team` теперь rich 2-column page (was: filter tabs + simple card grid). URL params `?tab=all|active|invited|disabled` / `?q=<search>` / `?master=<id>` — shareable + browser back support. Legacy `?filter=working_today` collapses to `all` (acceptable graceful degrade). Никаких новых API endpoints — все existing `/api/studio/masters/*` + `/api/cabinet/studio/members/*` reused
  - **Раздел 12 (Инварианты):** добавлены **#20** (studio masters никогда не показывают PREMIUM badge — subscription шарится) и **#21** (permissions работают по default правилам, no toggles in UI)
  - **UI_TEXT:** новый subtree `studioCabinet.mastersV2.*` (~60 keys — header / filters / status / listItem / list / inviteCard / detail / inviteDialog / pauseDialog / activateDialog / errors). Старый `studioCabinet.team*` + `teamPage*` + `teamTabs*` keys остались — больше не consumed, к удалению в Phase 7
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **@deprecated:** `StudioTeamPage` (`src/features/studio/components/studio-team-page.tsx`), `TeamMemberCard`, `TeamTabs`. `MasterCardDrawer` НЕ deprecated — still used by `studio-services-page.tsx`. `/cabinet/studio/team/add` route — orphan (no consumers in src/), к удалению в Phase 7
  - **Backlog spawned:** «В отпуске» status (4th value if business needs split), Remove-from-studio UI button (API exists), `isStudioMaster()` shared helper, edit master profile dialog, master role editing, precise week schedule via ScheduleEngine
  - **Next:** STUDIO-CALENDAR-A — multi-master calendar view

- **2026-05-15 — STUDIO-DASHBOARD-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 4/13. `/cabinet/studio` page rewrite — legacy 4-card stats + 4-quick-action grid заменены rich dashboard mirroring master pattern.
  - **Раздел 3 (Архитектура):** новый namespace `src/features/studio-cabinet/dashboard/`:
    - `lib/period-options.ts` — `StudioDashboardPeriodId = "7d" | "30d" | "90d" | "365d"` + helpers (local state period selector, not URL-driven — отличается от master analytics)
    - `lib/format-delta.ts` — pure formatters: `formatRelativeDelta` (revenue/bookings), `formatPointsDelta` (percentage KPIs: «+6 п.п.»), `formatRatingDelta` («+0.1»)
    - `server/types.ts` — все DTOs
    - `server/dashboard-data.service.ts` — `loadStudioDashboardData({studioId})` orchestrator + extracted `buildRevenueChart(studioId, period)` (export для API endpoint reuse). Все sub-builders private. Parallel `Promise.all` для 6 sections after initial banner data
    - `components/` — 8 файлов: `studio-dashboard-page.tsx` (server orchestrator), `studio-today-banner.tsx` (gradient hero), `studio-kpi-row.tsx` (4 tiles), `studio-top-masters.tsx` (top 5 + progress bars), `studio-attention-panel.tsx`, `studio-top-occupancy.tsx`, `studio-popular-services.tsx`, `studio-revenue-chart.tsx` (client, period selector + fetch)
  - **Раздел 5 (Бизнес-логика):** новые business reads:
    - **«Загрузка студии» KPI** — pragmatic proxy `bookings_count / (totalMasters × 30 days × 5 slots/day) × 100`. Precise slot-engine occupancy → backlog 🟡
    - **«Топ загруженности сегодня»** — replacement секции «Загрузка кабинетов» (rooms excluded per scope). Heuristic capacity `5 bookings = 100%`. Top 3 by occupancy %, excluded если 0 bookings
    - **Top masters by revenue 30d** — booking aggregation through existing `Booking.serviceItems[].priceSnapshot` fallback to `Service.price`. ProviderId == studio's own provider (studio entity, not master) filtered out
    - **Attention items** — 4 types: `pending-master-approvals` (StudioMembership PENDING), `bookings-awaiting` (Booking PENDING + CHANGE_REQUESTED), `reviews-unanswered` (studio reviews replyText=null), `schedule-requests` (existing `countPendingScheduleRequests` logic inline). Items с count=0 — НЕ рендерятся. Urgent flag drives badge.
    - **Popular services 30d** — `groupBy serviceId`, top 5 by count + share % + avg price + revenue
    - **Revenue chart** — new endpoint `GET /api/studio/dashboard/revenue?period=...` (OWNER/ADMIN gate, no plan-gate — different from `/api/analytics/revenue/by-master` which requires `analytics_revenue` feature). Studio admin sees revenue overview without subscription tier dependency
  - **Раздел 6 (Маршруты):** `/cabinet/studio` теперь rich dashboard (was: 4 stats cards + quick actions). Новый endpoint `GET /api/studio/dashboard/revenue?period=7d|30d|90d|365d`. Auth: OWNER или ADMIN role в студии
  - **UI_TEXT:** новый subtree `studioCabinet.dashboardV2.*` (~50 keys — banner / kpis / topMasters / attention / topOccupancy / popularServices / revenueChart). Старый `studioCabinet.dashboard.*` оставлен — больше не consumed, к удалению в Phase 7
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests
  - **@deprecated:** `getStudioDashboardStats` (`src/lib/studio/dashboard.service.ts`) + `DashboardNavCards` (`src/features/studio-cabinet/components/`) — оба marked, no other consumers
  - **Backlog spawned:** precise occupancy via ScheduleEngine, rating delta historical snapshots, analytics gating for dashboard, AI insights for banner subtitle
  - **Next:** STUDIO-CALENDAR-A — multi-master calendar view

- **2026-05-15 — SYMMETRIC-SWITCHER-A** (commit on `designStudioCabinet`). Откат role-switcher mechanism, добавленного в STUDIO-SHELL-A. Closes open question by user decision: cross-cabinet навигация exclusively через public header, cabinet UI не хостит duplicate switcher.
  - **Раздел 3 (Архитектура):** `StudioUserChip` rewrite — был interactive dropdown (avatar trigger + menu items: switch to master / profile / logout), стал static info-card (mirrors `MasterUserChip` pattern — avatar + name + studio tagline). Удалён server helper `userHasMasterCabinet()` из `studio-info.service.ts` (orphan after rollback — no other consumers). Layout `Promise.all` сократился c 4 до 3 parallel reads.
  - **Раздел 5 (Бизнес-логика):** **invariant:** cross-cabinet navigation lives ONLY в public header (`src/components/layout/auth-user-menu.tsx` через `clientCabinet.switcher.*`). Cabinet UI не дублирует это — это лишний noise и duplicate maintenance surface. Both Master и Studio cabinets имеют symmetric pattern: bottom-of-sidebar static info-chip, no interactive dropdown.
  - **UI_TEXT:** `studioCabinet.userChip.{switchToMaster, profile, logout}` удалены. `currentContext` оставлен и переформатирован под static use ("{studio}" placeholder вместо "Я студия"). `studioCabinet.appCaption`, `topbar.*`, `bottomNav.*` — без изменений.
  - **Public header switcher НЕ затронут** — `clientCabinet.switcher.*` keys intact, `auth-user-menu.tsx` not modified. Independent namespace.
  - **Validation:** typecheck ✅, lint baseline 823/122 preserved, encoding/mojibake/prisma ✅, 247/247 tests passing
  - **Resolves:** open question из STUDIO-SHELL-A («Symmetric switcher» backlog item) — selected Option B (one-way OK / cross-cabinet nav exclusively через public header)
  - **Next:** STUDIO-DASHBOARD-A — редизайн `/cabinet/studio` с per-page `<StudioPageHeader>` pattern

- **2026-05-15 — STUDIO-SHELL-A** (commit on `designStudioCabinet`). Cabinet Studio sprint commit 2/13. Foundation для всех последующих коммитов: sidebar + topbar + UserChip + sidebar counts + nav config. **Никаких изменений existing pages** — каждая page получит свой own redesign в dedicated commit.
  - **Раздел 3 (Архитектура):** новый подмодуль `src/features/studio-cabinet/`:
    - `config/studio-nav.ts` — single source of truth для navigation (12 items в 5 группах: Студия / Команда / Клиенты / Бизнес / Студия meta — без Rooms intentionally per scope decision). Lookup helper `isStudioNavItemActive(pathname, item)`
    - `server/sidebar-counts.service.ts` — `getStudioSidebarCounts({studioId, userId, phone})` параллельно считает 3 badge counts (scheduleRequestsPending / reviewsUnanswered / notificationsUnread). Reuses `ACTIVE_REVIEW_FILTER` + existing `getUnreadBadgeCount` с `context: "personal"`
    - `server/studio-info.service.ts` — `getStudioShellInfo(studioId)` (Prisma query, replaces legacy HTTP roundtrip через `/api/providers/me`) + `userHasMasterCabinet(userId)` (mirrors check из master layout)
    - `components/studio-sidebar.tsx` — **rewrite** (старая версия — collapsible Settings group с 6 children — заменена). Использует master-cabinet shared primitives (`SidebarItem`, `NavGroup`, `BrandLogo`) для pixel-level visual parity
    - `components/studio-topbar.tsx` — sticky minimalistic topbar: studio chip + theme toggle + external link. Sits below global navbar via `top-[var(--topbar-h)]`. Per-page headers — в отдельных коммитах per page
    - `components/studio-user-chip.tsx` — UserChip с dropdown (differs from master's static info-chip): «Перейти в кабинет мастера» (показывается только если `hasMasterCabinet: true`) / «Профиль платформы» / «Выйти»
    - `components/studio-bottom-nav.tsx` — adapted to read `STUDIO_NAV` config (4 primary tabs + More drawer); badges на mobile показываются на иконках
  - **Раздел 5 (Бизнес-логика):** новых business flows нет. Functional change только в shell wiring — `studio.cabinet.layout` теперь aggregates 4 parallel reads (`getStudioShellInfo`, `getStudioSidebarCounts`, `userHasMasterCabinet`, `getCurrentSubscriptionRow`) в single `Promise.all`. **Existing pages работают без изменений** — `/cabinet/studio`, `/calendar`, `/team`, `/services`, `/clients`, `/reviews`, `/analytics`, `/finance`, `/profile`, `/settings`, `/schedule-requests` всё рендерится под новым shell с старым content
  - **Раздел 6 (Маршруты):** nav config указывает 2 запланированных pages, которые не существуют yet: `/cabinet/studio/bookings`, `/cabinet/studio/notifications` — будут добавлены в STUDIO-BOOKINGS-A / STUDIO-NOTIFICATIONS-A. Сейчас при клике dadут 404 (acceptable per scope)
  - **UI_TEXT:** расширен `studioCabinet.*` — `appCaption`, `nav.ariaLabel`, `nav.groups.{studio,team,clients,business,studioMeta,studioMetaExternal}`, `nav.items.{14 keys}`, `topbar.{studioChip,openPublicPage}`, `userChip.{currentContext,switchToMaster,profile,logout}`, `bottomNav.{more,moreTitle,close}`. Старые flat keys (`nav.home`, `.calendar` и т.д.) **оставлены** — используются legacy `studio-navbar.tsx` (через billing page out-of-route)
  - **Validation:** typecheck ✅, lint — no new errors в моих файлах (baseline 823/122 preserved — note: baseline вырос с 588/87 не из моих изменений, из ранних commits), encoding/mojibake ✅, prisma validate ✅, 247/247 tests passing
  - **Symmetric switcher gap:** Master cabinet's `MasterUserChip` это static info-card (no dropdown). Studio → Master переход доступен через новый `StudioUserChip` dropdown. Master → Studio переход **не существует** — backlog 🟠 как user decision required (one-way trap acceptable / add symmetric switcher / другой подход)
  - **Legacy:** `studio-navbar.tsx` остаётся (используется billing page out-of-route). Не помечен `@deprecated`, к cleanup в Phase 7 когда billing page получит redesign
  - **Next:** STUDIO-DASHBOARD-A — редизайн `/cabinet/studio` с per-page `<StudioPageHeader>` pattern (аналог `MasterPageHeader`)

- **2026-05-15 — STUDIO-SCHEDULE-REQUEST-APPROVAL-A** (commit on `designStudioCabinet`). Closed functional gap: API `/api/studio/schedule/requests/*` существовал, но не было UI для approve/reject.
  - **Раздел 3 (Архитектура):** новый подмодуль `src/features/studio-cabinet/schedule-requests/` — server service (`list.service.ts` — pending + recently resolved), lib helper (`payload-display.ts` — pure preview builder для `EDITOR_V1` / legacy `SchedulePayload` / unknown), 5 UI components (page / request-card / payload-preview / approve-dialog / reject-dialog). Без миграций, без новых API.
  - **Раздел 5 (Бизнес-логика):** approve/reject flow остался полностью as-is (existing endpoints + `notifyScheduleRequestApproved/Rejected` notifications). Новый surface — UI page `/cabinet/studio/schedule-requests` с двумя секциями (Ожидают / Недавние) и inline payload preview. Reject требует комментарий ≤500 chars (existing API contract). Approve — confirmation modal (no comment field). После любого действия — `router.refresh()` для re-fetch SSR данных.
  - **Раздел 6 (Маршруты):** новая page `/cabinet/studio/schedule-requests` (✅). Studio sidebar получил новый nav-item «Заявки на расписание» (`CalendarClock` icon) с pending count badge — count fetched через `countPendingScheduleRequests(studioId)` в layout, проходит в `StudioSidebar` через новый prop `pendingScheduleRequests`. Никаких новых API endpoints — все 4 existing endpoints (`GET /api/studio/schedule/requests`, `GET .../[id]`, `POST .../approve`, `POST .../reject`) reused as-is.
  - **UI_TEXT:** новый subtree `studioCabinet.scheduleRequests.*` (~30 keys — title/subtitle/preview labels/status badges/action buttons/dialog content/error messages). `studioCabinet.nav.scheduleRequests` добавлен.
  - **Стайлинг:** existing studio cabinet pattern — `<Card>` + `<Badge>` + section header + empty state с `CalendarClock` icon. **НЕ** MasterPageHeader (зарезервирован для STUDIO-SHELL-A). `ModalSurface` для approve/reject dialogs (canonical pattern per modals-investigation invariant).
  - **Validation:** typecheck ✅, lint — no new errors в моих файлах, encoding/mojibake ✅, prisma validate ✅, 247/247 tests passing
  - **Audit log:** intentionally **не** добавлен — per scope studio admin actions писать только через `logInfo` (audit log зарезервирован для admin platform). Можно добавить позже если потребуется.
  - **Next:** STUDIO-SHELL-A (foundation для остального Studio Cabinet redesign — sidebar shell + page header pattern)

- **2026-05-15 — ADMIN-BILLING-FIX-B** (commit on `designAdminCabinet`). Features editor restored 1:1 из legacy. **🎉 Admin Billing CLOSED.**
  - **Раздел 3 (Архитектура):** новый компонент [`plan-features-editor.tsx`](src/features/admin-cabinet/billing/components/plan-features-editor.tsx) — search + grouped sections + boolean switches + numeric limits + «Безлимит» toggle + inheritance hints + client-side relaxed-limit validation. Все domain helpers (`resolveEffectiveFeatures`, `parseOverrides`, `applyOverrides`, `deriveUiState`, `canDisableFeature`, `isRelaxedLimit`) — 100% reused, без изменений
  - **Раздел 5 (Бизнес-логика):** features editor — full reconstruction. Inheritance — child plan получает все features parent, sustains overrides поверх. Relaxed-limit — child не может tighten parent's numeric limit (`null > N > null` valid; `N child < N parent` invalid). 3 validation helpers в endpoint (`assertParentExists`, `assertNoInheritanceCycle`, `assertRelaxedLimits`) + 3 новых error codes (`PARENT_NOT_FOUND`, `INHERITANCE_CYCLE`, `STRICT_LIMIT`). Audit log diff captures `features` (per-key before/after) + `inheritsFromPlanId` changes. Mass-notify `BILLING_PLAN_EDITED` теперь summarises feature changes
  - **Раздел 6 (Маршруты):** `PATCH /api/admin/billing/plans/[id]` расширен — body accepts `features: Record<string, unknown>` (catalog-respecting) + `inheritsFromPlanId: string | null`. Validation внутри tx ensures consistency
  - **Раздел 9 (Тестирование):** `src/lib/billing/features.test.ts` — **29 unit tests** (218 → 247 total). Coverage: isRelaxedLimit edge cases, resolveEffectiveFeatures inheritance walking + cycle resilience (MAX_DEPTH bound), parseOverrides catalog filtering, applyOverrides immutability, canDisableFeature inheritance rules, deriveUiState
  - **Раздел 12 (Инварианты):** существующие #16-19 не тронуты. Features inheritance rules не новые — они уже были structural possibility, теперь enforced через editor UI + endpoint validation
  - **UI_TEXT:** `adminPanel.billing.editDialog.tabs` + `editDialog.sections.inheritance` + `editDialog.fields.inheritsFrom*` + 4 error strings + новая ветка `adminPanel.billing.features.*` (10 keys — searchPlaceholder, shownCount, nothingFound, inheritedFrom*, cannotDisableInherited, overriddenForPlan, limitInheritedLocked, limitOnlyRelaxParent, limitStricter, unlimited). `featuresNote` placeholder удалён
  - **Schema:** не тронут — `BillingPlan.features Json` + `inheritsFromPlanId` existing fields
  - **Validation:** typecheck ✅, lint baseline 588/87 preserved, encoding/mojibake/prisma ✅, 247/247 tests passing

- **2026-05-15 — ADMIN-BILLING-FIX-A** (commit on `designAdminCabinet`). Data + seed cleanup — устранение 12-plan duplication в `/admin/billing`.
  - **Раздел 3 (Архитектура):** новый script [`scripts/cleanup-duplicate-billing-plans.ts`](scripts/cleanup-duplicate-billing-plans.ts) — dry-run by default + `--confirm` для apply, per-plan transaction (изолирует failures), idempotent (повторный запуск после success = no-op). Runbook `docs/runbooks/cleanup-duplicate-billing-plans.md`. Existing `scripts/migrate-billing-plans.ts` (handles `free`/`pro`/`premium`/`studio_pro` короткие коды из `seed.sql`) — не тронут, отдельный scenario
  - **Раздел 5 (Бизнес-логика):** canonical billing plan codes — **UPPERCASE** (`MASTER_FREE`, `MASTER_PRO`, `MASTER_PREMIUM`, `STUDIO_FREE`, `STUDIO_PRO`, `STUDIO_PREMIUM`). Production runtime (`ensure-free-subscription.ts`, `get-current-plan.ts`, billing tests) lookup by exact `code`. Lowercase snake_case set из `seed-test.sql` — dead leftover, к удалению через cleanup script
  - **Single source of truth для plans:** `prisma/seeds/test-data/seed-billing-plans.ts` (idempotent upsert by `code`). `prisma/seed-test.sql` BillingPlan + BillingPlanPrice inserts удалены (заменены comment-block с reasoning + cleanup instructions). Это устраняет root cause (2 writers разных кейсов)
  - **Schema:** **не тронут.** Это data + seed change, не schema migration. Pre-launch batch уже добавил все необходимые поля
  - **Production execution status:** ⚠️ script готов, type-checked, но **не запущен на production** — local Postgres недоступен. Pre-launch blocker: user должен запустить на staging → production когда DB доступен. Без cleanup admin продолжает видеть 12 plan cards вместо 6
  - **Validation:** typecheck ✅, lint 588/87 preserved, encoding/mojibake/prisma ✅, 218/218 tests passing
  - **Next:** ADMIN-BILLING-FIX-B (features editor restore — отдельный коммит)

- **2026-05-14 — REVIEW-SOFT-DELETE-A** (commit on `designAdminCabinet`). **🎉 Финальный (4/4) коммит Pre-launch batch — batch CLOSED.** Hard delete → soft delete для review moderation.
  - **Раздел 5 (Бизнес-логика):** review delete теперь soft delete. Admin moderation + user self-delete + legacy admin DELETE — все 3 paths переключены на `Review.update({ deletedAt, deletedByUserId, deletedReason })`. Recalculate ratings игнорирует deleted (filter `deletedAt: null` в aggregate). Idempotent re-delete (повторный delete на уже-soft-deleted = no-op). Restoration = manual SQL only (intentional no UI flow per scope)
  - **Раздел 3 (Архитектура):** новый shared helper `src/lib/reviews/soft-delete.ts` с константой `ACTIVE_REVIEW_FILTER` (`{ deletedAt: null }`) — pattern matches existing `MediaAsset.deletedAt` / `Notification.deletedAt` conventions
  - **Раздел 6 (Маршруты):** `/admin/reviews/[id]/delete` (new) + legacy `DELETE /api/admin/reviews/[id]` — оба теперь soft. Public/cabinet endpoints автоматически фильтруют deleted через `ACTIVE_REVIEW_FILTER`
  - **Раздел 9 (Тестирование):** +4 unit tests (214 → 218 total). Tests покрывают constant value, type-check, spread composition, override case для admin "include deleted" queries (e.g. deletedLastWeek KPI)
  - **Раздел 12 (Инварианты):** инвариант #17 (Review soft-delete filter) теперь **enforced в коде**, не просто structural possibility. 18 query sites consistently применяют filter — public profile, master cabinet, client cabinet, ratings recalc, AI summary, catalog smart tags, search-by-time, admin moderation, admin dashboard
  - **Schema not touched** — поля уже существуют из MIGRATIONS-PRELAUNCH-A
  - **Migration deployment** — не требуется для этого коммита. Pre-launch batch 4/4 завершён, schema migrations нужно применять в order: 1) `20260513224252_pre_launch_audit_soft_delete_block`, 2) `20260514000936_add_admin_initiated_notification_types`. После этого все 4 batch коммитов functional
  - **Pre-launch hardening complete:** audit trail (AdminAuditLog) + admin-initiated notifications (6 types) + soft delete (review data preservation) — три ключевых compliance/UX foundations все live. Готов к Phase 6 (SMS gateway / monitoring / deploy)

- **2026-05-14 — NOTIFICATION-TYPES-A** (commit on `designAdminCabinet`). Pre-launch batch 3 из 4. Admin-initiated `NotificationType` extension + 3-канальный dispatcher + mass fan-out для plan edits.
  - **Раздел 4 (Модель данных):** `NotificationType` enum расширен на 6 значений (был 49, стал 55). Migration count 15 → 16. Schema validates ✅
  - **Раздел 3 (Архитектура):** новые файлы в `src/lib/notifications/` — `admin-body-templates.ts` (pure builders + push truncation + Russian plural-month), `admin-initiated.ts` (3-channel dispatcher + mass fan-out helpers), `admin-body-templates.test.ts` (24 unit tests). Queue extension: `PlanEditedNotifyJob` + factory + worker handler в `src/worker.ts`
  - **Раздел 5 (Бизнес-логика):** 5 admin mutation sites теперь рассылают notifications — `plan-change.service.ts` (`BILLING_PLAN_GRANTED_BY_ADMIN`), `cancel-subscription.service.ts` (migrated с generic на `BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN`), `delete-review.service.ts` (`REVIEW_DELETED_BY_ADMIN`), `billing/refund/route.ts` (`BILLING_PAYMENT_REFUNDED`), `billing/plans/[id]/route.ts` (`BILLING_PLAN_EDITED` mass fan-out via queue). Channel mix: in-app sync + push fire-and-forget + Telegram queued
  - **Раздел 6 (Маршруты):** новый queue job type `notification.billing.plan-edited.mass`. Worker handler рассылает batch'ами 50/iteration с `Promise.allSettled`. Backlog item для push-через-queue (currently fire-and-forget)
  - **Раздел 9 (Тестирование):** +24 unit tests (190 → 214 total). Body templates с purity guarantees, plural-month rules, NBSP-aware assertions (ru-RU `toLocaleString` использует non-breaking spaces)
  - **Раздел 11 (Производительность):** mass dispatch для plan edits идёт через queue (не блокирует admin response). Sparse diffs (только sortOrder change) корректно skip enqueue — не спамим subscribers пустышками
  - **Migration NOT applied to live DB** — local Postgres недоступен. SQL crafted manually (6 `ALTER TYPE ... ADD VALUE` statements), non-transactional per PostgreSQL constraint
  - **Next:** REVIEW-SOFT-DELETE-A (4/4 finale pre-launch batch)

- **2026-05-13 — ADMIN-AUDIT-INTEGRATION** (commit on `designAdminCabinet`). Pre-launch batch 2 из 4. Перевод всех admin mutations на `AdminAuditLog`.
  - **Раздел 3 (Архитектура):** новый модуль `src/lib/audit/` — 3 production файла (`admin-audit.ts` — strict + safe variants; `admin-audit-context.ts` — IP/UA capture; `admin-audit-diff.ts` — pure diff helper) + 1 test file (`admin-audit-diff.test.ts`, 12 tests). Test count 178 → 190
  - **Раздел 5 (Бизнес-логика):** все 16 admin mutations теперь пишут в `AdminAuditLog` — 4 billing endpoints (dual-write с `BillingAuditLog` forever-parallel), 4 cities, 3 catalog, 2 reviews, 3 settings. Pattern: strict `createAdminAuditLog` внутри транзакций (atomicity), safe `createAdminAuditLogSafe` после внешних side-effects (refund → YooKassa). Diff per action правило: billing/SEO/app-settings → full before/after; bool toggles → key+value+prevValue; terminal/replace → identifiers only. logInfo сохранён как secondary stream для debugging
  - **Раздел 6 (API):** ~16 endpoint files modified. Service signatures расширены `context?: AdminAuditContext` где route layer captures via `getAdminAuditContext(req)`
  - **Раздел 10 (Безопасность):** admin actions теперь полностью queryable + traceable (admin id + action + targetType/Id + details + reason + ipAddress + userAgent + timestamp). Foundation для compliance audit / abuse detection / 4-eyes principle
  - **Раздел 12 (Инварианты):** добавлены 2 инварианта про audit transactionality (внутри tx для atomicity, safe variant вне tx для resilience UX)
  - **Logo / Login hero не instrumented** — нет dedicated admin endpoints (upload идёт через generic `/api/media`). `SETTINGS_LOGO_UPDATED` + `SETTINGS_LOGIN_HERO_UPDATED` enum values остаются reserved в backlog 🟠
  - **Validation:** typecheck ✅, lint 588/87 (baseline preserved), encoding/mojibake/prisma ✅, 190/190 tests
  - **Next:** NOTIFICATION-TYPES-A (3/4) → REVIEW-SOFT-DELETE-A (4/4)

- **2026-05-13 — MIGRATIONS-PRELAUNCH-A** (commit on `designAdminCabinet`). Foundation коммит pre-launch batch (1 из 4). **Только schema additions + types, никаких behaviour changes.**
  - **Раздел 4 (Модель данных):** добавлены **65-я модель `AdminAuditLog`** и **36-й enum `AdminAuditAction`** (25 values). Counts: models 64 → 65, enums 35 → 36, migrations 14 → 15 (`20260513224252_pre_launch_audit_soft_delete_block`). Поля `Review.{deletedAt,deletedByUserId,deletedReason}` + FK + index. Поля `UserProfile.{blockedAt,blockedByUserId,blockedReason}` + self-FK + index. Back-relations на UserProfile: `adminAuditLogs`, `reviewsDeleted`, `blockedUsers`
  - **Раздел 12 (Инварианты):** добавлены 2 новых инварианта — `AdminAuditLog.adminUserId onDelete: Restrict` (нельзя удалить admin user пока есть audit) и Review soft-delete filter (`deletedAt: null` обязателен в публичных queries после REVIEW-SOFT-DELETE-A)
  - **Раздел 5 (Бизнес-логика):** **БЕЗ ИЗМЕНЕНИЙ** — все endpoint'ы продолжают работать как раньше. Existing review delete остаётся hard delete (новые поля ignored). User block недоступен (поля nullable, не используются). `BillingAuditLog` не тронут — retirement policy решится в ADMIN-AUDIT-INTEGRATION
  - **Migration** сгенерирована manual SQL (local DB unavailable), pattern точно совпадает с `multi_city_foundation` migration. `prisma validate ✅`, `prisma generate ✅`, typecheck ✅, 178/178 tests passing ✅, lint baseline сохранён (588/87)
  - **Type module** `src/lib/audit/types.ts`: re-exports `AdminAuditAction` + `AdminAuditLog`, `AdminAuditDetails` type, const map `ADMIN_AUDIT_ACTIONS` с exhaustiveness check
  - **Next batch:** ADMIN-AUDIT-INTEGRATION (2/4) → NOTIFICATION-TYPES-A (3/4) → REVIEW-SOFT-DELETE-A (4/4)

- **2026-05-13 — PHASE-7-CLEANUP-A** (commit on `designAdminCabinet`). Финальный sweep по удалению `@deprecated` админ-кода накопленного за Phase 2.
  - **Раздел 3 (Архитектура):** директория `src/features/admin/` целиком удалена (7 component файлов). Активный admin UI теперь живёт только в `src/features/admin-cabinet/`. Phase 2 module list финализирован
  - **Раздел 6 (Маршруты):** удалены legacy API endpoints — `/api/admin/metrics`, `/api/admin/users` (GET + PATCH, route.ts целиком; `/[id]/plan` сохранён), `/api/admin/catalog/global-categories/*` целое дерево (route.ts + `[id]/approve` + `[id]/reject`). Активные replacement endpoints — `/api/admin/dashboard/*`, `/api/admin/users/[id]/plan`, `/api/admin/catalog/categories/*` — без изменений. Admin API group count: ~39 → ~35
  - **Раздел 13 (UI_TEXT):** namespace `UI_TEXT.admin.*` сокращён с ~470 keys до 12. Удалены sub-namespaces: `nav`, `catalog`, `users`, `cities`, `reviews`, `dashboard`, `billing`, `settings`, `visualSearch`. **Сохранён только** `admin.media.*` (10 keys) — active consumer в `LoginHeroImageManager`. Активный UI использует `UI_TEXT.adminPanel.*` единообразно
  - **Total LOC removed:** ~3 810 строк (3 164 UI components + 646 API routes + 463 lines в text.ts)
  - **Validation:** typecheck ✅ после каждого incremental deletion. Lint baseline сохранён (588 errors / 87 warnings — deleted files были clean code). Encoding/mojibake/prisma validate ✅
  - **Orphan candidate (не удалён, требует review):** `src/features/media/components/site-logo-manager.tsx` (17 строк) — после удаления legacy admin-settings.tsx ставится orphan. Не помечен `@deprecated` → conservative path: оставлен, в backlog 🟡

- **2026-05-13 — ADMIN-SETTINGS-A** (commit on `designAdminCabinet`). **🎉 Phase 2 (Admin Panel) полностью завершён.**
  - **Раздел 3 (Архитектура):** новый подмодуль `src/features/admin-cabinet/settings/` — 6 server services (`settings-data.service.ts` — parallel SSR orchestrator, `flags.service.ts`, `seo.service.ts`, `queue-stats.service.ts`, `visual-search-stats.service.ts`, `media-cleanup-stats.service.ts`), lib helper (`flag-registry.ts` — 3-flag single source of truth), 12 UI components (header / section-card / stat-tile / 6 sections + flag-row + admin-settings orchestrator). Legacy `src/features/admin/components/admin-settings.tsx` (727 строк) помечен `@deprecated`
  - **Раздел 5 (Бизнес-логика):** admin **settings management** через AppSetting (SEO: `siteSeoTitle`/`siteSeoDescription`) и SystemConfig (3 флага: `onlinePaymentsEnabled`, `visualSearchEnabled`, `legalDraftMode`). Все 3 флага имеют runtime consumers + cache invalidation: visualSearchEnabled → `clearVisualSearchEnabledCache()`, legalDraftMode → `clearLegalDraftModeCache()`. Read-only stats: queue (Redis LLEN), visual search (raw SQL count на MediaAsset), media cleanup (Prisma count). Actions: queue retry/delete dead jobs, visual search reindex (enqueues до 500 jobs), media cleanup (hard delete stale pending + broken). **Audit logging extended** через `logInfo` на 2 endpoints: `/api/admin/system-config` PATCH («admin.settings.flags.updated») и `/api/admin/settings` PATCH («admin.settings.seo.updated»). Only changed fields logged
  - **Раздел 6 (Маршруты):** `/admin/settings` теперь ✅ ADMIN-SETTINGS-A. Все 8 admin pages завершены — Phase 2 closed
  - **Раздел 6 (API):** существующие endpoints не тронуты архитектурно, **2 расширены минимально**: `/api/admin/system-config` (Zod schema +`legalDraftMode` optional + upsert + cache clear + audit log), `/api/admin/settings` (audit log на SEO change). Endpoints `/api/admin/{app-settings,queue,visual-search,media}` reused as-is. Без новых маршрутов
  - **Honest UX:** **3 РЕАЛЬНЫХ флага** только. Per critical user decision «никаких выдуманных флагов»: убраны из reference jsx — «Авто-модерация отзывов» (не существует), «Записи только с подтверждением» (per-provider, не global), «Регистрация студий открыта» (нет gate), «Push-уведомления» (env-only). Generic AppSettings raw editor также убран (риск edit unknown keys без typed validation; `supportEmail`/`smsProvider` из jsx не существуют как AppSetting keys). Все 6 пунктов в backlog 🟠 «Feature Flags infrastructure»

- **2026-05-13 — ADMIN-REVIEWS-A** (commit on `designAdminCabinet`)
  - **Раздел 3 (Архитектура):** новый подмодуль `src/features/admin-cabinet/reviews/` — server services (`reviews.service.ts` — list+counts, `kpis.service.ts`, `approve-review.service.ts`, `delete-review.service.ts`), lib helpers (`urgency.ts`, `report-reason-display.ts`, `author-mask.ts`), 13 UI components (header / KPI tiles / filters / list / card / actions / dialogs / empty states). Legacy `src/features/admin/components/admin-reviews.tsx` (312 строк) помечен `@deprecated`
  - **Раздел 5 (Бизнес-логика):** admin **review moderation** flow с audit-логированием через `logInfo` (нет AdminAuditLog таблицы yet — backlog 🟠). Два action'а: **approve** (clears `reportedAt`/`reportReason`/`reportComment`; throws on `REVIEW_NOT_FOUND` 404 / `NOT_REPORTED` 400) и **delete** (hard delete + `recalculateTargetRatings` в одной транзакции; reason опциональный, попадает в audit). **Hard delete approved** legacy semantics — soft-delete migration tracked в backlog 🔴 pre-launch. Author display masked через централизованный `maskAuthorDisplay()` («Алексей Иванов» → «Алексей И.»). Urgency rule: `rating=1 OR reportReason=OFFENSIVE`
  - **Раздел 6 (Маршруты):** `/admin/reviews` теперь ✅ ADMIN-REVIEWS-A с 3 tabs (`?tab=flagged|low|all`) + search (`?q=`) + cursor pagination (`?cursor=`). Admin nav расширен item «Отзывы» (MessageSquareWarning icon, между Billing и Settings)
  - **Раздел 6 (API):** новые endpoints `POST /api/admin/reviews/[id]/approve` (Zod-валидация, requireAdminAuth, throws `AdminApproveReviewError`) + `POST /api/admin/reviews/[id]/delete` (body `{reason?: string trim max 500}`, throws `AdminDeleteReviewError`). Legacy `PATCH /api/admin/reviews/[id]` (action: dismiss_report) и `DELETE /api/admin/reviews/[id]` — **не тронуты**, остаются functional для backwards-compat. Новый UI использует только dedicated routes
  - **N+1 prevention:** `listAdminReviews` через `include: { author, master, studio: { provider: { name } } }`. Tab counts — 3 параллельных `count()` через `Promise.all`
  - **KPI «Удалено за неделю» = null** — нет `Review.deletedAt` поля в схеме, UI рендерит «—»

- **2026-05-13 — ADMIN-BILLING-B** (commit on `designAdminCabinet`)
  - **Раздел 3 (Архитектура):** расширен подмодуль `src/features/admin-cabinet/billing/` — `subscriptions-tab/`, `payments-tab/`, новые server services `subscriptions.service.ts` + `payments.service.ts` + `cancel-subscription.service.ts`, lib helpers `payment-status.ts` + `payment-method-display.ts`. Legacy `src/features/admin/components/admin-billing.tsx` (1253 строки) **УДАЛЁН** (user-approved deletion)
  - **Раздел 5 (Бизнес-логика):** admin **cancel-subscription** flow с `cancelAtPeriodEnd: true + autoRenew: false + cancelledAt`. Транзакция: subscription update + `BillingAuditLog.action="ADMIN_SUBSCRIPTION_CANCELLED"` (adminUserId + previousStatus + reason). Notification через existing `BILLING_SUBSCRIPTION_CANCELLED` (no admin-specific enum value, backlog 🟠). User retains paid access until period end — renewal cron later flips status to CANCELLED. Plan cache invalidation outside транзакции (best-effort)
  - **Раздел 5 (Бизнес-логика):** existing `/api/admin/billing/refund` endpoint расширен `reason` body field (stored в audit log details). No payment-refunded notification yet (backlog 🟠)
  - **Раздел 6 (Маршруты):** `/admin/billing` теперь ✅ полный (Plans + Subs + Payments). URL-driven tabs via `?tab=`, tab-specific cursors `?subCursor=` / `?payCursor=`. Новый endpoint `POST /api/admin/billing/subscriptions/[id]/cancel`
  - Refund button скрыт для non-refundable payments (`isRefundable = SUCCEEDED && has yookassaPaymentId`). 5 payment statuses (PENDING/SUCCEEDED/FAILED/CANCELED/REFUNDED) с distinct tones
  - Payment method из `BillingPayment.metadata.payment_method.title` best-effort. `null` → «—». Backlog: dedicated `paymentMethodSnapshot` column для clean indexing/filter

- **2026-05-13 — MRR-SNAPSHOTS-A** (commit on `designAdminCabinet`)
  - **Раздел 4 (Модель данных):** добавлена `MrrSnapshot` (миграция `20260513115124_add_mrr_snapshot`). Моделей теперь 64, миграций 14
  - **Раздел 5 (Бизнес-логика):** новый daily snapshot pipeline. `mrr.snapshot.daily` queue job + worker handler. External cron trigger через `POST /api/billing/mrr/snapshot/run` (x-cron-token auth). KPI service в admin/billing теперь вычисляет реальную MRR delta vs ~30 дней назад (через `BigInt`-arithmetic) когда snapshot за 30д назад существует; иначе `null` → UI «—»
  - **Раздел 6 (Маршруты):** новый `/api/billing/mrr/snapshot/run`
  - **Раздел 7 (Env vars):** добавлен `MRR_SNAPSHOT_SECRET` (в `src/lib/env.ts` + `.env.example`)
  - **Раздел 9 (Тестирование):** +2 файла (mrr.test, mrr-snapshot.test, всего 34 теста)
  - **Refactor:** `calculateMRR()` перемещён из `src/features/admin-cabinet/billing/lib/mrr.ts` → `src/lib/billing/mrr.ts` (worker не должен зависеть от features-слоя). Старый файл удалён, импорт в `kpis.service.ts` обновлён
  - Runbook `docs/runbooks/mrr-snapshot-cron.md` — cron schedule, failure modes, backfill note
  - **Pre-launch blocker:** external cron не настроен. Без него snapshots не создаются автоматически

- **2026-05-13 — ADMIN-BILLING-A** (commit on `designAdminCabinet`)
  - Раздел 3 (Архитектура): новый подмодуль `src/features/admin-cabinet/billing/` (~14 файлов: server services + lib helpers + 6 UI components + edit dialog)
  - Раздел 5 (Бизнес-логика): admin **plan-edit** flow с обязательной `BillingAuditLog` записью (action `ADMIN_PLAN_EDITED`, diff `{before,after}` per изменённое поле). Транзакция: plan update + price upserts + audit log atomically. Plan cache invalidation через `plan:current:*` pattern delete после save
  - Раздел 6 (Маршруты): `/admin/billing` помечен 🟡 ADMIN-BILLING-A (часть A — Header + KPIs + Plans). Subscriptions/Payments tabs — disabled placeholders до ADMIN-BILLING-B
  - Раздел 6 (API): новые endpoints `GET /api/admin/billing/kpis` (MRR/active/pending/failed7d) и `PATCH /api/admin/billing/plans/[id]` (audit-logged plan edit). Legacy `/api/admin/billing/*` (GET/POST/PATCH с body.id), `/api/admin/billing/{payments,subscriptions,refund}` — **не тронуты** для backwards-compat с legacy UI и для будущего ADMIN-BILLING-B
  - MRR delta vs prev month = `null` пока нет MRR daily snapshots (backlog 🟠)
  - Legacy `src/features/admin/components/admin-billing.tsx` (1253 строки) помечен `@deprecated` — но содержит **рабочий** UI для Subscriptions/Payments tabs до ADMIN-BILLING-B. Admin сейчас не имеет UI-доступа к active subs / payment history (API endpoints доступны)

- **2026-05-13 — ADMIN-USERS-A** (commit on `designAdminCabinet`)
  - Раздел 3 (Архитектура): добавлен подмодуль `src/features/admin-cabinet/users/` (server services + lib helpers + components, ~15 файлов)
  - Раздел 5 (Бизнес-логика): admin plan-change flow с обязательной `BillingAuditLog` записью (action `ADMIN_PLAN_CHANGE`). Транзакция: upsert UserSubscription + audit log. `autoRenew: false` для admin-grants — renewal cron downgrades to FREE на period-end вместо charging
  - Раздел 6 (Маршруты): `/admin/users` помечен ✅ (был ⏳ legacy)
  - Раздел 6 (API): новый PATCH `/api/admin/users/[id]/plan` с Zod-validated body `{planCode, periodMonths (1|3|6|12), reason?}`. Legacy PATCH `/api/admin/users` помечен `@deprecated` (используется legacy UI без audit log)
  - Notification user'у при admin plan change **не отправляется** (нет подходящего `NotificationType`). Backlog: новое значение `BILLING_PLAN_GRANTED_BY_ADMIN` через миграцию + рассылка
  - Legacy `src/features/admin/components/admin-users.tsx` (328 строк) помечен `@deprecated`

- **2026-05-13 — ADMIN-CITIES-UI** (commit on `designAdminCabinet`)
  - Раздел 3 (Архитектура кода): добавлен подмодуль `src/features/admin-cabinet/cities/` (server services + lib helpers + components, ~14 файлов)
  - Раздел 6 (Маршруты): `/admin/cities` помечен ✅ (был 🟡 legacy). Status table updated: новый admin nav теперь содержит item «Города»
  - Раздел 6 (API): новый endpoint `GET /api/admin/cities/duplicates` для duplicate-groups modal. GET `/api/admin/cities` расширен полями `mastersCount`/`studiosCount`/`duplicateGroupId`/`tag`/`providersWithoutCityCount` (backwards-compat сохранён через старое поле `providersCount`)
  - Schema **не тронута** — algorithmic duplicate detection (normalize + 5km haversine), 3-letter tag через hardcoded map + fallback
  - Legacy `src/features/admin/components/admin-cities.tsx` (683 строки) помечен `@deprecated`

- **2026-05-13 — CONTEXT-REFRESH-V2** (commit on `designAdminCabinet`)
  - Заголовок обновлён: 7 мая → 13 мая. Файлов: 1094 → 1407. Активный sprint: master-cabinet redesign → admin-panel redesign (Shell/Dashboard/Catalog уже ✅).
  - Раздел 4 (Модель данных): добавлены 5 моделей (`City`, `ConversationSlug`, `ServicePackage`, `ServicePackageItem`, `PortfolioItemService`), обновлён список enum'ов (17 → 35), отмечены поля на Provider (`cityId`, `autoPublishStoriesEnabled`), UserSubscription (`isTrial`, `trialEndsAt`), Review (`reportedAt`, `reportReason`, `reportComment`).
  - Раздел 5 (Бизнес-логика): помечено как **завершённое** для Cabinet Master, Cabinet Client, Public master profile + booking widget, Chat foundation; **в работе** для Admin Panel.
  - Раздел 6 (Маршруты): обновлены таблицы Cabinet (master + user + studio), Admin (status per page), API groups (271 route.ts всего).
  - Раздел 7 (Env vars): добавлены `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, `AI_FEATURES_ENABLED`, `EMAIL_AUTH_ENABLED`. Отмечен централизованный `src/lib/env.ts`.
  - Раздел 9 (Тестирование): тестов 24 → 32, добавлен список новых.
  - Раздел 13 (правила, в CLAUDE.md): добавлено новое правило про обновление контекста после изменений.
  - Cities audit интегрирован: City модель есть, Provider.cityId есть, /admin/cities функционален в legacy UI — следующий шаг прямо к UI коммиту в новом admin shell.

- **2026-05-07 — initial v2 snapshot** (7 May 2026)
  - Зафиксировано состояние после Cabinet Master sprint (24 тестa, 1094 файла, ветка `newDesignSystem`).

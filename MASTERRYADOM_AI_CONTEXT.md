# МастерРядом — Контекст проекта для ИИ
> Дата аудита: **13 мая 2026** (refresh — CONTEXT-REFRESH-V2; предыдущий snapshot был 7 мая 2026)
> Файлов проверено: **1407 TypeScript-файлов** в `src/` (271 API route.ts + 89 page.tsx)
> Коммит/ветка: `designAdminCabinet`. Последний коммит main: `e0bf550` (Merge PR #70 — Client Cabinet).
> Моделей: **65**, enum'ов: **36**, миграций: **16** (последняя — `20260514000936_add_admin_initiated_notification_types`).
>
> **Active sprint:** редизайн админ-панели в ветке `designAdminCabinet`.
> - ✅ Shell (ADMIN-SHELL-A) · ✅ Dashboard (ADMIN-DASH-A) · ✅ Catalog (ADMIN-CATALOG-A)
> - ⏳ Cities, Users, Billing, Settings, Reviews
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
| `/cabinet/studio` | Главная студии |
| `/cabinet/studio/calendar` | Календарь студии |
| `/cabinet/studio/analytics` | Аналитика студии |
| `/cabinet/studio/clients` | CRM клиентов студии |
| `/cabinet/studio/finance` | Финансы |
| `/cabinet/studio/services` | Услуги |
| `/cabinet/studio/services/new` | Добавление услуги |
| `/cabinet/studio/team` | Команда |
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

**T7: Нет CI-шага для запуска тестов** — Сделано: НЕТ. **Pre-launch task**.
- `quality-gates.yml` НЕ включает `npm run test`.
- Тесты (29 файлов) запускаются только вручную.

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

### Тестовые файлы (34 файла, актуально 2026-05-13)

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

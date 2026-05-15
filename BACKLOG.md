# BACKLOG.md — Отложенные задачи МастерРядом

> Этот файл — единое место для **всех** задач которые мы решили не делать сейчас.
> Каждый раз когда в обсуждении появляется новая deferred фича — добавляем сюда.
> Когда задача выполняется — переносится в «✅ Выполнено» с datestamp.

---

## ОРГАНИЗАЦИЯ

Задачи разделены по **категориям** и **приоритету**:
- 🔴 **Pre-launch blocker** — нельзя запустить production без этого
- 🟠 **High priority** — желательно до launch, можно сразу после
- 🟡 **Medium priority** — после launch когда будут реальные мастера
- 🔵 **Nice-to-have** — features которые приятно иметь, но не критичные

---

## 🗺 КАРТА REDESIGN РАБОТЫ

> Полный roadmap визуальной переработки. Один взгляд на то что осталось.

### ✅ Завершено
- [x] **Catalog** — каталог мастеров + favorites (22a/b)
- [x] **Cabinet Master shell** — sidebar + topbar + UserChip (23a)
- [x] **Cabinet Master dashboard** — KPIs, attention, today bookings (23b)
- [x] **Cabinet Master bookings** — kanban с 5 columns (24)
- [x] **Cabinet Master schedule** — week view (25a)
- [x] **Cabinet Master schedule settings** — все 5 tabs (25-settings-a/b/c, 25-FIX-A)
- [x] **Cabinet Master notifications** — backend split + full redesign (26-NOTIF-A1/A2)
- [x] **Cabinet Master clients (CRM)** — read-only + mutations (27a + 27b, коммит `84707fc`)
- [x] **Cabinet Master reviews** — actions + display + stats (`9d7bae9`)
- [x] **Cabinet Master analytics** — top services + insights engine (`9709943`)
- [x] **Cabinet Master profile + Account settings** — sub-routes notifications/security/account (`8c1edd5` + `f93d96e`)
- [x] **Cabinet Master model offers** — компоненты + service (`458643c`)
- [x] **Cabinet Master portfolio + services + service-packages** — full management UI
- [x] **Cabinet Client (полностью)** — bookings/favorites/messages/notifications/reviews/profile/settings/roles/faq/model-applications (`e0bf550` PR #70)
- [x] **Public master profile redesign** — `/u/[username]` (32a, `6a3c027`)
- [x] **Master booking widget** — `/u/[username]/booking` с guest checkout (32b, `548024f`)
- [x] **Chat foundation** — universal chat для master + client, opaque conversation slugs, SSE (33a, `9ad5edc`)
- [x] **Multi-city support** — City модель + detect-city + admin/cities UI (legacy) (`595fc44` + `7b20483`)
- [x] **Brand kit** — Logo + BrandLogo component (`d10688b`)
- [x] **Marketing pages** — about/how-it-works/how-to-book/become-master/partners/blog/faq/help redesigned (multiple commits)
- [x] **Stories rail** — auto-publish stories + viewer overlay + progress bar (multiple commits)
- [x] **Trial subscriptions** — 30-day onboarding gift + notifications (`a974529`)
- [x] **Email OTP** — opt-in flow + rate-limit (`60474af`)
- [x] **Review reports** — `reportedAt` + `reportReason` + UI components (`cd4b289`)
- [x] **Auto-renew subscriptions** — API + UI (`ea25519`)
- [x] **Email notifications** — settings + templates (`50a4ac6`)
- [x] **CORS middleware** + rate-limit responses (`41a8ff0`)
- [x] **Docker support** + CI/CD workflow (`15ecfcd`)
- [x] **ENV-DISCIPLINE migration** — `src/lib/env.ts` + `process.env.*` banned (`acac724`)
- [x] **Admin Panel Shell** — sidebar + topbar + UserChip (ADMIN-SHELL-A)
- [x] **Admin Dashboard content** — KPI + Charts + Live Feed + System Health (ADMIN-DASH-A)
- [x] **Admin Catalog** — модерация GlobalCategory (ADMIN-CATALOG-A)
- [x] **Admin Cities** — управление городами с algorithmic duplicate detection (ADMIN-CITIES-UI)
- [x] **Admin Users** — list + 5 role tiles + plan change через audit-logged endpoint (ADMIN-USERS-A)
- [x] **Admin Billing** — полностью: Header + KPIs + Plans tab (часть A) + Subscriptions tab + Payments tab + cancel/refund (часть B, ADMIN-BILLING-B)
- [x] **Admin Reviews** — модерация отзывов с approve/delete + audit logging (ADMIN-REVIEWS-A)
- [x] **Admin Settings** — logo/hero + system flags (3 real) + SEO + queue + visual search + media cleanup (ADMIN-SETTINGS-A). **🎉 Phase 2 (Admin Panel) полностью завершён**
- [x] **Phase 7 cleanup sweep (admin)** — удалены 7 legacy `src/features/admin/components/*` файлов (3 053 LOC) + 4 legacy API route файлов (591 LOC) + 463 dead-letter UI_TEXT keys в `admin.*` namespace (PHASE-7-CLEANUP-A)
- [x] **Pre-launch schema migrations (foundation)** — `AdminAuditLog` model + `AdminAuditAction` enum (25 values), `Review.{deletedAt,deletedByUserId,deletedReason}` поля + FK + index, `UserProfile.{blockedAt,blockedByUserId,blockedReason}` поля + FK + index (MIGRATIONS-PRELAUNCH-A). Integration в следующих 3 коммитах
- [x] **Admin Audit integration** — все 16 admin mutations пишут в `AdminAuditLog` через shared `src/lib/audit/` helper (`createAdminAuditLog` strict + `createAdminAuditLogSafe` для resilience-критичных мест). Billing endpoints — dual-write с `BillingAuditLog` (forever-parallel). IP + User-Agent capture best-effort. logInfo сохранён как secondary stream (ADMIN-AUDIT-INTEGRATION)
- [x] **Admin-initiated notification types + dispatch** — 6 новых `NotificationType` enum values (`BILLING_PLAN_GRANTED_BY_ADMIN`, `BILLING_PLAN_EDITED`, `BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN`, `BILLING_PAYMENT_REFUNDED`, `REVIEW_DELETED_BY_ADMIN`, `SUBSCRIPTION_GRANTED_BY_ADMIN`) + 3-канальный dispatcher (in-app + push + Telegram) + mass fan-out queue job для plan-edited. 5 integration sites: plan-change, plan-edit (mass), cancel-subscription, refund, delete-review. Body templates pure-functions с 21 unit-test (NOTIFICATION-TYPES-A)
- [x] **Review soft delete** — hard delete заменён на `deletedAt` mark в admin moderation + user self-delete paths. `ACTIVE_REVIEW_FILTER` constant применён в 18+ query sites (public profile / cabinet / ratings recalc / AI summary / catalog smart tags / search-by-time / admin moderation list + counts). KPI `deletedLastWeek` теперь real (был null placeholder). Idempotent re-delete. Restore = manual SQL only (no UI flow per scope) (REVIEW-SOFT-DELETE-A). **🎉 Pre-launch batch (4/4) closed.**
- [x] **Admin billing plans cleanup (data + seed)** — diagnostic script `scripts/cleanup-duplicate-billing-plans.ts` (dry-run default + `--confirm`, per-plan transaction, idempotent) собирает 12 plan rows → 6 канонических UPPERCASE. `prisma/seed-test.sql` BillingPlan + BillingPlanPrice inserts удалены (single source of truth = `prisma/seeds/test-data/seed-billing-plans.ts`). Runbook в `docs/runbooks/cleanup-duplicate-billing-plans.md`. **Execution требуется на production перед launch.** (ADMIN-BILLING-FIX-A)
- [x] **Admin billing features editor restored** — full reconstruction 1:1 из legacy: tab navigation (Основное / Возможности), inheritance select, search + grouped sections + per-feature rendering (boolean switch + numeric limit + «Безлимит»), inheritance hints, client-side relaxed-limit preview + server-side `assertRelaxedLimits` / `assertNoInheritanceCycle` / `assertParentExists`. Endpoint `PATCH /api/admin/billing/plans/[id]` расширен на `features` + `inheritsFromPlanId`. Audit log diff captures feature/inheritance changes, mass-notify `BILLING_PLAN_EDITED` теперь summarises feature changes. 29 unit tests на helpers (`isRelaxedLimit`, `resolveEffectiveFeatures`, `parseOverrides`, `applyOverrides`, `deriveUiState`, `canDisableFeature`, cycle resilience). `featuresNote` placeholder удалён (ADMIN-BILLING-FIX-B). **🎉 Admin Billing полностью завершён (A + B + FIX-A + FIX-B).**

### ⏳ Cabinet Studio (полный redesign отдельно)
- [ ] Calendar redesign (multi-master view)
- [ ] Team management (invites, roles, permissions)
- [ ] Studio bookings list
- [ ] Studio services & portfolio
- [ ] Studio analytics & finance
- [ ] Studio notifications integration в новый surface
- [ ] **При завершении:** удалить `master-schedule-editor.tsx` (legacy)

### ⏳ Public surfaces remaining
- [ ] **Studio public profile** `/providers/[id]` — единственное оставшееся из master/studio profiles
- [ ] **Catalog enhancements** — `slotPrecision` / `visibleSlotDays` integration (поля сохраняются, но публичная витрина их не использует)
- [ ] **Hot slots page** `/hot` redesign (вне redesign sprint'а)
- [ ] **Models offer page** `/models` redesign (есть functional UI)
- [ ] **Inspiration feed** `/inspiration` redesign
- [ ] **Pricing page** `/pricing` redesign (остальные marketing pages — `/about`, `/how-it-works`, `/how-to-book`, `/become-master` ✅ сделаны)

### ⏳ Chat enhancements (foundation уже сделана)
- [ ] **Image attachments** в chat
- [ ] **Read receipts** + typing indicators
- [ ] **Booking chat ↔ universal chat** consolidation — сейчас BookingChat и universal chat живут отдельно; рассмотреть слияние

### ⏳ После всех redesigns
- [ ] **🧹 Legacy cleanup sweep** — удалить все @deprecated файлы, unused imports, dead code paths

---

## 🔴 PRE-LAUNCH BLOCKERS

### Безопасность
- **OTP в логах (P1)** — sms gateway не подключён, OTP code пишется в console.log. Подключить SMS-шлюз и убрать `code` из логирования
- **VAPID `!` non-null assertion (P2)** — push initialization упадёт если ключи не заданы
- **OTP rate-limit fail-closed (P3)** — sensitive routes должны быть fail-closed при недоступности Redis
- **JWT key rotation** — нет поддержки нескольких секретов для плавной ротации

### Инфраструктура
- **Middleware (T6)** — нет глобального Next.js middleware для проверки авторизации на уровне роутов
- **CI tests (T7)** — quality-gates.yml НЕ запускает `npm run test`
- **Supervisor для воркера** — при падении воркера задачи накапливаются без обработки
- **Production env vars** — checklist (DATABASE_URL pgbouncer, REDIS_URL TLS, S3 keys, all secrets generated, VAPID keys)
- **Yandex Cloud deployment** — DEPLOY_GUIDE.md существует, нужно пройти его до конца
- **Backup стратегия** — Object Storage lifecycle 30 days, но **тестировали ли restore?**
- **Monitoring** — basic alerts настроены (CPU/RAM/disk/DB connections), но нужна прогон production-like нагрузки

### SMS gateway
- **Подключить реальный SMS-шлюз** — SMSC, SMS.ru, Mobizon (для KZ). OTP без SMS = launch impossible. Admin dashboard показывает «Не настроен» с красным индикатором (ADMIN-DASH-A)
- **Тестировать OTP delivery** — multiple operators (Beeline/MTS/Megafon RU + Beeline/Tele2/Activ KZ)

### Email infrastructure
- **SMTP сейчас используется только для support tickets** — нужна для billing notifications, password reset, etc.
- **Email templates** — currently raw text, нужны HTML templates с branding

### Первые мастера
- **Onboarding документация** — как мастер регистрируется, заполняет профиль, добавляет услуги
- **Видео-гайды** или screenshots для первых users
- **Support флоу** — кто отвечает на тикеты, SLA

### Из ADMIN-DASH-A audit
- **Модель жалоб (Complaint/ReviewReport)** — для admin модерации отзывов. Если её нет в схеме сейчас, нужна перед launch чтобы admin мог модерировать жалобы (Phase 6)

### Из ADMIN-BILLING-FIX-A (2026-05-15)
- **Запустить `cleanup-duplicate-billing-plans.ts --confirm` на production** — без этого `/admin/billing` показывает 12 plan cards вместо 6, и lowercase rows остаются dead data. Run flow: dry-run → review → `--confirm`. Runbook: `docs/runbooks/cleanup-duplicate-billing-plans.md`. Idempotent — повторный запуск после success = no-op
- **Short-code leftovers review** — если production DB содержит `free`/`pro`/`premium`/`studio_pro` (старые seed.sql rows), запустить `scripts/migrate-billing-plans.ts` ПЕРЕД cleanup script'ом. Cleanup сам их report'нет (detection-only), но переименовать не сможет (mixing rename+delete в одном скрипте опасно)

---

## 🟠 HIGH PRIORITY (после core master cabinet)

### Booking flow enforcement
Поля сохраняются в БД (из 25-settings-b), но **enforcement** в createBooking не реализован:
- `Provider.minBookingHoursAhead` — отказывать в записи если время слишком близко
- `Provider.maxBookingDaysAhead` — отказывать если время слишком далеко
- `Provider.acceptNewClients=false` — отказывать новым клиентам если выключено

### Public catalog filtering
Backend filters только по `isPublished`. Новые поля доступны через snapshot но **не используются** на витрине:
- `Provider.slotPrecision` — что показывать в карточке (точное время / сегодня свободно / только дата)
- `Provider.visibleSlotDays` — глубина видимого расписания (3/7/14/30)

### Test coverage
- **Тесты для billing** — `src/lib/billing/*` без тестов (платежи!)
- **Тесты для bookings** — частично покрыты, нужны для createBooking, cancellation
- **Тесты для visual-search** — нет
- **Тесты для deletion** — нет
- **E2E тесты** — Playwright/Cypress отсутствуют
- **Тесты в CI** — добавить `npm run test` в quality-gates.yml

### Yandex maps integration
- **Geocoder/Suggest API keys** — настроены, но какие лимиты quota у Yandex?
- **Fallback** если API недоступен (graceful degradation)

### Из ADMIN-SHELL-A audit
- **RBAC аудит на `/api/admin/*`** — `(admin)/layout.tsx` защищён, но каждый endpoint должен иметь свою проверку. Out of scope ADMIN-SHELL-A. Phase 6 hardening

### Из ADMIN-DASH-A audit (после выполнения)
- **APM / реальный мониторинг (API uptime + p95 response time)** — сейчас admin health показывает «—» для этих метрик. Подключить Prometheus/Sentry/Yandex Cloud Monitoring. Phase 6

---

## 🟡 MEDIUM PRIORITY

### Late cancel CRM tracking
Поле `lateCancelAction = "fine"` сохраняется (из 25-FIX-A), label «отметить в CRM», но **enforcement** требует:
- Tracking late cancels в ClientCard
- Counter «отмен за последние N дней»
- Visual hint при бронировании этим клиентом
- Будет реализовано вместе с CRM redesign

### Online payments + штрафы
- Реальная оплата штрафов при late cancel (когда подключим payment infra)
- Online prepayment flow
- Refund flow

### Manual finish booking endpoint
Master хочет mark FINISHED **до** endAt time. Сейчас endpoint требует endAt в прошлом.

### Anonymization vs deletion
- Section 8 риск: для master/studio много `deleteMany` вместо anonymization
- При GDPR/152-ФЗ запросах — нужна **анонимизация** для бронирований и отзывов
- User-account уже анонимизируется, расширить на provider entities

### Legacy admin code (из ADMIN-SHELL-A)
- **`UI_TEXT.admin.nav.*`** — dead-letter после ADMIN-SHELL-A. Удалить вместе с `admin-sidebar.tsx` (Phase 7 cleanup sweep)
- **`src/features/admin/components/admin-sidebar.tsx`** — `@deprecated`, к удалению в Phase 7 cleanup sweep
- **Дублирующие `<h1>` на admin-страницах** — старые page-headers под новым topbar title. Будут вычищены в per-page коммитах (ADMIN-DASH-A, ADMIN-USERS-A, etc.)

### Из ADMIN-CATALOG-A audit
- **`GlobalCategory.rejectionReason: String?`** — добавить миграцию. Сейчас reason при отклонении категории пишется только в `logInfo("admin.catalog.category.rejected", { reason, ... })` и в `Notification.body`/`payloadJson`, но **не сохраняется в схеме**. Backlog item: переместить reason на колонку модели, появится «История модерации»
- **Cycle detection unit tests** — `wouldCreateCycle()` в `/api/admin/catalog/categories/route.ts` и `[id]/route.ts` реализован дважды (дубликат логики). Нет тестов. Phase 6: вынести в shared helper + покрыть тестами
- **Удаление категорий с привязанными услугами** — DELETE endpoint **не существует**. Категории нельзя удалять, только REJECTED-статус. Если потребуется удаление: `Service.globalCategoryId` имеет `onDelete: SetNull`, безопасно
- **Legacy admin catalog endpoints** — `src/features/admin/components/admin-catalog.tsx` и весь `/api/admin/catalog/global-categories/*` помечены `@deprecated`. К удалению в Phase 7 cleanup sweep. Также `UI_TEXT.admin.catalog.*` после full deprecation
- **Дублирующая логика wouldCreateCycle** между POST `/categories` и PATCH `/[id]` — обе имеют свою копию. Phase 7 cleanup: extract в `src/lib/catalog/cycle-detection.ts`

### Из ADMIN-CITIES-UI audit (2026-05-13)

🟠 **High priority:**
- **`City.region` поле + расширение `geocodeWithLocality()` для province** — сейчас регион в новом UI скрыт (колонка не выводится). Yandex возвращает `province` в Address.Components, но не сохраняется. Phase 6: миграция + backfill через `scripts/backfill-cities-from-addresses.ts`
- **Provider без cityId — bulk geocoding action** — admin/cities header показывает count «N провайдеров без города», но без resolve-flow. Phase 6: admin button «Запустить geocoding» → re-run `detectCityFromAddress` на всех `cityId IS NULL` providers, throttled аналогично существующему backfill script

🟡 **Medium priority:**
- **`City.tag` поле для кастомных кодов** — сейчас hardcoded map топ-30 RU/KZ городов + fallback `slug.replace(/-/g,"").slice(0,3).toUpperCase()`. Если admin захочет кастомный код для регионального города (например, «Сочи» → `SCH` уже захардкожено, но для других — нет UI override). Миграция + UI field
- **`@deprecated` legacy AdminCities** — `src/features/admin/components/admin-cities.tsx` после ADMIN-CITIES-UI. Phase 7 cleanup sweep. Также `UI_TEXT.admin.cities.*` (~80 keys)
- **Duplicate detection cache** — сейчас `findDuplicateGroups()` пересчитывается на каждый list-request (O(n²) для geo pass). При <100 городах OK; при росте — Redis cache TTL 60s, invalidate при CUD operations
- **Selected city URL state + filter conflict** — если admin выбрал city, потом сменил status filter и выбранный город не подходит под фильтр, `?selected=` остаётся в URL. Detail panel показывает stale city. Сейчас CitiesFilters сбрасывает `?selected=` при смене tab, но не при изменении search

🔵 **Nice-to-have:**
- **Drag & drop sortOrder** в admin/cities — сейчас Input number в edit form, неудобно для переупорядочивания топ-10 cities
- **Bulk action: hide/show selected** — checkbox column + bulk toolbar для массового скрытия городов одной операцией
- **Region grouping в UI** — после добавления City.region группировать таблицу по региону (collapse/expand)
- **City import from CSV** — для масс-загрузки городов (с lat/lng/timezone columns)
- **Provider listing по городу** — drill-down в detail panel: показать топ-10 providers в выбранном городе с переходом в `/admin/users` filtered by city
- **Map preview в detail panel** — `next/image` с Yandex Static Maps API для preview координат
- **Levenshtein-based duplicate detection** — текущий algorithmic pass находит exact-normalize и geo-proximity дубли, но не «опечатки» типа «Кранодар»/«Краснодар». Levenshtein ≤ 2 без geo proximity

### Из ADMIN-USERS-A audit (2026-05-13)

🔴 **Pre-launch blockers:**
- **Admin plan grant без caps / approval workflow** — admin одним кликом выдаёт Premium на 12 месяцев без проверки. Нужна policy: rate-limit, mandatory reason для не-FREE планов, требование SUPERADMIN для PREMIUM, дневной cap. Phase 6
- **BillingAuditLog retention** — записи admin-actions хранятся, но нет TTL/архива. При росте таблицы — нужна стратегия (90 дней горячие данные + cold storage)

🟠 **High priority:**
- ~~**`NotificationType.BILLING_PLAN_GRANTED_BY_ADMIN`**~~ ✅ выполнено в NOTIFICATION-TYPES-A (2026-05-14). Enum + dispatch через `dispatchAdminInitiatedNotification` (in-app + push + Telegram). Body — `buildPlanGrantedBody({planName, periodMonths, reason})`
- **Block / Unblock account** — 🟡 **partial done**: schema migration выполнена в MIGRATIONS-PRELAUNCH-A (`blockedAt`/`blockedByUserId`/`blockedReason` + self-FK + index). **Остаётся:** UI flow (More menu в admin users list) + endpoints `POST /api/admin/users/[id]/block` + `/unblock` + behaviour gate в auth middleware (login refusal для blocked users) + mutation rejection в `requireAuth()`. Отдельный коммит после MIGRATIONS batch'а
- **Detail-страница `/admin/users/[id]`** — eye-icon из reference вёл сюда, в commit убран. Backlog: timeline + bookings + payments + audit-log view + impersonate
- **Impersonate / "Login as user"** — для debugging-ситуаций, отдельный flow + audit trail

🟡 **Medium priority:**
- **Legacy `@deprecated` после ADMIN-USERS-A** — `src/features/admin/components/admin-users.tsx` (328 строк) + PATCH `/api/admin/users` (sans audit log) + `UI_TEXT.admin.users.*` keys. Phase 7 cleanup
- **N+1 city resolve edge case** — текущий запрос tak ke `providers: { take: 1, select: { city } }` загружает первого провайдера user'а. Master с несколькими providers (рарко) увидит произвольный город. Точное поведение нужно или per-role логика (master → masterProvider.city, studio admin → owned studio.city). Phase 6 refinement
- **Plan change idempotency** — при кликах быстро подряд можно создать дубль audit-log записей. Нужен idempotency key или debounce
- **Pagination jump-to-page** — сейчас cursor only «Load more». Нет skip-to-last или page numbers
- **Создание пользователя через admin** — endpoint не существует, регистрация только через OTP. Если потребуется invite-flow (admin → email → user accepts) — backlog
- **Экспорт CSV** — отказались в этом коммите, может потребоваться при росте user base

🔵 **Nice-to-have:**
- **Trial extension** через admin — отдельный action в Plan dialog «Продлить trial»
- **Bulk plan change** — assign Premium всем PRO в одном городе одной операцией
- **User notes** — admin может оставлять заметки на профиле user'а (schema migration: новая таблица AdminUserNote)
- **User activity timeline** — последние логины, бронирования, изменения plan
- **Avatar upload** для admin-created users
- **Saved filters** — admin сохраняет «PRO masters in Moscow» как preset
- **Last seen / online status** — индикатор активности

### Из ADMIN-BILLING-A audit (2026-05-13)

🔴 **Pre-launch blockers:**
- **Admin plan-edit cap / 4-eyes principle** — admin одним кликом меняет цену тарифа, и эта цена немедленно применяется ко всем новым подпискам. Нет approval workflow / mandatory reason / rate-limit. Phase 6
- **Plan price change повлияет на active subscriptions** — текущая семантика: новая цена влияет только на следующее списание. Но features (которые сейчас не editable in this commit) могут урезаться немедленно. Документировать semantics

🟠 **High priority:**
- ~~MRR daily snapshots~~ ✅ выполнено в MRR-SNAPSHOTS-A (2026-05-13)
- ~~**Subscribers notification при price/features change**~~ ✅ выполнено в NOTIFICATION-TYPES-A (2026-05-14). Финальное имя — `NotificationType.BILLING_PLAN_EDITED`. Mass fan-out через queue job `notification.billing.plan-edited.mass` (worker рассылает batch'ами по 50, `Promise.allSettled`). Sparse diffs (только sortOrder) корректно пропускают enqueue
- ~~**Features editor в admin UI**~~ ✅ выполнено в ADMIN-BILLING-FIX-B (2026-05-15). Reconstruction 1:1 из legacy через `plan-features-editor.tsx` + endpoint extension + 29 unit tests
- ~~Subscriptions / Payments tabs unreachable~~ ✅ выполнено в ADMIN-BILLING-B (2026-05-13)

🟡 **Medium priority:**
- **Plan versioning** — если меняется price/features, old subscribers могут быть на старой версии (или auto-migrated). Сейчас нет концепта версии плана. Phase 6
- **Unit tests для `calculateMRR`** + `kpi-tone.ts` + `kopeks.ts` — pure functions, лёгкие тесты
- ~~Cancel subscription / refund actions~~ ✅ выполнено в ADMIN-BILLING-B (2026-05-13)
- **`@deprecated` legacy admin-billing.tsx** + `UI_TEXT.admin.billing.*` — Phase 7 cleanup
- **Pricing semantics doc** — admin gift (autoRenew:false from ADMIN-USERS-A), regular subscriber (autoRenew:true), trial (isTrial:true) — три разных flow, в одной таблице. Документировать lifecycle для admin'ов

🔵 **Nice-to-have:**
- **Создание новых планов** через UI (сейчас только edit existing). POST endpoint уже работает, нужен UI
- **Plan archive / soft-delete** для unused планов
- **Subscribers drill-down** — клик на «N активных» → переход к `/admin/users?plan=<code>` filtered list
- **MRR breakdown** — by tier / by scope / by cohort
- **MRR forecast** — расчёт через 3 месяца при текущих trends
- **«Выгрузка для бухгалтера»** — CSV export подписок и платежей
- **POPULAR badge** настраиваемый — сейчас hardcoded PREMIUM tier, может быть admin-controlled
- **Features comparison table** — сравнение features через все 6 планов рядом

### Из MRR-SNAPSHOTS-A audit (2026-05-13)

🔴 **Pre-launch blockers:**
- **External cron setup для MRR snapshot** — endpoint `/api/billing/mrr/snapshot/run` готов + worker handler работает, но **без cron schedule snapshots не создаются автоматически**. Yandex Cloud Scheduler / GitHub Actions / любой внешний cron должен быть настроен **до launch** (см. `docs/runbooks/mrr-snapshot-cron.md`). Без этого admin никогда не увидит реальную MRR дельту — будет вечный «—»

🟠 **High priority:**
- **MRR breakdown by tier/scope** в snapshot — поле `breakdownJson` зарезервировано в схеме, заполнение в отдельном коммите когда понадобится drill-down («MRR by Premium Master» и т.п.)
- **MRR snapshot monitoring** — alert если snapshot за сегодня не создан до 12:00 UTC (cron силент failure signal). Через `MONITORING_TELEGRAM_*` env vars

🟡 **Medium priority:**
- **Backfill historical MRR** — для дат до запуска cron snapshots отсутствуют → admin увидит «—» в первые 30 дней после deployment. Возможен исторический backfill через `UserSubscription.startedAt` + audit log замеры, но сложно и неточно. Решение по необходимости
- **MRR snapshot retention** — 1 row/day = 365 rows/year. Acceptable. Но при добавлении hourly или per-tier snapshots — нужна retention policy (drop > 2 years)
- **Снапшоты race-condition stress test** — current implementation handles P2002 fallback, но edge-case под 100+ concurrent crons не покрыт

🔵 **Nice-to-have:**
- **Hourly snapshots** для real-time MRR tracking (если бизнес потребует)
- **MRR forecast** — линейная/экспоненциальная экстраполяция из historical snapshots
- **Snapshot diff UI** — admin может сравнить любые две даты в admin/billing
- **Cohort tracking** через snapshots (когорта мастеров, зарегистрировавшихся в данный месяц, через 3/6/12 мес)
- **Worker schedule helper** — internal helper to enqueue daily-recurring jobs (сейчас external cron; future могло бы быть внутреннее)

### Из REVIEW-SOFT-DELETE-A audit (2026-05-14)

🟡 **Medium priority:**
- **Permanent delete cron / retention** — soft-deleted reviews накапливаются вечно. Перед массовым launch нужна retention policy: после N дней (GDPR требует обычно 30-90 дней) `deletedAt < now-N days` → real DROP. Backlog: queue job `review.cleanup.permanent-delete` + worker handler. Аналогично `media.cleanup`
- **Re-leave review после admin removal** — если admin удалил отзыв клиента, клиент сейчас не может оставить новый на тот же booking (unique constraint на `bookingId`). UX-вопрос: либо разрешить re-leave (требует disambiguation бы между active/deleted в unique constraint), либо явно блокировать с сообщением «Отзыв был удалён администратором, повторно оставить нельзя». Сейчас silent block
- **Restore review UI flow** — отложено user-решением. Если когда-то понадобится: tab «Удалённые» в admin/reviews + restore action + `REVIEW_RESTORED` AdminAuditLog (enum value уже зарезервирован в MIGRATIONS-PRELAUNCH-A) + restore notification (новый `NotificationType`)
- **Display marker «Удалён администратором»** в author's cabinet — UX option вместо silent hiding. User видит свой отзыв с пометкой что админ его убрал + reason если есть
- **`Review.deletedByUserId` UI surfacing** — admin сейчас не видит **кто** удалил review (admin vs author vs legacy admin) в queryable way. AdminAuditLog имеет actor, но joining требует UI work. Backlog: добавить in `listAdminReviews` если соответствующий tab появится

🔵 **Nice-to-have:**
- **Bulk admin restore** — массовая операция для emergency rollback (например, если плохой админ удалил много отзывов)
- **Soft-delete history per target** — admin может посмотреть «все отзывы удалённые для master X» при разбирательстве жалоб
- **Author-friendly «My deleted reviews» tab** — отдельно от active reviews, transparency option
- **Notification «Ваш отзыв восстановлен»** — если когда-то добавим restore UI flow

### Из ADMIN-BILLING-FIX-B audit (2026-05-15)

🔴 **Pre-launch blocker:**
- **Прописать prices для 6 UPPERCASE планов** — после FIX-A cleanup планы могут остаться без `BillingPlanPrice`. Без цен — checkout не работает (`/api/billing/checkout` падает на `priceKopeks` lookup). **Явный launch step**: открыть `/admin/billing` → каждый план Edit → tab Основное → ввести цены 1/3/6/12 месяцев → Save. Альтернативно: extend `seed-billing-plans.ts` упсертить prices

🟡 **Medium priority:**
- **Create plan через UI** — features editor готов, но dialog только edit. Расширить с `create` mode: добавить required `code` field (с `LIVE_PLAN_CODE_PATTERN` validation), `tier`/`scope` select. Endpoint уже есть (`POST /api/admin/billing` legacy, или новый dedicated). Без этого admin не может создать новый PRO+ tier без direct SQL
- **Features diff visualization в AdminAuditLog viewer** — admin может посмотреть какие именно feature keys изменились + before/after когда AdminAuditLog UI viewer landed (backlog 🟠 из ADMIN-AUDIT-INTEGRATION)
- **Bulk feature toggle** — изменить feature key across multiple plans одной операцией (например, выключить `hotSlots` глобально). Сейчас admin делает по одному плану
- **Inheritance graph visualization** — admin видит chain (`PREMIUM → PRO → FREE`) визуально, а не через select. Useful когда appears 5+ planов

🔵 **Nice-to-have:**
- **Feature catalog editor** — `FEATURE_CATALOG` сейчас hardcoded. Move в DB (новая `FeatureDefinition` модель) → admin может добавлять features без deploy
- **Plan templates / clone** — duplicate существующий plan with all features → admin делает variant
- **Feature deprecation warnings** — если feature key больше не используется в runtime коде, admin видит warning в editor («No runtime consumer — toggle has no effect»)
- **Features search by status** — filter «only planned» / «only active» — для overview catalog state

### Из ADMIN-BILLING-FIX-A audit (2026-05-15)

🟡 **Medium priority:**
- **Visual indicator «Скрыт» для `isActive: false` plans в `/admin/billing`** — admin сейчас видит inactive plans без визуального сигнала (по решению user'а — фильтр в `listAdminPlans` НЕ добавляем, admin должен видеть disabled чтобы re-enable). Backlog: добавить grayscale + «Скрыт» badge на card
- **Seed consolidation policy** — сейчас 3 параллельных seed pipelines (`seed.sql`, `seed-test.sql`, TypeScript `seeds/test-data/index.ts`). ADMIN-BILLING-FIX-A очистил BillingPlan из `seed-test.sql`, но другие models могут страдать similar drift. Audit всех `INSERT INTO` в SQL-seeds → сверить с TS upsert seeds → consolidate
- **Цены plan-обновлений после cleanup** — UPPERCASE plans seeded через `seed-billing-plans.ts` создают только plan rows (без prices). После cleanup admin может обнаружить что у UPPERCASE plans **нет prices** (так как lowercase prices каскадно удаляются в cleanup). Backlog: либо расширить `seed-billing-plans.ts` для seeding prices, либо доппункт в cleanup script — перенести prices из lowercase в UPPERCASE если у UPPERCASE их нет
- **`code` case-insensitive unique constraint в БД** — защита на уровне Postgres от повторения такой ошибки. Варианты: `CREATE UNIQUE INDEX ON "BillingPlan" (LOWER(code))` (functional index) или migration в `citext` тип. Schema migration → отдельный коммит после launch

🔵 **Nice-to-have:**
- **Cleanup script — JSON output mode** (`--format=json`) для CI/CD integration (например, fail Yandex Cloud deployment если есть duplicates)
- **Auto-detection of plan duplicates** в `/admin/billing` page header — banner «Detected N lowercase plans, run cleanup» с link на runbook. Defensive UX
- **Plan history audit log read-only view** — admin может видеть когда plan создавался / изменялся (опираясь на `BillingAuditLog` + `AdminAuditLog`)

### Из NOTIFICATION-TYPES-A audit (2026-05-14)

🟠 **High priority:**
- **`REVIEW_REPORT_RESOLVED` notification type** — изначально в SCOPE спецификации, но **исключён по решению user'а** (ненужно для launch). После REVIEW-SOFT-DELETE-A + admin отзыв-репорта flow — если потребуется уведомлять репортёра о решении модератора, отдельная schema migration + dispatch site
- **Notification preferences (opt-out per type)** — user сейчас не может выключить отдельные типы admin-initiated notifications. Особенно `BILLING_PLAN_EDITED` (mass-dispatch при цене изменении). Schema: `NotificationPreference (userId, type, enabled)` или JSON column на UserProfile. UI на `/cabinet/settings/notifications`
- **Email channel для admin actions** — сейчас 3 канала (in-app + push + Telegram). Email для billing-critical actions (refund, plan-edited) — особенно для users без Telegram. Reuse existing SMTP config из support-tickets

🟡 **Medium priority:**
- **Push через queue для retry-ability** — сейчас `sendPushToUser` fire-and-forget (matches existing pattern). Если push delivery критично — добавить `notification.push.send` queue job с exponential backoff. Сейчас push failures только логируются
- **Notification digest** — batch множественных notifications для одного user в один daily/hourly summary. Особенно полезно для `BILLING_PLAN_EDITED` если admin делает несколько edits подряд (debouncing на enqueue layer)
- **Push opt-in flow** — для users без `pushSubscription`: попросить разрешение при first relevant admin action. Сейчас silently skipped
- **Mass dispatch throttling / rate-limit** — при plans с 10k+ subscribers Telegram API может rate-limit нас. `notification.billing.plan-edited.mass` сейчас рассылает batch'ами 50, но без задержек между batches. Backlog: добавить inter-batch sleep или token bucket
- **Notification preview/visibility settings для admin** — admin может посмотреть какой именно body отправится user'у перед save (preview modal)
- **`telegramLink.isEnabled` opt-in granularity** — сейчас Telegram link либо on либо off глобально. User может хотеть Telegram для booking notifications но не для billing. Phase 6 refinement
- **Notification cleanup job** — старые notifications (>90 days) можно cleanup'ить чтобы Notification table не росла. Сейчас retention неограниченный

🔵 **Nice-to-have:**
- **Rich preview для in-app `BILLING_PLAN_EDITED`** — показать diff inline в notification body (color-coded before/after)
- **Action buttons в push** ("Открыть billing" → opens specific page directly)
- **Localization** (RU + KZ + EN) — body templates сейчас hardcoded RU
- **Notification analytics** — open rate, click-through (для admin UX A/B testing)
- **Mass dispatch progress UI** — admin видит progress when плановое массовое уведомление в полёте (queue stats UI)
- **Custom admin reason templates** — pre-canned reasons для частых actions ("компенсация", "нарушение условий" etc.)

### Из ADMIN-AUDIT-INTEGRATION audit (2026-05-13)

🟠 **High priority:**
- **Logo + Login hero audit instrumentation** — `SETTINGS_LOGO_UPDATED` + `SETTINGS_LOGIN_HERO_UPDATED` enum values уже в schema (MIGRATIONS-PRELAUNCH-A), но dedicated admin endpoints для upload не существуют. Media upload идёт через generic `POST /api/media` (entityType=SITE) в `src/lib/media/service.ts`. Нужно: либо instrument media service с entity-type filter (audit только при SITE+AVATAR/PORTFOLIO), либо создать dedicated `/api/admin/media/site-logo` + `/site-login-hero` endpoints как proxy. Без этого admin замены логотипа не оставляют queryable trail
- **Admin audit log UI viewer** — `/admin/audit-log` страница для просмотра истории. KPI: filter by action / admin / target / period, search в `details`/`reason` text. Foundation готова (queryable DB rows), нужен SSR UI page + service

🟡 **Medium priority:**
- **Audit log retention policy** — линейный рост таблицы. Стратегия: 1-2 года hot (online queries), затем move в cold storage (S3 export) или soft-delete с TTL drop. Решение принять до года-rolling production
- **Audit log monitoring / alerts** — Telegram alert при unusual activity: >N admin actions в час, sensitive actions (USER_ACCOUNT_DELETED, BILLING_PLAN_EDITED, SETTINGS_FLAG_TOGGLED для критичных flags). Через existing `MONITORING_TELEGRAM_*` env
- **BillingAuditLog data backfill в AdminAuditLog** — если бизнес позже решит unify таблицы, нужна data migration script. Сейчас forever-parallel, но обе сохраняют разное (BillingAuditLog имеет `subscriptionId`/`paymentId` колонки; AdminAuditLog только через `details` Json). Document decision в audit module README
- **Audit log export (CSV / JSON)** — для compliance audits / lawyer-readable trail. Period range + action filters
- **4-eyes principle для critical actions** — `BILLING_PLAN_EDITED`, `USER_ACCOUNT_DELETED`, premium grants > N rubles → required second admin approval. Schema может потребовать `AdminAuditLog.approvedBy?` field
- **Admin action rate-limiting** — defence против runaway scripts / compromised account. По adminUserId через existing rate-limit infra. Currently no protection

🔵 **Nice-to-have:**
- **Diff visualization UI** — color-coded before/after в audit log viewer (rouge для removed values, vert для new)
- **Replay / undo для reversible actions** — например, undo CITY_VERIFIED, undo SETTINGS_FLAG_TOGGLED. Не для terminal actions (USER_ACCOUNT_DELETED, REVIEW_DELETED)
- **Audit detail drill-down** — клик по audit row → детальная страница с full JSON + target preview
- **Webhook на critical audit events** — внешние systems (Slack/Discord) podscribe на certain actions
- **Action correlation IDs** — для multi-step actions (например, "City merge" = move providers + delete source) сейчас 1 audit row covers all; correlation id позволил бы trace всех related rows
- **Geo-IP enrichment** — резолвить ipAddress → country/city при audit display (offline lookup, не runtime)

### Из PHASE-7-CLEANUP-A audit (2026-05-13)

🟡 **Medium priority:**
- **Cascade cleanup: `SiteLogoManager`** (`src/features/media/components/site-logo-manager.tsx`, 17 строк) — orphan после удаления legacy admin-settings.tsx. Active admin-cabinet/settings/components/logo-section.tsx использует `AvatarEditor` напрямую, не `SiteLogoManager`. Удалить вместе с keys `UI_TEXT.admin.media.{siteLogoTitle,siteLogoDescription}` (станут dead после удаления компонента). НЕ делалось в этом коммите per scope rule «orphan без @deprecated marker → user review»
- **Migrate `LoginHeroImageManager` UI_TEXT** — сейчас компонент тянет `UI_TEXT.admin.media.*` (~10 keys: loadFailed/uploadFailed/deleteFailed/loginHeroTitle/loginHeroDescription/emptyImage/replaceImage/uploadImage/removeImage/focalPoint). Перенести в `UI_TEXT.adminPanel.settings.sections.loginHero.*` + удалить `UI_TEXT.admin.media.*` целиком. Чистая namespace migration без структурных изменений
- **Phase 7 sweep #2** — после Cabinet Studio sprint накопится новый legacy: текущий `src/features/cabinet/master/schedule/master-schedule-editor.tsx` (1 488 LOC `@deprecated`, оставлен потому что зависит от studio cabinet redesign) + всё что появится после studio refactor

🔵 **Nice-to-have:**
- **Other @deprecated finds (vне Phase 2 scope, не тронуты):** `src/components/billing/FeatureGate.tsx:15` (one prop `requiredPlan` deprecated, file активен), `src/features/catalog/components/category-pills.tsx` (intentionally kept «для будущих surfaces»), `src/components/ui/focal-image.tsx:60` (wrapper для legacy callsites — кто-то ещё импортирует?), `src/app/api/home/{stories,feed}/route.ts` + `src/lib/feed/stories.service.ts:191` (deprecated `listStoriesMasters` оставлен на migration period к `/api/feed/stories`). Все требуют отдельных audits — не в scope cleanup админки

### Из ADMIN-SETTINGS-A audit (2026-05-13)

🔴 **Pre-launch blockers:**
- **Feature Flags infrastructure** — epic. Текущее покрытие: 3 DB-backed флага (`onlinePaymentsEnabled`, `visualSearchEnabled`, `legalDraftMode`). Все остальные «feature gates» в коде — env vars или вообще hardcoded. Перед launch: (1) миграция env-based flags → SystemConfig (VISUAL_SEARCH_ENABLED уже в SystemConfig, PAYMENTS пока через env-computed); (2) runtime feature gate consumer pattern (cache invalidation как у `clearVisualSearchEnabledCache`); (3) обязательный audit log на каждый toggle (сейчас через `logInfo`); (4) admin UI для toggle (есть, расширять по мере добавления флагов); (5) rate-limit на admin flag changes
- ~~**AdminAuditLog модель**~~ ✅ выполнено в ADMIN-AUDIT-INTEGRATION (2026-05-13)

🟠 **High priority:**
- **«Авто-модерация отзывов» flag** — фичи нет в системе (ни env, ни SystemConfig, ни runtime consumer). Backlog: AI-pre-screening review reports через OpenAI/Anthropic API + score threshold + auto-hide или auto-flag для admin
- **«Записи только с подтверждением мастера» global flag** — сейчас `Provider.autoConfirmBookings` per-provider. Если бизнес-логика требует global override (например, отключить auto-confirm на всей платформе после инцидента) — добавить SystemConfig `globalAutoConfirmDisabled` + gate в `createBooking`
- **«Регистрация студий открыта» flag** — фичи нет; сейчас регистрация открыта всегда. Если бизнес-критично (например, во время инцидента закрыть регистрацию) — SystemConfig `studioRegistrationOpen` + gate в `/api/onboarding/professional/studio`
- **«Push notifications enabled» flag** — сейчас computed `isPushEnabled` (env-based: проверяет VAPID keys в `src/lib/env.ts`). Если нужен runtime kill-switch (не deploy) — SystemConfig + gate в notification dispatch
- **OG Image URL editor (SEO)** — сейчас не редактируется. Hardcoded в `src/app/layout.tsx` metadata или вообще отсутствует. Если потребуется — AppSetting `siteOgImageUrl` + runtime consumer в metadata + media-picker UI вместо raw URL
- **AppSetting bulk editor (raw key-value table)** — endpoint `/api/admin/app-settings` GET/PATCH существует, но в новом UI **не используется** (риск изменения unknown keys без typed validation). Сделать отдельный sub-page `/admin/settings/raw` с warning banner + admin-only access + audit log mandatory
- **SEO sublabel для description (max chars hint)** — нет UI индикатора оставшихся символов (240 max). UX nice-to-have, но при ручном вводе важно

🟡 **Medium priority:**
- **Visual search reindex progress UI** — сейчас POST enqueues до 500 jobs и возвращает success без отслеживания. Backlog: live progress через queue stats refresh + per-batch indicator
- **Visual search categorization stats** — endpoint `/api/admin/visual-search/stats` уже возвращает `byCategory` + `byPromptVersion`, но в новом UI только три tile показаны (total/indexed/notIndexed). Расширить: breakdown table per category + per prompt version
- **Media cleanup detail** — сейчас два tile (pending + broken). Endpoint возвращает также `staleBefore` timestamp — добавить в UI hint «Удалит файлы старше {date}»
- **Queue dead jobs bulk actions** — retry-all / delete-all per type. Сейчас по одной задаче
- **Queue stuck jobs detection** — сейчас admin видит pending/processing/dead, но если worker упал, processing > 0 может быть stuck. Добавить detection + alert
- **Logo + Login hero focal point picker** — focal points хранятся в SystemConfig (`siteLogoFocal`, `loginHeroImageFocal`) но в новом UI не редактируются через section card. Используется через existing `AvatarEditor` / `LoginHeroImageManager` components — focal picker уже внутри них
- **Settings change history (timeline)** — UI для просмотра audit log изменений настроек. Требует AdminAuditLog таблицы
- **Auto-refresh для queue/visual search/media** — сейчас manual refresh button. Polling 30s или SSE
- **Section reorder via drag** — admin может переупорядочить sections под свой workflow (persisted в user preferences)
- **Settings export / import (JSON)** — для disaster recovery: dump всех AppSetting + SystemConfig + media URLs в JSON, restore на новой среде
- **`@deprecated` legacy admin-settings.tsx** (727 строк) — Phase 7 cleanup sweep вместе с `UI_TEXT.admin.settings.*` (~80 keys)

🔵 **Nice-to-have:**
- **Logo crop tool inline** — сейчас upload + crop через AvatarEditor. Inline cropper в section card вместо modal
- **A/B testing для login hero** (multiple variants + traffic split percentage)
- **Theme override per platform** (white-label / multi-tenant branding — long-term)
- **Custom favicon upload** через AppSetting `siteFaviconAssetId`
- **Custom email-template headers** — branded email с logo, через AppSetting `emailHeaderHtml`
- **System health summary widget** — uptime, last deploy, last backup, last cron run всё в одной section card на `/admin/settings`
- **SMS provider switcher** — `smsProvider` (SMSC/SMS.ru/Mobizon) когда подключим SMS gateway. Сейчас провайдер не выбирается (OTP в логах). Тогда AppSetting + per-region failover

### Из ADMIN-REVIEWS-A audit (2026-05-13)

🔴 **Pre-launch blockers:**
- ~~**`Review.deletedAt` миграция (soft delete)**~~ ✅ выполнено в REVIEW-SOFT-DELETE-A (2026-05-14). Hard delete заменён на soft в admin + user paths, 18 query sites фильтруют `deletedAt: null`, ratings recalc игнорирует deleted, idempotent re-delete. Restoration = manual SQL (`UPDATE Review SET deletedAt = NULL`)

🟠 **High priority:**
- **`ReviewReport` модель для multi-reporter** — сейчас Review.reportedAt/reportReason/reportComment один-к-одному (последний reporter перезаписывает). При production-нагрузке множественные жалобы на один review должны храниться отдельно с user_id reporter'а, чтобы admin видел breakdown reasons + count + smart deduplication. Schema migration + миграция existing данных + API + UI redesign (column "Жалобы (N)" вместо single reason)
- ~~**`NotificationType.REVIEW_DELETED_BY_ADMIN`**~~ ✅ выполнено в NOTIFICATION-TYPES-A (2026-05-14). Enum + dispatch с автоматическим резолвом targetName (master.name или studio.provider.name) + reason. Body — `buildReviewDeletedByAdminBody`
- **`NotificationType.REVIEW_REPORT_RESOLVED`** — миграция enum + рассылка автору-репортёру при admin approve («Ваша жалоба рассмотрена, нарушений не найдено»). Закрывает loop репортёр ↔ модерация
- ~~**AdminAuditLog таблица**~~ ✅ выполнено в ADMIN-AUDIT-INTEGRATION (2026-05-13). Все 16 admin endpoints (billing/users/cities/catalog/reviews/settings) пишут в `AdminAuditLog` через shared helper. `BillingAuditLog` остаётся forever-parallel для billing — accepted decision

🟡 **Medium priority:**
- **Edit review endpoint** — UGC integrity tradeoff. Сейчас admin не может редактировать текст. Если потребуется (например, удаление persondata из отзыва вместо полного delete), нужна UGC policy: admin edit только masking sensitive data, audit log обязателен, original_text snapshot. Phase 6 после legal review
- **Advanced filters** — by date range, by reportReason value, by target type (master vs studio), by author. Сейчас 3 tab + search достаточно для MVP, при росте reviews нужно расширение
- **Urgency tuning** — `isUrgentReport` сейчас true для rating=1 OR reason=OFFENSIVE. При тюнинге по результатам real moderation: добавить rules (например, INAPPROPRIATE + ≥ 5 reports → critical, новый author + 1 review → low priority). Configuration через AppSetting key
- **Восстановление удалённых** — после `Review.deletedAt` migration: UI tab «Удалённые» + restore action. Currently impossible (hard delete)
- **Bulk approve / bulk delete** — checkbox column + bulk action toolbar. Сейчас по одной (admin spam-pattern fight requires bulk)
- **Inline reply от admin** — admin может оставить публичный ответ на review от имени System («Платформа: отзыв проверен модерацией, информация подтверждена»). Schema поддерживает `Review.replyText` сейчас занят master/studio ответом — нужно отдельное поле `systemReplyText` или JSON breakdown

🔵 **Nice-to-have:**
- **Deleted tab** — после `Review.deletedAt` migration: третий+ tab «Удалённые за период» с restore action
- **Drill-down на target/author** — клик на «Анна Соколова» → переход к `/admin/users?q=...` filtered; клик на «Анна (мастер)» → переход к `/u/<username>` или admin detail когда появится
- **Export CSV** — выгрузка для legal/compliance: все жалобы за период с rating + reason + comment + target + author + resolution status
- **Inline edit reportComment** для admin notes — на случай если admin хочет добавить internal moderation note (отдельное поле moderatorNote, не публичное)
- **Heatmap отчётов по дням недели / времени** — admin analytics: когда чаще всего жалуются (для tuning авто-модерации)

### Из ADMIN-BILLING-B audit (2026-05-13)

🟠 **High priority:**
- ~~**NotificationType `BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN`**~~ ✅ выполнено в NOTIFICATION-TYPES-A (2026-05-14). Cancel service переключён на новый type; user теперь чётко видит admin-cancel vs self-cancel. Body — `buildSubscriptionCancelledByAdminBody` с access-until date
- ~~**NotificationType `BILLING_PAYMENT_REFUNDED`**~~ ✅ выполнено в NOTIFICATION-TYPES-A (2026-05-14). Refund endpoint теперь dispatchит notification после успешного YooKassa refund (с защитой try/catch — failure не блокирует ответ). Body — `buildRefundBody` с amount + reason
- **`BillingPayment.paymentMethodSnapshot` поле** — payment method (Visa *4444, СБП) сейчас извлекается best-effort из `metadata.payment_method.title` blob. Snapshot column + индекс упростит admin UI («Не отображается способ» — частый сценарий) + позволит drill-down/filter

🟡 **Medium priority:**
- **Subscription filters** в UI (по plan tier, по auto-renew status, по статусу, search по user) — сейчас flat list для статусов ACTIVE/PAST_DUE
- **Payment filters** (period range, status, amount range)
- **Bulk cancel / bulk refund** — admin actions для массовых операций
- **Subscription history timeline** — drill-down показать changes (created, renewed, downgraded, cancelled) через BillingAuditLog
- **Failed payment manual retry** — кнопка для admin retry неудачный платёж
- **Refund для CANCELED/REFUNDED edge cases** — сейчас только SUCCEEDED, partial refund не поддерживается

🔵 **Nice-to-have:**
- **Subscription export CSV** (carryover из A)
- **Payment export CSV** (carryover из A)
- **Partial refund** — сейчас full only через `amountKopeks` body, UI не позволяет указать сумму
- **Payment method drill-down** — клик на «Visa *4444» → детали последних операций
- **Failed payment reason на row** — сейчас reason хранится в `metadata`, не сурфейсится. Стоит вытащить в `AdminPaymentRow.failureReason` после schema migration
- **Audit log viewer** — admin может посмотреть `BillingAuditLog` для конкретной подписки/платежа (history of admin actions)

---

## 🔵 NICE-TO-HAVE

### CRM features (после initial CRM)
- **Export CSV** — полный список клиентов с visits, LTV, contact info, tags
- **Импорт клиентов** — upload CSV/XLSX, batch create ClientCards
- **Промокоды** — generation, expiry, redemption tracking, anti-fraud
- **Client photos в карточке** — было в схеме (ClientCardPhoto)
- **Bulk actions** — assign tags, send promo, etc.
- **Client search filters** — by service, by date range, by tag

### Schedule features
- **Per-day schedule mode** — сейчас FLEXIBLE/FIXED глобально per provider. Когда понадобится — schema migration
- **Multiple intervals per day** — backend constraint, требует schema change
- **TEMPLATE exception type** — apply existing template как override (например, «летнее» расписание)
- **Live SSE updates** для schedule
- **D&D для schedule** — сейчас action menus (postponed)

### Catalog features
- **Smart tags real algorithm** — сейчас mock data. Реальный algorithm подсчёт popular services + dynamic tags
- **Visual search activation** — `VISUAL_SEARCH_ENABLED=true`, OpenAI embeddings + pgvector

### Marketing
- **/blog autoposting** — Telegram channel auto-publish
- **Showcase для разных Plans** — masters PREMIUM, FREE для visual comparison
- **Referral program** — мастер приглашает мастера, получает discount

### Notifications enhancements
- **«Особый день»** в exceptions (только постоянные клиенты) — требует schema migration
- **Multi-master notifications** — для studio notifications redesign
- **Email digest** — еженедельная сводка для master
- **Telegram bot improvements** — чат-команды, не только inbound notifications

### Mobile app
- **PWA уже работает** через Service Worker
- **Native iOS/Android** — отдельный large effort, post-launch

### Code quality
- **588 pre-existing lint errors** в кодовой базе — общий долг, не связан с admin-флоу (отмечено в ADMIN-SHELL-A)

### Admin Dashboard enhancements (из ADMIN-DASH-A)
- **Push notifications для admin events** — критичные события (отмены > N, жалобы, очередь > 500) → notification мастеру/админу в реальном времени
- **Период-toggle на charts** — 7д / 30д / 90д переключение. Пока только 7 дней
- **Drill-down с feed item** — клик по событию → детальная страница (booking detail, user profile, etc.)
- **Live SSE вместо polling** — заменить 5s polling на SSE-stream когда `src/lib/notifications/notifier.ts` будет расширен для admin-канала

### Admin Catalog enhancements (из ADMIN-CATALOG-A)
- **Bulk approve / bulk reject** для категорий — сейчас по одной, при росте каталога потребуется. UI: checkbox-колонка + action bar в header
- **История модерации** — кто/когда/почему. Нужна после добавления `rejectionReason` + audit log таблицы
- **Drag & drop для изменения parent** у категории — сейчас только через edit dialog
- **Slug auto-generation preview** при создании — сейчас slug генерится server-side из `name`, в UI не виден
- **Denormalised counts** (services/providers per category) через триггеры или materialized view — сейчас два `groupBy` per list request. OK при <1000 категорий, но переоценить при росте
- **Inline edit для name + parent** — pencil-icon → contenteditable вместо modal. Соответствует SKILL.md inline-edit паттерну для cabinet, но admin moderation surface — отдельный mental model (modal OK)
- **Telemetry на категории** — views, conversion rate (% сервисов где была выбрана), drill-down в master analytics

---

## ✅ ВЫПОЛНЕНО (для истории)

> Перенос задач сюда происходит при их завершении, с datestamp.

### 2026-05-XX — Cabinet Master sprint (массивная работа)
- 22a Catalog Part 1 + Part 2 + 22b favorites
- 22a-fix-1/2/3 — smart tags, premium search, autocomplete
- SEED-TEST-DATA — 28 masters + 6 studios + 15 clients + 63 bookings
- 23a — Cabinet Master shell (sidebar, topbar, UserChip)
- 23a-FIX-CHIP, 23b dashboard, 23b-FIX-FULLWIDTH
- 24 — Bookings kanban
- 25a — Schedule week view
- 25-settings-a — Hours tab
- 25-settings-b — Rules + Visibility tabs
- 25-settings-c — Exceptions + Breaks tabs
- 25-FIX-A — Polish (fixed slot times, hide breaks recurring, copy disambiguation, late cancel rename)
- 25-FIX-CLIENT-BOUNDARY — Server/client import boundary fix
- 26-NOTIF-A1 — Backend split + minimal master notifications page
- 26-NOTIF-A2 — Master notifications full redesign
- 26-SHOWCASE-MASTER-SEED — Анна Соколова с богатыми данными для visual validation
- 26-CONTEXT-REFRESH — обновление CLAUDE.md, MASTERRYADOM_AI_CONTEXT.md, QUALITY-GATES.md, ui-ux-pro-max/SKILL.md

### 2026-05-XX — Admin Panel sprint (начало)
- **ADMIN-SHELL-A** — Admin sidebar + topbar + UserChip + theme toggle. Существующие admin-страницы обёрнуты в новый shell без изменения контента. Дубликат `(admin)/admin/layout.tsx` удалён. Legacy `src/features/admin/components/admin-sidebar.tsx` помечен `@deprecated`.
- **ADMIN-DASH-A** — SSR-driven дашборд `/admin`: KPI row (4 tiles), 7-day bar/line charts (inline SVG), live event feed (polling 5s + framer-motion), system health (polling 30s). Новые API: `/api/admin/dashboard/{kpis,charts,events,health}`. Legacy `/api/admin/metrics` + старый `AdminDashboard` помечены `@deprecated`. Client names masked (initial of last name).
- **ADMIN-CATALOG-A** — модерация `GlobalCategory`: URL-filtered table (status tabs + parent + search), inline approve/reject/edit actions, reject dialog с обязательной reason (логируется через `logInfo` + попадает в `Notification.body/payload`, до schema migration). Reuse существующих POST `/api/admin/catalog/categories/[id]/{approve,reject}` + PATCH `[id]`. Cycle detection at PATCH сохранено. Legacy `src/features/admin/components/admin-catalog.tsx` + `/api/admin/catalog/global-categories/*` помечены `@deprecated`.
- **CONTEXT-REFRESH-V2** (2026-05-13) — `MASTERRYADOM_AI_CONTEXT.md` приведён к актуальному состоянию (7 мая → 13 мая, 1094 → 1407 файлов, ветка `newDesignSystem` → `designAdminCabinet`, models 17 → 35 enums + 63 models). BACKLOG.md синхронизирован с реальной картой выполненного. Новое правило про обновление контекста добавлено в CLAUDE.md.
- **ADMIN-CITIES-UI** (2026-05-13) — новый SSR-driven UI для `/admin/cities` под admin-cabinet shell. Sub-features:
  - Reuse существующих 5 endpoints (`/api/admin/cities/{,[id],[id]/merge}`) без breaking changes
  - GET `/api/admin/cities` расширен: добавлены `mastersCount` + `studiosCount` (split по Provider.type), `duplicateGroupId`, `tag`, `providersWithoutCityCount`. `providersCount` сохранён для backwards-compat с legacy UI
  - Новый endpoint `GET /api/admin/cities/duplicates` для duplicate-groups modal
  - Algorithmic duplicate detection в `lib/duplicate-groups.ts`: normalize-match (pass 1) + 5km haversine (pass 2), canonical pick by `!autoCreated > popularity > id`
  - 3-letter `tag` через hardcoded map топ-30 RU/KZ городов + fallback (без schema migration)
  - Filter tabs (Все / Видимые / Скрытые / Дубли) + URL state via `useSearchParams`
  - Right-side detail panel со sticky positioning на desktop, sheet-like layout на mobile
  - `<ProvidersWithoutCityCard>` info-card в header показывает `cityId IS NULL` count
  - `Sparkles` icon как subtle marker для `autoCreated` cities, warning amber tag для duplicate rows
  - Pre-filled merge dialog когда переход из "Найти дубли" modal или detail-panel banner
  - Legacy `src/features/admin/components/admin-cities.tsx` (683 строки) помечен `@deprecated`
  - Admin nav расширен item «Города» (закрывает carryover из ADMIN-SHELL-A)
- **ADMIN-USERS-A** (2026-05-13) — новый SSR-driven UI для `/admin/users` под admin-cabinet shell. Sub-features:
  - 5 role tiles (Все / Клиент / Мастер / Студия / Админ) — STUDIO group = STUDIO ∪ STUDIO_ADMIN, ADMIN group = ADMIN ∪ SUPERADMIN
  - 3 фильтра: role select (redundant с tiles, для keyboard/mobile) + plan tier select + debounced search (200ms)
  - Cursor-based pagination через URL `?cursor=` + «Load more» button
  - Plan pill clickable для MASTER/STUDIO/STUDIO_ADMIN, скрыт для CLIENT/ADMIN/SUPERADMIN
  - Premium crown icon рядом с display name для PREMIUM-tier users
  - Trial / PAST_DUE indicators на pill
  - Deterministic gradient avatar — djb2-hash userId → hue, stable across reloads
  - Plan change dialog: 3 radio options (Free/PRO/Premium внутри scope user'а) + 1/3/6/12 period select + reason textarea
  - Новый endpoint **PATCH `/api/admin/users/[id]/plan`** с обязательным `BillingAuditLog` записью (action: `ADMIN_PLAN_CHANGE`) + Zod-валидация period (1|3|6|12). Транзакция: upsert UserSubscription + audit log
  - City resolve via `providers: { take: 1, include: city }` — single query, no N+1
  - Legacy PATCH `/api/admin/users` помечен `@deprecated` (используется только legacy AdminUsers UI). Legacy `src/features/admin/components/admin-users.tsx` (328 строк) помечен `@deprecated`
  - Notification user'у при admin plan change **не отправляется** (нет подходящего NotificationType в enum). В backlog: новое значение `BILLING_PLAN_GRANTED_BY_ADMIN` через миграцию
- **CITIES-FIX-A** (2026-05-13) — вернули `autoCreated` Switch в `city-edit-form.tsx` (в ADMIN-CITIES-UI был read-only display). Inverted UI semantics: Switch ON = «Проверен админом» = `autoCreated: false`. Type signature `onSave` widened по cascade (`city-edit-form` → `cities-detail-panel` → `cities-table`). PATCH body передаёт raw boolean без инверсии. UI_TEXT ключи `autoCreatedYes`/`autoCreatedNo` заменены на `autoCreated`/`autoCreatedHint`.
- **ADMIN-BILLING-A** (2026-05-13) — часть A нового `/admin/billing` под admin-cabinet shell. Sub-features:
  - Header (caption «Финансы и тарифы», без правых CTA — экспорт убран per spec)
  - 4 KPI tiles: MRR (per-period MRR через `calculateMRR()` pure function), Активные подписки + delta за 30 дней, Платежи pending (count + sum), Отказы за 7 дней (count + % от попыток)
  - 3-tab strip — Plans активен, Subscriptions/Payments **disabled** (Lock icon + tooltip «Доступно в следующем релизе»), будут в ADMIN-BILLING-B
  - 6 plan cards в 2 секциях («Для мастеров» × 3 + «Для студий» × 3): tier+scope subcaption, plan name, per-month price (или «Бесплатно»), active count, features list (через `planFeatureLines` из `resolveEffectiveFeatures` + FEATURE_CATALOG iteration), POPULAR badge для PREMIUM
  - Plan edit dialog: name + isActive + sortOrder + 4 prices (1/3/6/12 months в рублях, конвертация в копейки). `code`/`tier`/`scope`/`features` read-only (invariant identifiers + features editing complex)
  - Новый endpoint `PATCH /api/admin/billing/plans/[id]` с **обязательной** `BillingAuditLog` записью (action `ADMIN_PLAN_EDITED`, diff `{before, after}` для each изменённого field). Транзакция: update + price upserts + audit log atomically. Cache invalidation `plan:current:*` pattern delete
  - Новый endpoint `GET /api/admin/billing/kpis`
  - Pure-function lib: `mrr.ts` (MRR sum), `kpi-tone.ts` (delta → ok/warn/danger/neutral), `kopeks.ts` (rubles ↔ kopeks), `plan-display.ts` (tier/scope labels)
  - Legacy `src/features/admin/components/admin-billing.tsx` (1253 строки) помечен `@deprecated`. Существующие endpoints `/api/admin/billing` (GET/POST/PATCH), `/api/admin/billing/subscriptions`, `/api/admin/billing/payments`, `/api/admin/billing/refund` — **не тронуты**, остаются functional для ADMIN-BILLING-B
- **MRR-SNAPSHOTS-A** (2026-05-13) — daily MRR snapshot pipeline + historical-delta integration с admin/billing KPI:
  - Schema migration `20260513115124_add_mrr_snapshot` — новая модель `MrrSnapshot` (id, snapshotDate `@db.Date @unique`, mrrKopeks `BigInt`, activeSubscriptionsCount, breakdownJson, createdAt). BigInt для overflow safety, breakdownJson reserved для future per-tier drill-down
  - **Refactor:** `calculateMRR()` перемещён из `src/features/admin-cabinet/billing/lib/mrr.ts` → `src/lib/billing/mrr.ts` (worker не должен зависеть от features-слоя)
  - Новый `src/lib/billing/mrr-snapshot.ts`: `createMrrSnapshotForToday()` (idempotent, race-safe via P2002 fallback re-read), `getMrrSnapshotDaysAgo()` (no nearest-neighbour fallback by design)
  - Новый queue job type `mrr.snapshot.daily` (zero payload) + worker handler `processMrrSnapshotDailyJob` (использует общий retry/dead-letter mechanism)
  - Новый endpoint `POST /api/billing/mrr/snapshot/run` — auth через `x-cron-token` header (same pattern as `/api/billing/renew/run`), validates against `MRR_SNAPSHOT_SECRET` env var, enqueues job and returns fast
  - **KPI integration:** `getAdminBillingKpis()` теперь читает snapshot ~30 дней назад и вычисляет `mrr.deltaPercent` через BigInt arithmetic. `null` → UI рендерит «—»
  - Unit tests: 12 tests across `mrr.test.ts` (6) + `mrr-snapshot.test.ts` (6) — UTC date truncation, idempotency, race fallback, missing-price-row handling, BigInt math
  - Runbook `docs/runbooks/mrr-snapshot-cron.md` — endpoint usage, cron schedule recommendation (02:00 UTC), failure modes, backfill note
  - Env: новый `MRR_SNAPSHOT_SECRET` в `env.ts` + `.env.example`
- **ADMIN-BILLING-B** (2026-05-13) — часть B `/admin/billing`: Subscriptions tab + Payments tab + cancel/refund actions. Sub-features:
  - 3 tabs все interactive (Subs/Payments tooltip+disabled убран). URL-driven active tab через `?tab=plans|subs|payments`, tab-specific cursors `?subCursor=`/`?payCursor=` сбрасываются при tab switch
  - **Subscriptions tab:** таблица ACTIVE+PAST_DUE подписок с 7 columns (user / plan / since / next / amount / method / autoRenew). Cursor pagination. Cancel action через `POST /api/admin/billing/subscriptions/[id]/cancel` (новый endpoint)
  - **Cancel subscription endpoint** — новый. Semantics: `cancelAtPeriodEnd: true` + `autoRenew: false` + `cancelledAt: now` (user retains access until period end). Атомарная транзакция: subscription update + `BillingAuditLog.action="ADMIN_SUBSCRIPTION_CANCELLED"` (с adminUserId + previousStatus + reason in details). Notification user'у через existing `BILLING_SUBSCRIPTION_CANCELLED` type (no admin-specific enum value)
  - **Payments tab:** pending + history groups. Pending — все PENDING, warning amber background. History — SUCCEEDED/FAILED/CANCELED/REFUNDED, cursor-paginated. 5 payment statuses with distinct tones (success/warning/destructive/muted/info)
  - **Refund action** — reuses existing `POST /api/admin/billing/refund` endpoint, **extended** to accept `reason` body field (stored в audit log details). Endpoint already has idempotency via YooKassa idempotenceKey
  - **N+1 prevention:** subscriptions list includes `payments: { take: 1, where: SUCCEEDED, orderBy: createdAt desc }` for payment-method extraction. Payment method derived from `metadata.payment_method.title` Json blob best-effort; `null` → UI «—»
  - **Legacy `src/features/admin/components/admin-billing.tsx` УДАЛЁН** (1253 строки). User-approved deletion. После переключения page → no remaining importers
  - `BillingPaymentStatus` все 5 значений отображаются в UI (PENDING/SUCCEEDED/FAILED/CANCELED/REFUNDED)
  - Refund button скрыт для non-refundable payments (`isRefundable = SUCCEEDED && has yookassaPaymentId`)
- **ADMIN-REVIEWS-A** (2026-05-13) — новый SSR-driven UI для `/admin/reviews` под admin-cabinet shell. Sub-features:
  - Header (caption «Модерация отзывов и жалоб» + «N жалоб ожидают» indicator); без правого CTA «Фильтры» per spec
  - 4 KPI tiles: pendingReports (count + urgent count в красном — `rating=1 OR reason=OFFENSIVE`), reviewsToday (count + delta vs 7-day rolling avg), averageRating (всё-temp arithmetic mean over non-deleted), deletedLastWeek (**null** — нет `Review.deletedAt`, UI рендерит «—»). Tone resolvers: ok/warn/danger/neutral per tile
  - 3 tabs (Все / С жалобами / Низкий рейтинг ≤2) + debounced search (200 мс) по text/reportComment/author.displayName. URL state через `?tab=`/`?q=`/`?cursor=`. Tab counts вычислены параллельно с `Promise.all`
  - Review cards (3-column grid на desktop, stack на mobile): main (author masked + target + stars + text + reply) / actions (Approve если reported + Delete всегда) / report info (single reason label + comment, **no** breakdown counts per spec — multi-reporter в backlog)
  - **Author privacy** — централизованный helper `maskAuthorDisplay()`: «Алексей Иванов» → «Алексей И.», single word fallback к initial-only
  - **Approve action** — clears `reportedAt`/`reportReason`/`reportComment`, audit via `logInfo("admin.reviews.approved", { adminUserId, reviewId, targetType, targetId })`. Throws `AdminApproveReviewError` с кодами `REVIEW_NOT_FOUND` (404) или `NOT_REPORTED` (400, idempotency-protection)
  - **Delete action** — **hard delete** + `recalculateTargetRatings(tx, targetType, targetId)` в атомарной транзакции. Audit via `logInfo("admin.reviews.deleted", { adminUserId, reviewId, reason, targetType, targetId })`. User-approved continuation legacy semantics; soft-delete migration **🔴 pre-launch blocker** в backlog
  - Confirmation dialogs: ApproveReviewDialog (минимал, без reason), DeleteReviewDialog (warning + опциональный `reason` textarea, danger button). Оба используют `ModalSurface` primitive (Portal-to-body)
  - 2 новых endpoints: `POST /api/admin/reviews/[id]/approve` (Zod-валидация на `id`, проверка auth через `requireAdminAuth`), `POST /api/admin/reviews/[id]/delete` (body `{reason?: string trim max 500}`)
  - **N+1 prevention** — `listAdminReviews` использует `include: { author: { select }, master: { select: { user: { select } } }, studio: { select: { provider: { select: { name } } } } }`. Tab counts через 3 параллельных `count()` calls
  - Server services co-located в `src/features/admin-cabinet/reviews/server/`: `reviews.service.ts` (list + counts), `kpis.service.ts`, `approve-review.service.ts`, `delete-review.service.ts`
  - Lib helpers: `urgency.ts` (`isUrgentReport`), `report-reason-display.ts` (`reportReasonLabel` switch over 5 enum values), `author-mask.ts` (`maskAuthorDisplay`)
  - Optimistic UI updates с `router.refresh()` после server confirmation
  - 5 empty state variants: tab-specific copy («Жалоб пока нет» / «Низких оценок нет» / «Поиск не дал результатов» / etc.)
  - Cursor-based pagination через `?cursor=` + «Загрузить ещё» CTA (URL-driven, server-fetched)
  - Admin nav расширен item «Отзывы» (MessageSquareWarning icon, между Billing и Settings)
  - Legacy `src/features/admin/components/admin-reviews.tsx` (312 строк) помечен `@deprecated` с JSDoc-блоком ссылающимся на новый модуль и Phase 7 cleanup
  - **Legacy PATCH /api/admin/reviews/[id]** (action: dismiss_report) + **DELETE /api/admin/reviews/[id]** — оставлены functional для backwards-compat, не тронуты. Новый UI использует только новые dedicated routes
- **ADMIN-SETTINGS-A** (2026-05-13) — новый SSR-driven UI для `/admin/settings` под admin-cabinet shell. **🎉 Phase 2 (Admin Panel) полностью завершён**. Sub-features:
  - Header (caption + title, без правых CTA)
  - Logo + Login hero (2-col на desktop) — переиспользуют existing `SiteLogoManager` + `LoginHeroImageManager` через `AvatarEditor` для `SITE/site` entity. Focal points через existing crop UI
  - **System flags** — **3 РЕАЛЬНЫХ флага** (per audit + критическое решение user'а «никаких выдуманных флагов»):
    - `onlinePaymentsEnabled` (SystemConfig, существовал)
    - `visualSearchEnabled` (SystemConfig, существовал + runtime consumer + cache clear)
    - `legalDraftMode` (SystemConfig, существовал в коде через `getLegalDraftMode()` но не было admin endpoint → **расширили `/api/admin/system-config`** Zod schema + cache clear через `clearLegalDraftModeCache()`)
  - Skipped from reference jsx (не существуют в системе): «Авто-модерация отзывов», «Записи только с подтверждением» (per-provider field), «Регистрация студий открыта» (нет gate), «Push-уведомления через web push» (env-only). Все в backlog 🟠
  - Skipped: generic AppSettings editor — `/api/admin/app-settings` существует но в новом UI не используется (raw key edit без typed validation = risk; ни `supportEmail` ни `smsProvider` из reference jsx не существуют как AppSetting). Backlog 🟠 `AppSetting bulk editor` отдельной surface'ой с warnings
  - **SEO** — 2 fields (title 120 max, description 240 max), draft/baseline/dirty pattern + Save button с status indicator (idle/saving/saved/error через framer-motion). Reuses `/api/admin/settings` GET/PATCH без breaking changes. **Audit logging added** через `logInfo("admin.settings.seo.updated", { adminUserId, changed: { before, after } })` только если значение реально изменилось
  - **Queue status** — 3 tiles (pending/processing/dead с danger tone когда dead > 0) + refresh button + dead jobs list с retry/delete actions. Reuses `/api/admin/queue` + `/api/admin/queue/[index]` PATCH/DELETE. Auto-refresh 600ms after mount чтобы поймать changes since SSR
  - **Visual search** — 3 tiles (total/indexed/notIndexed с warning tone) + reindex button. Disabled+amber hint когда `visualSearchEnabled = false`. Reuses `/api/admin/visual-search/stats` GET + `/reindex` POST. **N+1 prevention:** SSR через 2 параллельных raw SQL count'а вместо full byCategory breakdown (тот UI не использует)
  - **Media cleanup** — 2 tiles (pending/broken с warning/danger tones) + run cleanup button. Reuses `/api/admin/media/broken` GET/POST. Stats обновляются после успешного запуска
  - **Audit logging extended** в 2 endpoints:
    - `/api/admin/system-config` PATCH — `logInfo("admin.settings.flags.updated", { adminUserId, changed: { flag: { before, after } } })`
    - `/api/admin/settings` PATCH (SEO) — `logInfo("admin.settings.seo.updated", { adminUserId, changed: { field: { before, after } } })`
    - Только изменённые поля логируются, no-op PATCH не пишет audit
  - Server services co-located в `src/features/admin-cabinet/settings/server/`: `settings-data.service.ts` (parallel Promise.all orchestrator), `flags.service.ts`, `seo.service.ts`, `queue-stats.service.ts`, `visual-search-stats.service.ts`, `media-cleanup-stats.service.ts`. Reuse existing helpers from `@/lib/queue/queue`, `@/lib/media/cleanup`, `@/lib/visual-search/config`
  - Lib helpers: `flag-registry.ts` (3-flag array — single source of truth для toggle UI)
  - 12 UI components в `src/features/admin-cabinet/settings/components/`: section-card (reusable header+body+footer wrapper), stat-tile (3 tones: neutral/warning/danger), settings-header, logo-section, login-hero-section, system-flags-section, flag-row, seo-section, queue-status-section, visual-search-section, media-cleanup-section, admin-settings (server orchestrator)
  - Mobile: cards stack 1-col на `<lg`, tiles 1-col на `<sm` → 2-3-col на ≥sm
  - **Settings page → SSR через `force-dynamic`** — все данные real-time из БД/Redis
  - Legacy `src/features/admin/components/admin-settings.tsx` (727 строк) помечен `@deprecated` с JSDoc-блоком ссылающимся на новый модуль и Phase 7 cleanup. Не удалён в этом коммите (727 строк сложного inline-кода для focal points / app-settings — нужен careful review)
  - Existing endpoints не тронуты (только 2 расширены минимально): `/api/admin/{settings,system-config,app-settings,queue,visual-search,media}` все functional, новый UI consumes их без breaking changes
- **PHASE-7-CLEANUP-A** (2026-05-13) — финальный sweep по удалению `@deprecated` админ кода и dead-letter UI_TEXT keys накопленных за Phase 2 sprint. Sub-features:
  - **Удалены 7 legacy UI components** (3 164 LOC) из `src/features/admin/components/`: `admin-sidebar.tsx` (125), `admin-dashboard.tsx` (327), `admin-catalog.tsx` (625), `admin-cities.tsx` (693), `admin-users.tsx` (342), `admin-reviews.tsx` (312), `admin-settings.tsx` (740). Все имели 0 importer'ов после ADMIN-{SHELL/DASH/CATALOG/CITIES/USERS/REVIEWS/SETTINGS}-A коммитов
  - **Удалены 4 legacy API route файла** (646 LOC): `/api/admin/metrics/route.ts` (114 — superseded by `/api/admin/dashboard/{kpis,charts,events,health}`), `/api/admin/users/route.ts` (250 — GET + PATCH, both unused after `/api/admin/users/[id]/plan`), `/api/admin/catalog/global-categories/route.ts` (150), `/api/admin/catalog/global-categories/[id]/{approve,reject}/route.ts` (132 total — duplicated by `/api/admin/catalog/categories/*`)
  - **Удалены 463 строки dead-letter UI_TEXT keys** в `admin.*` namespace: sub-namespaces `nav`, `catalog`, `users`, `cities`, `reviews`, `dashboard`, `billing`, `settings`, `visualSearch` — все полностью dead после Phase 2 redesign sprint (новый UI использует `UI_TEXT.adminPanel.*`)
  - **СОХРАНЁН** `UI_TEXT.admin.media.*` (10 keys) — active consumer `src/features/media/components/login-hero-image-manager.tsx` (используется через `<LoginHeroSection>` нового admin-cabinet/settings) + `site-logo-manager.tsx` (orphan candidate, см. ниже)
  - **Удалены пустые директории:** `src/features/admin/components/`, `src/features/admin/`, `src/app/api/admin/metrics/`, `src/app/api/admin/catalog/global-categories/` целиком
  - **TypeCheck:** ✅ зелёный после каждого incremental deletion
  - **Lint:** baseline 588 errors + 87 warnings — без regression (deleted files были clean code, не contributing к error count)
  - **Encoding/mojibake:** ✅
  - **Total LOC removed:** **~3 810 строк** (3 164 UI + 646 API + sources of admin.* UI_TEXT)
  - **Orphan candidate (не удалён, требует user review):** `src/features/media/components/site-logo-manager.tsx` (17 строк) — только legacy admin-settings.tsx использовал. After deletion → orphan. **НЕ удалён** per scope rule «не помечен @deprecated → не удаляем automatically». Recommendation: cascade-delete в следующем cleanup pass + remove `UI_TEXT.admin.media.siteLogoTitle/siteLogoDescription` keys
- **MIGRATIONS-PRELAUNCH-A** (2026-05-13) — foundation коммит pre-launch batch (1/4). **Только schema additions + types**, никаких behavior changes. Sub-features:
  - Schema migration `20260513224252_pre_launch_audit_soft_delete_block`:
    - **`AdminAuditLog` модель** в новом `prisma/schema/audit.prisma`: id / adminUserId(FK→UserProfile onDelete: Restrict) / action / targetType / targetId / details(Json) / reason / ipAddress / userAgent / createdAt. 4 индекса (adminUserId+createdAt DESC, targetType+targetId+createdAt DESC, action+createdAt DESC, createdAt DESC)
    - **`AdminAuditAction` enum** в `prisma/schema/enums.prisma`: 25 значений (`USER_PLAN_GRANTED`, `USER_BLOCKED`, `USER_UNBLOCKED`, `USER_ROLE_ADDED`, `USER_ROLE_REMOVED`, `USER_ACCOUNT_DELETED`, `BILLING_PLAN_EDITED`, `BILLING_SUBSCRIPTION_CANCELLED`, `BILLING_PAYMENT_REFUNDED`, `CITY_CREATED`, `CITY_UPDATED`, `CITY_DELETED`, `CITY_MERGED`, `CITY_VERIFIED`, `CATEGORY_APPROVED`, `CATEGORY_REJECTED`, `CATEGORY_EDITED`, `REVIEW_APPROVED`, `REVIEW_DELETED`, `REVIEW_RESTORED`, `SETTINGS_LOGO_UPDATED`, `SETTINGS_LOGIN_HERO_UPDATED`, `SETTINGS_SEO_UPDATED`, `SETTINGS_FLAG_TOGGLED`, `SETTINGS_APP_SETTING_UPDATED`)
    - **`Review` table extended**: `deletedAt? DateTime`, `deletedByUserId? String` (FK→UserProfile onDelete: SetNull, relation `ReviewDeletedBy`), `deletedReason? String`. Index `Review_deletedAt_idx`
    - **`UserProfile` table extended**: `blockedAt? DateTime`, `blockedByUserId? String` (self-FK onDelete: SetNull, relation `UserBlockedBy`), `blockedReason? String`. Index `UserProfile_blockedAt_idx`. Также добавлены back-relations `adminAuditLogs AdminAuditLog[]` + `reviewsDeleted Review[]` + `blockedUsers UserProfile[]`
  - **`BillingAuditLog` НЕ затронут** — продолжает работать параллельно. Retirement policy решается в **ADMIN-AUDIT-INTEGRATION** коммите после миграции существующих consumer'ов на `AdminAuditLog`
  - **Type module** `src/lib/audit/types.ts`: re-exports `AdminAuditAction` + `AdminAuditLog`, type `AdminAuditDetails` (diff-based + free-form), const map `ADMIN_AUDIT_ACTIONS` с `satisfies Record<AdminAuditAction, AdminAuditAction>` (exhaustiveness check)
  - **Behavior preserved:** existing endpoints **не тронуты**. Review delete по-прежнему hard delete (новые поля ignored). User block недоступен через API (поля nullable, не используются). `AdminAuditLog` пустой (no inserts yet)
  - Migration сгенерирована manual SQL (DB local unavailable), pattern точно совпадает с `multi_city_foundation` migration. `npx prisma validate` ✅, `npx prisma generate` ✅, typecheck ✅, 178/178 tests ✅, lint baseline сохранён (588 errors / 87 warnings)
  - Counts: models 64 → 65, enums 35 → 36, migrations 14 → 15
  - **Next batch:** ADMIN-AUDIT-INTEGRATION (2/4) → NOTIFICATION-TYPES-A (3/4) → REVIEW-SOFT-DELETE-A (4/4)
- **ADMIN-AUDIT-INTEGRATION** (2026-05-13) — pre-launch batch коммит 2 из 4. Перевод всех admin mutations на `AdminAuditLog` с capture IP + User-Agent. Sub-features:
  - Новый модуль `src/lib/audit/`:
    - `admin-audit.ts` — `createAdminAuditLog(input)` (strict, throws — use inside transactions) + `createAdminAuditLogSafe(input)` (catches and `logError`s — use outside transactions where audit loss is preferable to surfacing a 500)
    - `admin-audit-context.ts` — `getAdminAuditContext(req)` extracts IP via existing `getClientIp` helper + User-Agent (truncated to 512 chars). Best-effort: nullable. `EMPTY_ADMIN_AUDIT_CONTEXT` для service layers без request
    - `admin-audit-diff.ts` — `buildAdminAuditDiff<T>(before, after)` returns `{[K]: {before, after}}` для changed keys only. Equality: strict `===` для primitives, JSON-stringify для objects/arrays. `hasAnyDiff()` helper для conditional audit writes
    - `admin-audit-diff.test.ts` — 12 unit tests covering: no-op, primitive/boolean/null changes, undefined handling, multi-field diffs, nested objects, arrays, empty diff check. **190/190 tests passing**
  - **Group A — Billing (dual-write with BillingAuditLog):**
    - `src/app/api/admin/billing/plans/[id]/route.ts` PATCH — добавлен `BILLING_PLAN_EDITED` write **внутри** existing transaction рядом с `BillingAuditLog`. Diff передаётся в `details.changes`. Context: `getAdminAuditContext(req)`
    - `src/features/admin-cabinet/billing/server/cancel-subscription.service.ts` — service signature расширена `context?: AdminAuditContext`. Audit `BILLING_SUBSCRIPTION_CANCELLED` внутри tx + reason field
    - `src/app/api/admin/billing/refund/route.ts` POST — **`createAdminAuditLogSafe`** (вне tx, после YooKassa side-effect — failure не должен surface как 500). Audit `BILLING_PAYMENT_REFUNDED` + reason
    - `src/features/admin-cabinet/users/server/plan-change.service.ts` — service signature расширена `context?`. Audit `USER_PLAN_GRANTED` внутри tx с before/after план info
  - **Group B — Cities (logInfo → AdminAuditLog migration):**
    - `cities/route.ts` POST — wrap city.create в tx + audit `CITY_CREATED`. Context передаётся
    - `cities/[id]/route.ts` PATCH — **двойная audit** logic: `CITY_VERIFIED` если `autoCreated: true → false` toggle + `CITY_UPDATED` если other fields touched. Оба внутри одной tx
    - `cities/[id]/route.ts` DELETE — wrap delete в tx + audit `CITY_DELETED`. Param `_req → req` (был unused)
    - `cities/[id]/merge/route.ts` — audit `CITY_MERGED` внутри existing tx. targetId = surviving city, sourceCitySlug в details
  - **Group B — Catalog:**
    - `catalog/categories/[id]/approve/route.ts` POST — wrap update в tx + audit `CATEGORY_APPROVED`. Param `_req → req`
    - `catalog/categories/[id]/reject/route.ts` POST — wrap update + portfolioItem.updateMany в tx + audit `CATEGORY_REJECTED` + reason. Existing `logInfo` сохранён
    - `catalog/categories/[id]/route.ts` PATCH — wrap update + conditional portfolioItem update + audit `CATEGORY_EDITED` (fieldsChanged list per spec table — no diff values for sparse change)
  - **Group B — Reviews:**
    - `approve-review.service.ts` — wrap review.update в tx + audit `REVIEW_APPROVED` с previousReason. Service signature: `context?`
    - `delete-review.service.ts` — audit `REVIEW_DELETED` внутри existing tx (review.delete + recalculateTargetRatings + audit все вместе). Service signature: `context?`
    - Routes `reviews/[id]/{approve,delete}` обновлены: pass `context: getAdminAuditContext(req)`
  - **Group B — Settings:**
    - `system-config/route.ts` PATCH — рефакторинг: все upserts перенесены **внутрь tx**, **N audit entries per toggled key** (`SETTINGS_FLAG_TOGGLED` × {onlinePayments / visualSearch / legalDraft}). Cache invalidation после tx (best-effort). `logInfo` сохранён
    - `settings/route.ts` PATCH (SEO) — рефакторинг writeSetting → `writeSettingTx` (transaction client variant). Audit `SETTINGS_SEO_UPDATED` с full diff `{seoTitle?, seoDescription?}`. `logInfo` сохранён
    - `app-settings/route.ts` PATCH — wrap upsert в tx + audit `SETTINGS_APP_SETTING_UPDATED` с before/after если value реально изменилось
  - **NOT instrumented in this commit (logo / login-hero):** SETTINGS_LOGO_UPDATED + SETTINGS_LOGIN_HERO_UPDATED enum values добавлены в MIGRATIONS-PRELAUNCH-A но dedicated admin endpoints для upload **не существуют** — фото идут через generic `/api/media` POST в `src/lib/media/service.ts` (entityType=SITE). Audit там потребует instrumentation на уровне media service с entity-type filter. Tracked in backlog
  - **logInfo НЕ удалён** — secondary in-memory stream сохранён для debugging
  - **BillingAuditLog НЕ тронут** — forever-parallel decision documented. 4 dual-write sites продолжают писать в обе таблицы
  - **Counts:** ~16 endpoints instrumented (4 billing dual-write + 4 cities + 3 catalog + 2 reviews + 3 settings). 4 новых файла в `src/lib/audit/`. 12 новых tests
  - **Validation:** typecheck ✅, lint 588/87 (baseline preserved), encoding/mojibake ✅, 190/190 tests passing
  - **Next batch:** NOTIFICATION-TYPES-A (3/4) → REVIEW-SOFT-DELETE-A (4/4)
- **NOTIFICATION-TYPES-A** (2026-05-14) — pre-launch batch 3 из 4. Admin-initiated NotificationType enum extension + 3-канальный dispatcher + mass fan-out. Sub-features:
  - **Schema migration** `20260514000936_add_admin_initiated_notification_types`: 6 `ALTER TYPE "NotificationType" ADD VALUE` entries. Non-transactional ALTER TYPE — OK для add-only. Counts: enums 36 (same — extended existing enum, not added new), migrations 15 → 16
  - **6 новых NotificationType values:** `BILLING_PLAN_GRANTED_BY_ADMIN`, `BILLING_PLAN_EDITED`, `BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN`, `BILLING_PAYMENT_REFUNDED`, `REVIEW_DELETED_BY_ADMIN`, `SUBSCRIPTION_GRANTED_BY_ADMIN` (last reserved для future use, currently не используется — `BILLING_PLAN_GRANTED_BY_ADMIN` covers plan grants)
  - **Новые файлы (3 production + 1 test):**
    - `src/lib/notifications/admin-body-templates.ts` — pure body builders (`buildPlanGrantedBody`, `buildPlanEditedSummary` с smart sparse-diff filtering, `buildSubscriptionCancelledByAdminBody`, `buildRefundBody`, `buildReviewDeletedByAdminBody`) + push truncation helpers (`truncatePushBody` → 200 chars, `truncatePushTitle` → 50 chars) + Russian plural-month formatter (`formatMonths` с 1/2-4/5-10/11-14 правилами)
    - `src/lib/notifications/admin-body-templates.test.ts` — **24 unit tests** покрывают plural-month rules, builder happy paths, reason-suffix, NBSP-aware assertions (ru-RU `toLocaleString` использует NBSP)
    - `src/lib/notifications/admin-initiated.ts` — `dispatchAdminInitiatedNotification` (3-channel: in-app via existing `createNotification`+`publishNotifications`, push via fire-and-forget `sendPushToUser`, Telegram via existing `telegram.send` queue job) + `processPlanEditedMassNotification` (batched 50/iteration с `Promise.allSettled`) + `enqueuePlanEditedMassNotification` (queue helper)
  - **Queue extension в `src/lib/queue/types.ts`:** новый `PlanEditedNotifyJob` type (`notification.billing.plan-edited.mass`) + payload validator + factory `createPlanEditedNotifyJob`. Worker handler `processPlanEditedNotifyJob` в `src/worker.ts`
  - **Integration sites (5):**
    - `plan-change.service.ts` — добавлен `BILLING_PLAN_GRANTED_BY_ADMIN` dispatch после tx commit (try/catch, failure logged but doesn't undo grant)
    - `cancel-subscription.service.ts` — **migrated** с generic `BILLING_SUBSCRIPTION_CANCELLED` → `BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN`. Body теперь использует pure builder с accessUntil date
    - `billing/refund/route.ts` — добавлен `BILLING_PAYMENT_REFUNDED` dispatch после YooKassa refund (только при `refund.status === "succeeded"`). Defensive try/catch — refund уже произошёл externally, notification failure не должна surface как 500
    - `delete-review.service.ts` — добавлен `REVIEW_DELETED_BY_ADMIN` dispatch автору после tx commit. Резолв `targetName` через include `master.name` / `studio.provider.name`. Anonymous-author edge case не существует (`Review.authorId` non-nullable in schema)
    - `billing/plans/[id]/route.ts` PATCH — добавлена mass-fanout логика после tx commit: построение `PlanEditDiff` (name/isActive/prices), `buildPlanEditedSummary` (null если только sortOrder), `enqueuePlanEditedMassNotification` (worker рассылает в фоне). Sparse edits (только sortOrder) корректно skip enqueue
  - **Notification group mapping updated:** `src/lib/client-cabinet/notification-groups.ts` (все 6 → "system" group) + `src/lib/notifications/groups.ts` `PERSONAL_ONLY_TYPES` (все 6 — admin-initiated не master-context)
  - **Pattern decisions:**
    - In-app create + push + Telegram dispatch — **вне** business tx (matches existing `createBillingNotification` convention). Failure logged, не блокирует admin action. Trade-off: notification может потеряться при race с tx rollback, но 4 из 5 sites уже passed all internal validations к моменту dispatch
    - Push remains fire-and-forget (existing pattern) — добавление push-queue job отложено в backlog 🟡 (нет audit-finding жёсткого требования)
    - Telegram через existing `telegram.send` queue job — retry-able via worker
    - Push body truncated to 200 chars + ellipsis; title to 50 chars. Telegram + in-app сохраняют full body
  - **Body templates honest UX:** `buildPlanEditedSummary` возвращает `null` для diffs без user-visible changes (admin меняет только `sortOrder` → enqueue skipped). Не спамим subscribers пустышками
  - **Validation:** typecheck ✅, lint 588/87 (baseline preserved), encoding/mojibake/prisma ✅, **214/214 tests passing** (190 → 214, +24 body-template tests)
  - **Migration applied to DB:** ⚠️ не выполнено — local Postgres недоступен. Migration SQL crafted manually, pattern точно совпадает с `ALTER TYPE` examples из Prisma docs. Когда DB доступен → `npx prisma migrate deploy` применяет 6 ALTER TYPE statements non-transactional (PostgreSQL constraint)
  - **Next:** REVIEW-SOFT-DELETE-A (4/4 finale pre-launch batch)
- **REVIEW-SOFT-DELETE-A** (2026-05-14) — **финальный (4/4) коммит pre-launch batch.** Hard delete → soft delete для review moderation. **🎉 Pre-launch batch CLOSED.** Sub-features:
  - **Новый shared helper:** `src/lib/reviews/soft-delete.ts` — `ACTIVE_REVIEW_FILTER` constant (`{ deletedAt: null }`) для consistent application across the codebase. Pattern matches existing `MediaAsset.deletedAt` / `Notification.deletedAt` conventions
  - **Schema не тронут** — поля `deletedAt`/`deletedByUserId`/`deletedReason` + index + FK уже добавлены в MIGRATIONS-PRELAUNCH-A. Только runtime behaviour switch
  - **Delete paths migrated (2):**
    - `src/features/admin-cabinet/reviews/server/delete-review.service.ts` — `tx.review.delete` → `tx.review.update` с `deletedAt: new Date()` + `deletedByUserId` + `deletedReason`. **Idempotent** — повторный delete на уже-soft-deleted review = no-op (logs `idempotent_skip`, returns `alreadyDeleted: true`). AdminAuditLog + Notification dispatch preserved
    - `src/lib/reviews/service.ts` `deleteReview()` — **expanded scope per audit finding**: user self-delete (author удаляет свой отзыв до master reply) ИЛИ legacy admin-delete (reportedAt path) теперь тоже soft. Без этого был mixed-mode (admin soft + user/legacy hard) → breaks data model consistency
    - `src/app/api/admin/reviews/[id]/route.ts` DELETE — **legacy** handler также migrated to soft (для backwards-compat с external API consumers). Idempotent re-delete
  - **rating recalc обновлён в обоих местах:** `src/lib/reviews/service.ts:recalculateTargetRatings` + `src/features/admin-cabinet/reviews/server/delete-review.service.ts:recalculateTargetRatings` + `src/app/api/admin/reviews/[id]/route.ts:recalculateTargetRatings` (3 copies — дубликация уже была, дополнение filter — без затрат)
  - **18 query sites updated** с `ACTIVE_REVIEW_FILTER`:
    - `src/lib/reviews/service.ts` — `listReviews()` (public master profile) + duplicate-booking check (eligibility)
    - `src/lib/reviews/unanswered-list.ts` — master dashboard «Требуют внимания»
    - `src/lib/reviews/counts.ts` — master sidebar badge
    - `src/lib/master/day.service.ts` — master day view recent reviews
    - `src/lib/master/bookings.service.ts` — kanban client ratings/avatars
    - `src/lib/client-cabinet/reviews.service.ts` — user «My reviews» list + KPI (`computeReviewsKpi` aggregate + responded count)
    - `src/lib/studio/dashboard.service.ts` — studio dashboard recent reviews count
    - `src/lib/advisor/collector.ts` — low-rated service detection + total reviews KPI
    - `src/lib/catalog/catalog.service.ts` — smart-tag counts for catalog search
    - `src/lib/search-by-time/service.ts` — same for search-by-time results
    - `src/lib/ai/review-summary.ts` — AI summary count + reviews-for-prompt
    - `src/lib/notifications/review-notifications.ts` — `loadReviewWithRelations` (defensive: skip notify on deleted)
    - `src/features/admin-cabinet/reviews/server/reviews.service.ts` — admin moderation list `buildWhere()` (always filter) + `getReviewTabCounts` (all 3 tabs)
    - `src/features/admin-cabinet/reviews/server/kpis.service.ts` — все KPIs (pending/urgent/today/week-history/avg) фильтруют, КРОМЕ `deletedLastWeek` (intentionally queries deleted set)
    - `src/features/admin-cabinet/dashboard/server/{health,events}.service.ts` — admin dashboard reported-reviews count + events feed
    - `src/app/api/admin/reviews/route.ts` — legacy admin reviews list endpoint
    - `src/app/api/reviews/[id]/suggest-reply/route.ts` — AI reply suggestion (defensive: deleted reviews return 404)
  - **KPI `deletedLastWeek`** теперь implemented (был placeholder `null` после ADMIN-REVIEWS-A). Counts `deletedAt: { gte: sevenDaysAgo }`, paired with active-pool size для context. Type signature unchanged (`{count, totalReviews} | null`)
  - **`tx.review.deleteMany` в master deletion service** (`src/lib/deletion/delete-master.ts:60`) **не тронут** — это account-wide cascade при удалении master account (permanent wipe), отличается от moderation soft-delete по semantic
  - **Unit tests:** `src/lib/reviews/soft-delete.test.ts` — 4 tests (constant value, type-checks, spread composition, override case)
  - **Validation:** typecheck ✅, lint 588/87 (baseline preserved), encoding/mojibake/prisma ✅, **218/218 tests passing** (214 → 218, +4)
  - **Migration NOT required** for this commit — schema fields already exist
  - **Restoration:** intentionally no UI flow. SQL: `UPDATE "Review" SET "deletedAt" = NULL, "deletedByUserId" = NULL, "deletedReason" = NULL WHERE id = ?` then trigger next rating-affecting action on target (or call rating recalc manually) — emergency only
  - **🎉 Pre-launch batch CLOSED.** All 4 commits: MIGRATIONS-PRELAUNCH-A → ADMIN-AUDIT-INTEGRATION → NOTIFICATION-TYPES-A → REVIEW-SOFT-DELETE-A complete
- **ADMIN-BILLING-FIX-A** (2026-05-15) — data + seed cleanup, устраняет дубли в `BillingPlan` из-за case-sensitive `@unique` + 3 конкурирующих seed-источников. Sub-features:
  - **Diagnostic script** [`scripts/cleanup-duplicate-billing-plans.ts`](scripts/cleanup-duplicate-billing-plans.ts) (~200 LOC) — dry-run default (`--confirm` для apply), per-plan transaction (изолирует failures), idempotent (повторный запуск после success = no-op), edge-case-safe (skip + warn если UPPERCASE counterpart отсутствует)
  - **Migration steps per lowercase plan:**
    1. `UserSubscription.planId` → UPPERCASE plan id (`onDelete: Cascade` на FK = без миграции subscriptions потерялись бы при delete)
    2. `BillingPlan.inheritsFromPlanId` → UPPERCASE plan id (re-point inheritance edges)
    3. `BillingPlan.delete()` (`BillingPlanPrice` каскадится автоматически)
  - **Short-code leftovers detection** — если в БД есть `free`/`pro`/`premium`/`studio_pro` из старого `seed.sql`, script report'ит их (НЕ auto-migrate — есть existing `scripts/migrate-billing-plans.ts` для rename in place)
  - **Seed cleanup** — `prisma/seed-test.sql` BillingPlan + BillingPlanPrice INSERT блоки удалены (с заменой на comment-block с reasoning + cleanup instructions). **Single source of truth = `prisma/seeds/test-data/seed-billing-plans.ts`** (upsert by `code` — idempotent). Это устраняет first-class cause of duplication: 2 writers разных кейсов
  - **Runbook** [`docs/runbooks/cleanup-duplicate-billing-plans.md`](docs/runbooks/cleanup-duplicate-billing-plans.md) — usage, verification steps, failure modes, why-this-matters
  - **Что НЕ затронуто:** schema (unchanged), `listAdminPlans` service (admin продолжает видеть disabled plans intentionally), `migrate-billing-plans.ts` (handles short codes — отдельный scenario), production code paths (UPPERCASE codes уже canonical)
  - **Execution status:** ⚠️ **не выполнен на production** — local Postgres недоступен. Script type-checks ✅, ready to run. User должен запустить на staging → production когда DB доступен
  - **Validation:** typecheck ✅, lint baseline 588/87 preserved, encoding/mojibake/prisma ✅, 218/218 tests passing
  - **Next:** ADMIN-BILLING-FIX-B (features editor restore)
- **ADMIN-BILLING-FIX-B** (2026-05-15) — features editor restored 1:1 из legacy + inheritance + relaxed-limit validation. **🎉 Admin Billing CLOSED (A + B + FIX-A + FIX-B).** Sub-features:
  - **Endpoint extension** [`/api/admin/billing/plans/[id]`](src/app/api/admin/billing/plans/%5Bid%5D/route.ts) PATCH:
    - `bodySchema` расширен на `features: z.record(z.string(), z.unknown()).optional()` + `inheritsFromPlanId: z.string().nullable().optional()`
    - 3 validation helpers: `assertParentExists(tx, parentId)` (404 PARENT_NOT_FOUND), `assertNoInheritanceCycle(tx, planId, parentId)` (400 INHERITANCE_CYCLE, MAX_DEPTH=16), `assertRelaxedLimits(overrides, parentEffective)` (400 STRICT_LIMIT с `fieldErrors`)
    - В транзакции: загружается `beforePlan` → если `inheritsFromPlanId` patched → cycle/parent validation → если `features` patched → build planNodes map с draft, `resolveEffectiveFeatures(effectiveInherits, ...)`, `assertRelaxedLimits(parsed, parentEffective)`
    - `data.inheritsFromPlan` через connect/disconnect API (Prisma `BillingPlanUpdateInput` не принимает `inheritsFromPlanId` напрямую через optional FK)
    - `features` сохраняются через `parseOverrides` (катало-respecting) — unknown keys, negative numbers, NaN отсекаются
    - **3 новых error codes** в `src/lib/api/errors.ts`: `PARENT_NOT_FOUND`, `INHERITANCE_CYCLE`, `STRICT_LIMIT`
    - **Audit log diff** расширен: `diff.inheritsFromPlanId` (когда меняется), `diff.features` (per-key before/after для каждого FEATURE_KEY который сдвинулся). Идёт в **обе** таблицы (`BillingAuditLog` + `AdminAuditLog`) atomically внутри tx
  - **Mass-notify** (`BILLING_PLAN_EDITED`) — `buildPlanEditedSummary` теперь принимает `featuresSummary: string`. Endpoint строит summary за пределами tx: only `status === "active"` features, boolean adds/removes → «добавлено: X, Y» / «убрано: Z», limit changes → «изменены лимиты: W» (без raw numbers — детали в audit). Sparse edits (only sortOrder) корректно skip enqueue
  - **UI components:**
    - **Новый** [`plan-features-editor.tsx`](src/features/admin-cabinet/billing/components/plan-features-editor.tsx) (~340 LOC) — search + grouped sections + `BooleanFeatureRow` + `LimitFeatureRow`. Inheritance hints через `inheritedFromLabel(state, plansById)`. Client-side `isRelaxedLimit` validation в `setLimit` — блокирует Save через `limitErrors` state с message «Значение строже родительского лимита»
    - [`plan-edit-dialog.tsx`](src/features/admin-cabinet/billing/components/plan-edit-dialog.tsx) переписан — добавлен `Tabs` (Основное / Возможности), state `inheritsFromPlanId: string | null` + `features: PlanFeatureOverrides`, parent select section с `parentCandidates` (same scope, exclude self), `featuresNote` placeholder удалён, `errorFeaturesValidation` + `errorStrictLimit` + `errorInheritanceCycle` + `errorParentNotFound` strings добавлены в `editDialog.*`
    - [`plans-grid.tsx`](src/features/admin-cabinet/billing/components/plans-grid.tsx) + [`admin-billing.tsx`](src/features/admin-cabinet/billing/components/admin-billing.tsx) + [`page.tsx`](src/app/(admin)/admin/billing/page.tsx) — пропатчены: `candidates: AdminPlanInheritanceCandidate[]` пробрасывается до dialog
  - **Types extended:** `AdminPlanCard.rawFeatures: PlanFeatureOverrides` (через `parseOverrides`) + `AdminPlanCard.inheritsFromPlanId: string | null` (cnu без второго round-trip). Новый `AdminPlanInheritanceCandidate` — light shape для inheritance select
  - **Server service extended:** [`plans.service.ts`](src/features/admin-cabinet/billing/server/plans.service.ts) — `listAdminPlans()` теперь populates `rawFeatures` + `inheritsFromPlanId`; новая `listInheritanceCandidates()` для billing page parallel fetch
  - **Domain helpers** — все 100% reused, signatures intact: `resolveEffectiveFeatures`, `parseOverrides`, `applyOverrides`, `deriveUiState`, `canDisableFeature`, `isRelaxedLimit`, `getDefaultPlanFeatures`. **Без изменений**
  - **UI_TEXT** ([`text.ts`](src/lib/ui/text.ts)):
    - `adminPanel.billing.editDialog.tabs` (main/features), `editDialog.sections.inheritance`, `editDialog.fields.inheritsFrom*`, `editDialog.error*` (4 server-side errors)
    - **Новая подветка** `adminPanel.billing.features.*` (~10 keys) — search/inheritance hints/lock messages, восстановлены из legacy 1:1
    - **Удалён:** `featuresNote` placeholder из `editDialog` (фича теперь functional)
  - **Tests:** [`src/lib/billing/features.test.ts`](src/lib/billing/features.test.ts) — **29 unit tests** (218 → 247 total). Coverage: `isRelaxedLimit` (6 edge cases: undefined parent, null↔null, null↔value, exact, exceed, stricter), `resolveEffectiveFeatures` (root, single override, root-to-leaf chain, limit override, unlimited override, self-cycle resilience, two-node cycle resilience), `parseOverrides` (catalog filtering, boolean false drop, null preserve, numeric preserve, negative reject, NaN reject, non-object input), `applyOverrides` (immutability, conditional apply, null overrides), `canDisableFeature` (inherited true blocks, locally overridden allows, false always allows), `deriveUiState` (local vs inherited distinction)
  - **Notes:**
    - Plan без prices (после FIX-A cleanup) — dialog корректно открывается, features tab работает (prices section используют `priceForPeriod` fallback to "0")
    - Create plan через UI остаётся **не реализован** — dialog только edit. Backlog 🔵
    - Audit log diff включает features changes — admin может посмотреть exact before/after в `BillingAuditLog` / `AdminAuditLog` rows
  - **Validation:** typecheck ✅, lint baseline 588/87 preserved, encoding/mojibake/prisma ✅, **247/247 tests passing** (218 → 247, +29)

### 2026-04-XX — Cabinet Client + Public profile + Chat + Multi-city sprint
- **22b** — favorites feature with user-favorites management + UI updates
- **22a-FIX-1/2/3** — smart tags real-time, premium search bar, autocomplete API for catalog
- **27a-CLIENTS-CRM** (`84707fc`) — Master cabinet → Clients management (CRM cards + notes + photos)
- **27b-REVIEWS-MASTER** (`9d7bae9`) — review actions, display, stats
- **27c-ANALYTICS** (`9709943`) — top services + insights engine
- **27d-OFFERS-MODEL** (`458643c`) — master cabinet model offers + applications
- **28-PROFILE-COMPLETION** (`d9a0c98`) — profile completion calculation logic
- **29-PROFILE-FIXES** (`f93d96e` + `8c1edd5`) — nickname editable, LTV terminology, account sub-pages, booking actions, reschedule, confirm modal
- **30-CLIENT-CABINET** (PR #70 `e0bf550`) — Cabinet Client полностью переписан
- **31-PACKAGES** — ServicePackage / ServicePackageItem schema + UI
- **32a-PUBLIC-PROFILE** (`6a3c027`) — public master profile `/u/[username]` redesign
- **32b-BOOKING-WIDGET** (`548024f`) — full booking flow with guest checkout, confirmation, conflict handling
- **33a-CHAT-FOUNDATION** (`9ad5edc`) — universal chat для master + client cabinets, aggregated per-person threads, SSE real-time, opaque ConversationSlug
- **MULTI-CITY-FOUNDATION** (`595fc44` + `7b20483`) — City model + Provider.cityId + detect-city + admin/cities + city-selector + first-visit prompt + backfill script
- **STORIES** (multiple commits) — auto-publish stories + viewer overlay + progress bar animation
- **BRAND-KIT** (`d10688b`) — Logo kit + BrandLogo component
- **TRIAL-SUBS** (`a974529`) — 30-day onboarding gift + notifications + cron
- **EMAIL-OTP** (`60474af`) — email-OTP flow + validation + rate-limit
- **REVIEW-REPORTS** (`cd4b289`) — reportedAt + reportReason + UI components
- **MEDIA-CROP** (`49cf4b6`) — cropping functionality + UI + API
- **DOCKER + CI** (`15ecfcd`) — Docker multi-stage builds + CI/CD workflow
- **ENV-DISCIPLINE** (`acac724`) — migration to `src/lib/env.ts`; `process.env.*` banned in src/
- **CORS + RATE-LIMIT** (`41a8ff0`) — CORS middleware + enhanced rate-limit responses
- **MARKETING REDESIGN** (multiple commits) — about / how-it-works / how-to-book / become-master / faq / help / partners / blog
- **modals-investigation** (`045fbcc`) — Portal-to-body fix для recurring modal top-clip
- **schedule-hours-redesign** (`ce39990`) — Compact weekly schedule editor

---

## 📊 РЕАЛИСТИЧНЫЙ ПЛАН ДО PRODUCTION (обновлено 2026-05-13)

### Phase 1 — Cabinet Master ✅ ЗАВЕРШЕН
### Phase 1.5 — Cabinet Client + Public profile + Chat + Multi-city ✅ ЗАВЕРШЕН (merged main)

### Phase 2 — Admin Panel ✅ ЗАВЕРШЁН
- ADMIN-SHELL-A ✅
- ADMIN-DASH-A ✅
- ADMIN-CATALOG-A ✅
- ADMIN-CITIES-UI ✅
- ADMIN-USERS-A ✅
- ADMIN-BILLING-A + MRR-SNAPSHOTS-A + ADMIN-BILLING-B ✅
- ADMIN-REVIEWS-A ✅
- ADMIN-SETTINGS-A ✅
- **Все 8 коммитов выполнены. Следующая фаза:** Cabinet Studio redesign (Phase 3)

### Phase 3 — Cabinet Studio redesign (не начат)
- Studio shell + dashboard
- Calendar (multi-master view)
- Team management (invites, roles, permissions)
- Studio bookings list
- Studio services & portfolio
- Studio analytics & finance
- Studio notifications integration
- **При завершении:** удалить `master-schedule-editor.tsx` (legacy)
- **Итого:** 7-9 коммитов, 2-3 недели

### Phase 4 — Public surfaces remaining
- Studio public profile (`/providers/[id]`)
- Catalog enhancements (slotPrecision / visibleSlotDays integration)
- Hot slots `/hot` redesign
- Models offer pages
- Inspiration feed `/inspiration`
- Pricing page redesign
- **Итого:** 4-5 коммитов, 1-2 недели

### Phase 5 — Chat enhancements (foundation уже ✅)
- Image attachments
- Read receipts + typing indicators
- BookingChat ↔ universal chat consolidation
- **Итого:** 2-3 коммита, 1 неделя

### Phase 6 — Pre-launch infrastructure
- SMS gateway integration (P1, см. блокеры)
- Yandex Cloud full deployment (DEPLOY_GUIDE.md done — нужен test pass)
- Monitoring + alerts (APM для admin dashboard — uptime + p95)
- Backups testing
- Test coverage expansion (billing!)
- CI tests integration (`npm run test` в quality-gates.yml)
- Email HTML templates с branding
- RBAC аудит /api/admin/*
- Booking flow enforcement (minBookingHoursAhead / maxBookingDaysAhead / acceptNewClients)
- Модель жалоб (Review.moderationResolvedAt или ReviewReport table)
- **Итого:** 5-7 коммитов, 2-3 недели

### Phase 7 — Legacy cleanup sweep
- **Admin Phase 2 cleanup** ✅ PHASE-7-CLEANUP-A (2026-05-13) — удалены 7 legacy admin UI components + 4 legacy API endpoints + 463 dead UI_TEXT keys (~3 810 LOC)
- **Остаточная работа:**
  - Cascade-delete `SiteLogoManager` (orphan после Phase 7 cleanup #1) + `UI_TEXT.admin.media.siteLogo*` keys
  - Migrate `LoginHeroImageManager` UI_TEXT с `admin.media.*` → `adminPanel.settings.sections.loginHero.*` + удалить всю `admin.media.*` ветку
  - `master-schedule-editor.tsx` (1 488 LOC) — только после Cabinet Studio redesign (зависит от migration оставшихся callsites)
  - Дубликат `wouldCreateCycle` (ADMIN-CATALOG-A) → `src/lib/catalog/cycle-detection.ts`
  - Прочие @deprecated находки (FeatureGate prop, focal-image wrapper, home/stories+feed legacy endpoints) — отдельные audits, не в scope админского cleanup
- **Итого:** 1 коммит после Cabinet Studio sprint завершится, ~1-2 дня

### Phase 8 — Onboarding & docs
- Master onboarding flow
- Видео/screenshots гайды
- Support документация
- FAQ
- **Итого:** 2-3 коммита, 1 неделя

**Итого до production: ~20-25 коммитов, 8-10 недель работы** (с учётом ~146 коммитов завершено с 25 марта).

---

## КАК ИСПОЛЬЗОВАТЬ

1. **При обсуждении** новой фичи которую решаем не делать — **сразу** добавлять сюда
2. **Категория + приоритет** — обязательны
3. **Краткое описание** — что именно отложено + почему
4. **При выполнении** — перенести в «Выполнено» с датой
5. **Periodic review** — раз в спринт прогон списка, оценка приоритетов
6. **Перед каждым промптом** — проверить relevant section на things that might've been forgotten

Это **один источник правды** для отложенных задач. Не разбросано по разным промптам.

---

## ⚠️ ВАЖНО: ФАЙЛ ДОЛЖЕН БЫТЬ ЗАКОММИЧЕН

Этот файл — **проектная документация**, не локальное состояние. Должен быть в git:

```bash
# Если файл в .gitignore — убрать оттуда
# Открыть .gitignore и удалить строку с BACKLOG.md
# Затем:
git add BACKLOG.md
git commit -m "chore: add BACKLOG.md to repo (project documentation)"
```

Иначе при работе в эфемерных средах (Codespaces/Cursor Cloud/devcontainer) или после `git clean -fdx` файл пропадает. Это уже происходило один раз — потеряны были обновления из ADMIN-SHELL-A audit. Не повторять.

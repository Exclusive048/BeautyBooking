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
- [x] **Studio schedule request approval UI** — закрыт functional gap: API `/api/studio/schedule/requests/*` (GET list + GET detail + POST approve + POST reject) уже существовал, но не было UI surface. Новая страница `/cabinet/studio/schedule-requests` с двумя секциями (Ожидают решения / Недавние решения), per-request card с inline preview payload (EDITOR_V1 + legacy + unknown formats), Approve/Reject действия через `ModalSurface` диалоги (reject требует комментарий). Sidebar получил pending count badge — `countPendingScheduleRequests(studioId)` fetched в layout, передаётся в `StudioSidebar` (новый prop). Module `src/features/studio-cabinet/schedule-requests/` (server service + lib payload-display + 5 components). Стайлинг — existing studio cabinet pattern (header + Card + Badge), без MasterPageHeader (зарезервирован для STUDIO-SHELL-A). UI_TEXT subtree `studioCabinet.scheduleRequests.*` (30+ keys). Notifications мастеру (`SCHEDULE_REQUEST_APPROVED` / `SCHEDULE_REQUEST_REJECTED`) уже работают через existing `notifyScheduleRequestApproved/Rejected` (STUDIO-SCHEDULE-REQUEST-APPROVAL-A)
- [x] **Studio cabinet shell foundation** — sidebar rewrite + minimalistic topbar + UserChip + sidebar counts service. Single source of truth для navigation `src/features/studio-cabinet/config/studio-nav.ts` (12 items в 5 группах: Студия, Команда, Клиенты, Бизнес, Студия meta — без Rooms intentionally). Использует master-cabinet shared primitives (`SidebarItem`, `NavGroup`, `BrandLogo`) для pixel-level parity. Badge counts (`scheduleRequestsPending`, `reviewsUnanswered`, `notificationsUnread`) запрашиваются параллельно через `getStudioSidebarCounts`. Topbar минималистичный (studio chip + theme toggle + external link), per-page headers — в отдельных коммитах per page. Mobile bottom nav адаптирован под новый `STUDIO_NAV` config с More drawer. Existing pages работают под новым shell без изменений. Legacy `studio-navbar.tsx` остаётся untouched (используется billing page out-of-route) — pursue cleanup в Phase 7 (STUDIO-SHELL-A)
- [x] **Symmetric switcher rollback** — initial STUDIO-SHELL-A добавил dropdown с «Перейти в кабинет мастера» в `StudioUserChip`. **User уточнил:** cross-cabinet навигация уже существует в public header (`auth-user-menu.tsx` через `clientCabinet.switcher.*`), в cabinet UI duplication — лишний noise. Откат: `StudioUserChip` simplified to static info-card (mirrors `MasterUserChip` pattern — avatar + name + studio tagline, no interactivity). Удалены `hasMasterCabinet` prop chain, server helper `userHasMasterCabinet()` (orphan after rollback), UI_TEXT keys `switchToMaster` / `profile` / `logout`. Public header switcher НЕ затронут. Closes open question из STUDIO-SHELL-A (option B selected: one-way OK, cross-cabinet nav exclusively через public header) (SYMMETRIC-SWITCHER-A)
- [x] **Studio cabinet dashboard redesign** — `/cabinet/studio` page rewritten as rich dashboard mirroring master pattern. New module `src/features/studio-cabinet/dashboard/` (10 components + 1 server service + 2 lib helpers) replaces legacy 4-card stats + quick actions. Sections: Today banner (gradient hero с avatars on shift + counter), 4 KPI tiles (Выручка / Записи / Загрузка / Рейтинг — все за 30 дней с delta-badges vs предыдущий период), Top-5 masters by revenue 30d + progress bars, Attention panel (4 типа items: pending master approvals / bookings awaiting confirmation / unanswered reviews / pending schedule-requests — items с count=0 hidden), Top-3 masters by occupancy today (заменяет «Загрузка кабинетов» из jsx референса, rooms excluded per scope), Popular services (top 5 by booking count за 30d), Revenue chart с client-side period selector (7д/30д/90д/Год) и refresh через новый `/api/studio/dashboard/revenue` endpoint. Уровень загрузки — pragmatic proxy `bookings/(masters×30×5)` (precise slot-engine computation → backlog). Page styling — upgraded body sections с new design language но без StudioPageHeader pattern (тот введётся в following commits). Legacy `getStudioDashboardStats` + `DashboardNavCards` помечены `@deprecated` (no other consumers, Phase 7 cleanup). UI_TEXT subtree `studioCabinet.dashboardV2.*` (~50 keys) (STUDIO-DASHBOARD-A)
- [x] **Studio schedule multi-master redesign** — `/cabinet/studio/calendar` rewritten как multi-master grid. New module `src/features/studio-cabinet/schedule/` (~16 components + 1 server service + 3 lib helpers). День view: time axis (09:00-21:00, 30min slots) × master columns (header с avatar/name/rating, NO «К.N», NO PREMIUM badge per invariant #20), booking cells absolute-positioned by start/duration с status colors (confirmed/pending/new client/done), break cells (TimeBlock), current time line (red), disabled master columns с hatched «Недоступен» overlay. Empty cell click → create dialog (master + service + client + phone). Booking cell click → action menu (детали / перенести на мастера / перенести по времени / отменить). Неделя view: master rows × weekday columns с occupancy summary (`booked/capacity` + progress bar), click cell → switch to day view. URL-driven state `?view=day|week&date=YYYY-MM-DD`. Manual «Обновить» button + auto `router.refresh()` после каждого action. **NO D&D** (backlog), **NO Месяц** view (backlog), **NO «По кабинетам»** toggle, **NO auto-refresh/SSE** (manual). Admin booking ops (create/move/cancel) DIRECT через existing endpoints (`POST /api/studio/bookings`, `PATCH /api/studio/bookings/[id]/move`, `POST /api/bookings/[id]/cancel`) — no ScheduleChangeRequest approval. ScheduleChangeRequest scope остаётся master-initiated working-hours changes only. Occupancy proxy = `bookings / (mastersOnShift × 5)` consistent с dashboard. Legacy `studio-calendar-page.tsx` (695 LOC) помечен `@deprecated`. UI_TEXT subtree `studioCabinet.scheduleV2.*` (~90 keys). New invariant #22 (admin booking CRUD direct vs approval flow scope) (STUDIO-SCHEDULE-A)
- [x] **Studio masters page redesign** — `/cabinet/studio/team` page rewritten с 2-column layout (filters + list / detail panel). New module `src/features/studio-cabinet/masters/` (10 components + 2 server services + 2 lib helpers). Status display derived from existing data model (Provider.ownerUserId + isPublished + pending StudioInvite presence) — maps to ACTIVE / INVITED / DISABLED без schema migration. URL state `?tab=` / `?q=` / `?master=` для shareable filters + selection. Detail panel: header с avatar + status + actions (Расписание / Публичный профиль / Написать / Pause-Activate), 4 KPI tiles (revenue / bookings / occupancy / rating за 30 дней — display only, **no commission, no payouts**), week schedule (7 дней Mon-Sun с occupancy bars + today highlight). Invite через ModalSurface dialog → reuses existing `POST /api/studio/masters`. Pause/Activate через existing `PATCH /api/studio/masters/[id]` с `isActive` flag. **Studio masters никогда не показывают PREMIUM badge** — invariant добавлен в Раздел 12. **Permissions toggles полностью отсутствуют** — schedule через approval flow (STUDIO-SCHEDULE-REQUEST-APPROVAL-A), services по studio policy, notifications через user preferences. Capacity occupancy proxy = `bookings / (30 × 5)` consistent с dashboard heuristic. Legacy `StudioTeamPage` / `TeamMemberCard` / `TeamTabs` помечены `@deprecated`. Existing `MasterCardDrawer` сохранён — используется в studio-services-page. UI_TEXT subtree `studioCabinet.mastersV2.*` (~60 keys) (STUDIO-MASTERS-A)
- [x] **🔴 Category unification (pre-launch blocker resolved)** — closes core product-flow bug where studio-created services were invisible in the public catalog (catalog filters by `globalCategoryId`; new STUDIO-SERVICES-A UI was writing only legacy `ServiceCategory.categoryId`). **Strategy: forward-only unification, NO schema migration** — `Service.categoryId` was already optional in Prisma; only Zod validator enforced it. Changes: (1) `createStudioServiceSchema.categoryId` relaxed to optional + new optional `globalCategoryId` + new `proposerUserId` param for own-pending validation; (2) `createStudioService` lib helper accepts no-`categoryId` path + validates `globalCategoryId` against APPROVED-or-own-pending (mirrors master `listAvailableGlobalCategories`); (3) `/api/studio/services` POST passes `user.id` as `proposerUserId`; (4) `services-data.service.ts` rewritten — groups by `globalCategoryId` (not legacy `categoryId`), sidebar union'es APPROVED + own-pending + actually-used + synthetic «Без категории» bucket; (5) `add-service-dialog` rewritten — picker shows APPROVED + own-pending with `· на модерации` suffix; inline «+ Новая категория» calls `POST /api/categories/propose` (mirrors master service modal pattern), auto-selects freshly-proposed; (6) `service-detail-panel` PATCH body switches `categoryId` → `globalCategoryId`; (7) `add-category-dialog` (sidebar trigger) rewired from legacy `/api/studio/categories` → `/api/categories/propose`; (8) sidebar shows PENDING badge с tooltip «видна только вам». **CORE invariant verified: услуга студии → `globalCategoryId` → catalog filter** (`catalog.service.ts:332` `globalCategoryId: { in: categoryIds }`). Legacy `ServiceCategory` schema model untouched + endpoint `/api/studio/categories` untouched — still works для legacy `studio-settings-page.tsx` services tab. No data migration: pre-launch existing services без `globalCategoryId` show в «Без категории» bucket для admin, остаются invisible в catalog (user-acceptable per scope). New invariant #23: GlobalCategory APPROVED = public/global visibility; PENDING = creator scope only (CATEGORY-UNIFICATION-A)
- [x] **Studio gap fixes (chat icon + break management)** — closing two carryovers from STUDIO-BOOKINGS-A + STUDIO-SCHEDULE-A. **Chat icon (Option C — removed):** audit revealed `resolveChatAccess` allows only `clientUserId` OR `masterProvider.ownerUserId` — studio admin (third party) returns 403 by design. Variants A (route) and B (drawer) both require auth model change (chat is 1:1 client↔master, not 3-party). Removed broken icon + column from `booking-row.tsx` + `bookings-table.tsx`. UI_TEXT `bookingsV2.actions.openChat` left as dead string (Phase 7 cleanup). **Break management dialog:** new `ManageBreaksDialog` in `schedule/components/dialogs/` triggered from schedule header «Перерывы» button. Shows existing breaks for current day with delete + form to add new TimeBlock (BREAK type) for one-time master break. Uses existing `POST /api/studio/blocks` + `DELETE /api/studio/blocks/[id]`. Recurring weekly breaks → backlog (require `ScheduleBreak` model + `ScheduleEngine.editor.ts` integration). **Cache invalidation fix:** added `invalidateSlotsForMaster(masterId)` calls to `createStudioBlock`/`updateStudioBlock`/`deleteStudioBlock` in `src/lib/studio/calendar.service.ts` — pre-existing gap (endpoint созданный для legacy editor never invalidated public booking slot cache; new admin UI now triggers proper invalidation). Admin direct (no approval — инвариант #22). UI_TEXT `studioCabinet.scheduleV2.breakDialog.*` (~13 keys) + 4 new error keys (STUDIO-GAPS-FIX-A)
- [x] **Booking policy enforcement (BACKLOG gap closed)** — pre-launch backlog item «Booking flow enforcement» closed. The 3 booking-rules fields on `Provider` (`minBookingHoursAhead`, `maxBookingDaysAhead`, `acceptNewClients`) were settable in cabinets but **never validated at booking time**, and `visibleSlotDays` was settable but ignored by the public slots endpoint. **Audit findings:** `createBooking` core didn't reference any policy field; `/api/public/providers/[id]/slots` returned everything regardless of horizon or minimum-hours-ahead; direct API callers could bypass the slot UI entirely. **Closed via:** (1) new pure helper `src/lib/bookings/policy-enforcement.ts` exposing `earliestBookableUtc` / `latestBookableUtc` / `isWithinBookableWindow` / `assertBookingWindow` (throws `AppError("BOOKING_TOO_SOON" / "BOOKING_TOO_FAR", 400)`) / `assertAcceptsNewClient` (throws `AppError("NEW_CLIENTS_CLOSED", 403)`) / `clampVisibleSlotsHorizon` (single source of truth for the rules). (2) `resolveBookingCore` extended to select the 3 policy fields + 6-line block calling `assertBookingWindow` + conditional `assertAcceptsNewClient` (counts prior non-cancelled bookings only when `acceptNewClients=false` to skip the query on the common path). (3) `/api/public/providers/[id]/slots` extended to select `minBookingHoursAhead` + `visibleSlotDays` + clamp the requested `to` key via `clampVisibleSlotsHorizon` + drop slots before `earliestBookableUtc` from `baseSlots`. **Defense in depth:** slot UI never advertises an unbookable window AND `resolveBookingCore` (called inside `createBooking`) guards against direct API callers bypassing it. **3 new ErrorCodes** added: `BOOKING_TOO_SOON`, `BOOKING_TOO_FAR`, `NEW_CLIENTS_CLOSED`. **18 unit tests** in `policy-enforcement.test.ts` (boundary conditions, both sides of the window, the "no priors" gate, horizon clamp edges). **createBooking core untouched** — guards live in `resolveBookingCore` which is called by both `createBooking` and `createClientBooking`, so both paths inherit enforcement. **No schema migration.** Tests 247→265 (+18). Validation: typecheck/encoding/mojibake/prisma ✅. Lint: my files clean; baseline drift 823/122→858/134 traced to a newly added reference file `.claude/references/PublicHeader.js` (not my code). **Full booking widget redesign deferred** — audit revealed multiple critical blockers (auth gate on `/api/bookings` POST, master-URL→profile redirect breaks scenario B, no studio slot aggregation, 600+LOC existing `StudioBookingFlow` is the working conversion path) that make a single-commit widget rewrite high-risk for the core conversion surface. Per spec's own rule «Лучше меньше но не сломать booking creation» — this commit ships the enforcement gap closure (high-value, low-risk) and defers the UX redesign to a dedicated sub-workstream below (BOOKING-WIDGET-A)
- [x] **Booking widget foundation (guest + scenario + slot aggregation) — этап 1/2** — Public surfaces workstream commit 3/N. Closes the 3 architectural blockers BOOKING-WIDGET-A identified, **without redesigning the existing widget UI** (deferred to BOOKING-WIDGET-UI-A as stage 2 per spec rule «приоритет надёжности над фичами»). **AUDIT REFINED** the 3 blockers: (1) **Auth gate is NOT in page.tsx** — `requireAuth({ allowGuests: false })` doesn't exist; the page is fully public. The gate is at `/api/bookings` POST (hard `getSessionUser(req)` + `requireRole([CLIENT])`). The widget calls `createBooking` client-fn which posts to that endpoint and shows an auth modal on `AUTH_REQUIRED`. (2) **Scenario B partially wired** — `?master=<id>` is already parsed in `page.tsx` (lines 118-119) and passed through to StudioBookingFlow as `initialMasterId` when the route is a STUDIO provider. Master-direct URL `/u/anna/booking` redirects away — solo masters use the booking UI embedded in `PublicMasterProfilePage` instead. (3) **Slot aggregation is already client-side** — `StudioBookingFlow` does `Promise.all(masters.map(fetchMasterAvailability))` + has `ANY_MASTER_ID` UI flow. The missing piece was a **server-side** aggregator for SSR'd panels. **Changes:** (1) **NEW pure helper** `src/lib/schedule/studio-slot-aggregation.ts` (~150 LOC) — `aggregateStudioSlots()` + pure `mergeByStart()` (unit-testable). Reuses `listAvailabilitySlotsPaginated` per-master (no engine rewrite). Filters MasterService rows by invariant #24 (ACTIVE masters only — `ownerUserId IS NOT NULL && isPublished`). Returns `AggregatedStudioSlot[]` carrying `availableMasterIds` + deterministic `earliestMasterId` (input order). Safety cap `maxMasters` (default 12) to bound N×Prisma. (2) **9 unit tests** `studio-slot-aggregation.test.ts` — pure merge logic (empty, single-master, dual-master same-time, order preservation, sparse 3-master matrix, chronological sort, dedup, unknown-master ordering). (3) **Guest booking enabled (surgical adaptation, NOT rewrite):** `createBooking` + `resolveBookingCore` + `resolveBookingExtras` + `idempotency.loadBookingForIdempotency` all accept `clientUserId: string | null`. When null: ownership-self check skipped, `acceptNewClients=false` gate still applies (guest = new client with 0 priors → blocked, same UX as a logged-in new client), hot-slot anti-fraud skipped (no userId for cancellation history), reference-photo attach rejected with FORBIDDEN (uploads are auth-only). Idempotency + rate-limit keys namespaced by `clientUserId ?? guest:${clientPhone}` — guest retries dedup safely on the same phone. Booking row saved with `clientUserId: null` (column already nullable in schema; `link-guest-bookings.ts` post-signup linker handles attachment when the same phone signs up later). **`createBooking` itself NOT rewritten** — idempotency / conflict / transaction / rate-limit / UTC plumbing preserved verbatim. (4) **`/api/bookings` POST adapted** — uses `getSessionUserFromRequest(req)` (nullable). Session user → require CLIENT role (preserves original semantics: MASTER/STUDIO can't book through this endpoint). No session → guest path, `clientUserId = null`. Legacy `slotLabel`-only path still requires a session (createClientBooking adaptation deferred — booking widget always sends startAtUtc/endAtUtc, so this branch isn't reached). `invalidateRecentMastersCache` guarded behind effectiveClientUserId. (5) **Widget UI minimal adaptation** — `booking-flow.tsx` collects `guestName` + `guestPhone` inputs in a new card under the booking summary when no session. Submit no longer triggers the auth modal on `AUTH_REQUIRED` (path removed); falls through to the standard error display. Existing auth modal markup left in tree (showAuthModal stays false) — Phase 7 cleanup. (6) **Scenario detection confirmed working** for studio + `?master=` (already wired before this commit; no code change needed). Solo master booking (`/u/anna/booking` URL) deliberately not enabled — solo masters use the embedded widget on their profile, redirect preserves the existing UX. **NO schema migration. NO createBooking core rewrite. NO schedule engine rewrite.** Enforcement (policy-enforcement.ts) preserved — guest is treated as a new client, so `acceptNewClients=false` providers block them with the same NEW_CLIENTS_CLOSED 403 as a logged-in new client. `link-guest-bookings.ts` post-signup linker preserved + tests still pass. Tests 265 → 274 (+9 aggregator). Validation: typecheck ✅, lint baseline 858/134 preserved (external `.claude/references/PublicHeader.js` drift noted), encoding/mojibake/prisma ✅. UI_TEXT subtree `publicStudio.guest*` (~9 keys). **Backlog spawned:** Full widget wizard UX redesign (BOOKING-WIDGET-UI-A — animated steps, sticky summary, hero, per-error inline copy), guest OTP verification (needs SMS gateway P1), phone-scoped guest anti-fraud, guest reference-photo uploads, server-side studio aggregator wiring into SSR'd public studio panel, master-direct `/u/[username]/booking` route enablement (currently solo masters book via profile page) (BOOKING-WIDGET-FOUNDATION-A)
- [x] **Public studio profile redesign (booking deep-link + slot-bar + reorder)** — first commit of the new **Public surfaces** workstream after Cabinet Studio sprint closed. Surgical redesign of `src/features/public-studio/public-studio-profile-page.tsx`. **Audit found infrastructure largely in place:** route `/u/[username]` already resolves both master + studio via `result.providerType` and routes to `PublicStudioProfilePage`; loading.tsx ships proper skeletons (no nulls); each section is its own Suspense boundary with parallel-fetch sections. **What changed:** (1) **Dropped inline `<StudioBookingSection>`** — the full booking flow was embedded on the profile page; per spec it now lives strictly at `/u/[username]/booking` (separate widget, separate commit). The hero / slot-bar / sticky CTA all already deep-link to `studioBookingUrl()` — booking flow stays a marketing page that funnels into the dedicated widget. (2) **New `<StudioSlotBarSection>`** — accent CTA bar between hero and services. Audit-driven decision: `buildSlotsForDay` is per-master only, no studio-scope aggregator exists (`getStudioFreeSlots` / `studioAvailability` not found). Building a live "Сегодня свободны N окон" counter would either require N parallel per-master calls (heavy first paint) or a new aggregator service. Honest fallback ships: a deep-link CTA without a live count, backlogged as «Studio public live slot aggregation». (3) **Reordered sections** per spec: hero → slot bar → services → team → photos → reviews → contacts (was: hero → booking → details → photos → reviews → services → team). Sticky bottom-right CTA changed anchor from `#studio-booking-entry` to `#studio-services` (entry now goes via slot-bar). **Out of scope per spec, all backlogged:** owner toolbar / ProfileEditor (STUDIO-SETTINGS-A owns edit surface), page-view + conversion analytics (no tracking infra), FAQ section (no schema entity), studio history/values/philosophy long-form (no fields beyond description), «Написать в студию» pre-booking chat (STUDIO-GAPS-FIX-A auth blocker precedent), verification badge (no field), metro/walkMinutes (no fields). UI_TEXT subtree `publicStudio.slotBar.*` (~4 keys). Sections reused as-is (hero/services/team/photos/reviews/details — internally already use `Promise.all`). Audit-flagged sequential-await risk on `/u/[username]` was already addressed in existing implementation. Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-PUBLIC-PROFILE-A)
- [x] **Studio settings page (5 sections, sprint finale) — 🎉 Cabinet Studio sprint COMPLETE** — `/cabinet/studio/settings` index rewritten as SSR 5-section page (was: redirect to `/settings/profile` legacy tabs). New module `src/features/studio-cabinet/settings/` (~12 components + 1 server service + 1 lib). **5 sections per audit-driven scope:** (1) **Общее** — editable name/tagline/description via `PATCH /api/studios/[id]`; read-only logo + address + Yandex Maps link (logo upload + address geocoding require existing legacy editor UI; surfaced as backlog with honest "legacy флоу" hint). (2) **Владелец и команда** — owner + ADMIN list from `StudioMembership` (MASTER role intentionally NOT shown — STUDIO-MASTERS-A owns that surface). Transfer ownership + invite admin surfaced as backlog placeholders (no platform mechanism exists). (3) **Уведомления и связь** — closes STUDIO-NOTIFICATIONS-A info-banner promise. Reuses existing `<TelegramNotificationsSection>` + `<VkNotificationsSection>` client components. Push status read-only display (PWA toggles implicit; per-team per-type prefs need new schema → backlog). SMS intentionally absent (P1 gateway blocker). (4) **Правила студии** — read-only summary of Provider policy (`minBookingHoursAhead` / `maxBookingDaysAhead` / `cancellationDeadlineHours` / `lateCancelAction` / `acceptNewClients` / `remindersEnabled`) with deep link to schedule settings editor (master pattern is the only edit surface for these — no studio fork). (5) **Опасная зона** — OWNER only (nav hides for non-owners + server-side double-check). Archive = `PATCH /api/studios/[id] { isPublished: false }` reused. Delete = existing `DELETE /api/cabinet/studio/delete` reused (`deleteStudioCabinet` lib helper enforces OWNER + no-active-bookings; partial anonymisation is a known cross-ref backlog item). Deletion gated by retype-studio-name confirmation. **NO «Реквизиты и налоги» section** (payouts deferred per STUDIO-SERVICES-A/FINANCE-REMOVE). **NO «Интеграции» section** (only 3 of 8 mock integrations are real; management UI doesn't exist for those 3). **Legacy services tab dead code** — sub-route `/cabinet/studio/settings/services` redirects to `/cabinet/studio/services` (verified), so the embed inside legacy `studio-settings-page.tsx` (837 LOC) is unreachable via routing. Old sub-routes (profile/portfolio/general/public/features) left untouched for backwards-compat with deep links to the portfolio + main profile editing UI (still legacy). CRM scope: OWNER full / ADMIN no danger / MASTER refused at route. URL state `?section=general|owner-team|notifications|policy|danger`. UI_TEXT subtree `studioCabinet.settingsV2.*` (~70 keys). Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-SETTINGS-A). **🎉 Cabinet Studio sprint COMPLETE — 19 коммитов (shell → dashboard → masters → schedule → bookings → services → packages → category-unification → gaps-fix → bugs-fix → polish → showcase seed → seed consolidation → clients → reviews → notifications → analytics → finance removed → settings) + 4 рабочих showcase телефона (100/200/300/400).**
- [x] **Studio Finance removal (nav + route + orphans cleanup)** — product decision: the standalone studio Finance page **is not built**. Every meaningful slice it would surface (period revenue, breakdown by master, breakdown by service) is already part of `/cabinet/studio/analytics`. Distinguishing content (commission split / payout flow / expense tracking) doesn't exist in the platform — Finance would be a confusing duplicate of Analytics. **Cleanup deltas:** (1) removed `finance` nav-item from `src/features/studio-cabinet/config/studio-nav.ts` (incl. labelKey union member) — sidebar Business group now has only Analytics; (2) removed finance entry from legacy `studio-navbar.tsx`; (3) `/cabinet/studio/finance` route replaced with a permanent redirect to `/cabinet/studio/analytics` (no 404 for old bookmarks / external links); (4) deleted `loading.tsx`, orphan component `src/features/studio/components/studio-finance-page.tsx`, orphan endpoints `/api/studio/finance` + `/api/studio/finance/summary` (only consumer was the deleted page), OpenAPI schemas `StudioFinanceRow` + `StudioFinanceData` + the `/api/studio/finance` spec entry; (5) UI_TEXT cleaned — removed `studioCabinet.nav.finance`, `nav.items.finance`, `financePage`, `dashboard.financeTitle/Subtitle`, the entire `studioCabinet.finance` block (~30 keys). Kept `studioCabinet.notificationsV2.filters.finance` (notifications chip — unrelated scope). Showcase data unaffected (no finance-specific seed). Sprint follow-up map updated: **Finance page struck from the 5-follow-up plan** (was overstated — never needed). Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-FINANCE-REMOVE-A)
- [x] **Studio analytics page (4 views + KPI + charts + plan gate)** — `/cabinet/studio/analytics` rewrite. Replaces legacy `<AnalyticsPage scope="STUDIO" />` (shared client component). New module `src/features/studio-cabinet/analytics/` (~14 components + 2 server services + 2 lib helpers). **Reuses all 15 `/api/analytics/*` domain helpers** + `getPlanFeaturesForUser` + `resolveAnalyticsContext` + master's `FeatureGate` component + master's period helpers (`computeRollingRange`, `formatPeriodDisplay`). **4 view tabs:** Overview (KPI bar + revenue line chart with prev-period overlay + sources donut + hours heatmap), Masters (table: bookings/revenue/avg-check/occupancy/rating — **NO «ВАМ» column**, payouts deferred per STUDIO-SERVICES-A precedent), Services (bookings/revenue/%share/distinct master count), Clients (5 segments + top-10 by revenue with name resolution). **4 period presets:** 7d/30d/90d/year (no custom picker — backlogged, master PREMIUM gate precedent). **Compare toggle** drives KPI deltas + revenue chart dashed overlay (default ON). **Plan gating per section:** `dashboard` (FREE+) shows KPI; `revenue` (PRO+) gates revenue chart + Masters + Services tables; `clients` (PRO+) gates Clients view; `bookingInsights` (PREMIUM+) gates hours heatmap. FREE users see KPI + sources only with blurred-preview upgrade card lifted over locked sections (master `<FeatureGate>` reused). **Inline-SVG charts** (no external chart lib — same approach as master analytics, single bundle). **BookingSource breakdown** computed inline via single Prisma `groupBy` (no endpoint exposes it; only 3 real enum values WEB/MANUAL/APP → «Каталог»/«Звонок»/«Приложение», sources with count=0 hidden so no fake APP slice). **Per-view dispatch** in server orchestrator — only the active view's data is fetched (Promise.all within view), tab switches are cheap full-page SSR re-renders. **Occupancy column** in Masters reuses dashboard 5-slots/day proxy (cross-ref STUDIO-DASHBOARD-A backlog for precise slot-engine integration). **CRM scope:** `resolveAnalyticsContext({scope: "STUDIO"})` handles owner/admin access. **Compare KPIs** via `getDashboardKpi`'s built-in `prevRange` support (revenue/bookings/avgCheck/occupancy/returnRate all computed from raw bookings, no snapshot needed). Showcase Vision (PREMIUM) renders all sections — 56 bookings across periods give non-empty revenue chart, masters table, services table, top clients. URL state `?period=&view=&compare=`. UI_TEXT subtree `studioCabinet.analyticsV2.*` (~55 keys). Legacy `<AnalyticsPage scope="STUDIO" />` no longer referenced by this route. Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-ANALYTICS-A)
- [x] **Studio notifications page (chip filters + actionable + scoped feed)** — new `/cabinet/studio/notifications` route (sidebar nav-item was wired in STUDIO-SHELL-A but page didn't exist; now functional). New module `src/features/studio-cabinet/notifications/` (~7 components + 1 server service + 2 lib helpers). **Reuses 26-NOTIF infrastructure verbatim:** `getNotificationCenterData` (computes per-notification channel + injects PENDING ScheduleChangeRequest pseudo-notifications), `groupNotificationsByDay`, `readNotificationPayload`, `getCardConfig` — single source of truth across master + studio. Studio scope: filter `channel === "STUDIO"`. **Actionable mirror of master pattern** — master has inline confirm/decline for BOOKING_REQUEST (binary action); studio mirrors with inline Approve/Reject for SCHEDULE_REQUEST (also binary). Reject opens `window.prompt` for comment (consistent with master decline pattern). Both surfaces also expose a richer-page "Open" link. Other notification types → navigation chips («К записи / К отзыву / К чату / К клиенту»). **4 KPI tiles:** unread + total, today, needs-decision (count of SCHEDULE_REQUEST pseudo-items), push enabled status. **10 chip filters** (Все / Непрочитанные / Записи / Отмены / Переносы / Отзывы / Сообщения / Команда / Финансы / Системные). Studio-specific chip classifier (`chip-classifier.ts`) extends master's bucketing with Team (STUDIO_*) + Finance (BILLING_* including admin-initiated variants) buckets. **Bulk «Прочитать всё» reuses** `POST /api/notifications/read-all?context=all`. **No cabinet/room artifacts** — confirmed absent in schema (no `model Cabinet`, no `cabinetNumber`, no notification type for cabinet conflict). "Касается: {client} · {service}" line uses denormalised `payloadJson` keys (clientName + serviceName), no «Кабинет N». **No new API endpoints** — POST `/api/studio/schedule/requests/[id]/{approve,reject}` (from STUDIO-SCHEDULE-REQUEST-APPROVAL-A) called directly from action island. Info banner explains the single-recipient delivery model + links to studio settings (placeholder route — settings redesign pending). Showcase data: 12 Vision notifications across 7 types + 2 PENDING ScheduleChangeRequest pseudo-items surface correctly via `getNotificationCenterData` → 4 unread + 2 needs-decision. UI_TEXT subtree `studioCabinet.notificationsV2.*` (~55 keys). Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-NOTIFICATIONS-A)
- [x] **Studio reviews page (stats + filters + scoped reply)** — `/cabinet/studio/reviews` rewrite. New module `src/features/studio-cabinet/reviews/` (~12 components + 2 server services + 2 lib helpers). Replaces legacy `src/features/studio/components/studio-reviews-page.tsx` (client-only basic table, no reply form). **3 stat cards** (replaces ref's "топ/анти-топ мастера"): avg rating (no delta — same snapshot gap STUDIO-DASHBOARD-A flagged) + star distribution histogram (5★..1★ count + %) + **top services by reviews** (count group-by service, top 5). **4 filter chips** (Все / Без ответа / Низкие оценки / 5★) + master select, URL state `?filter=&master=&cursor=`. **Reply ALWAYS labelled «Ответ студии»** — `Review.replyText` carries the published reply, no `repliedByUserId` field in the schema, so reply identity stays implicit (no master attribution surfaced per spec). **CRM scope at service layer** (`loadStudioReviewsList.resolveScope`): OWNER/STUDIO_ADMIN → `canReply=true` for ALL studio reviews; MASTER in studio → `canReply=true` ONLY for reviews where `Review.masterId === masterProvider.id`. **Reply endpoint reused** (`POST /api/reviews/[id]/reply`) — extended `ensureMasterReviewAccess` in `src/lib/reviews/service.ts` to also allow active OWNER/ADMIN of the studio the master belongs to (5-line addition). Reply text is the same shape — no new endpoint. **Report (Пожаловаться) reused** (`POST /api/reviews/[id]/report`) — denormalised `reportReason/reportComment/reportedAt` on Review, one report per review enforced server-side (409 on retry). UI dialog with 5-reason select + optional comment textarea. **No deletion/hide** — reviews are immutable from the studio surface; moderation runs through admin via Report (per spec, soft-delete invariant #17). **No bookmark icon, no "Запрос отзыва", no "Ответить всем", no toggle, no rating delta** — all deferred to backlog. Showcase data: 15 Vision reviews (11×5★ + 3×4★ + 1×3★, 7 with replies) render correctly with proper distribution + filter counts. N+1 prevention: single broad query for reviews with `booking.service` join + single masters query. Legacy file marked `@deprecated` (still referenced by old test surfaces). UI_TEXT subtree `studioCabinet.reviewsV2.*` (~45 keys). Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-REVIEWS-A)
- [x] **Seed consolidation (4 showcase phones + P2002 fix)** — pre-launch hardening of the test-data seed pipeline. **P2002 root cause:** `seed-showcase-master.ts:120` used `upsert({ where: { email } })` then set `phone: PHONE` in the `create` branch. Any drift between seed generations (different canonical phone or stale row holding the canonical email/publicUsername) made the `create` path collide on the `phone` unique constraint. New helper `prisma/seeds/test-data/helpers/ensure-user.ts` exports `ensureUserByPhone(input)` — phone-first upsert with a Phase 1 "shadow release": any row that holds the canonical email OR publicUsername with a *different* phone gets its unique fields renamed to per-row placeholders (`released-<id>@<SEED_EMAIL_DOMAIN>`, `publicUsername=null`) before the Phase 2 upsert-by-phone proceeds. Result: rerunning `npm run seed:test` without reset no longer throws P2002 even if canonical identifiers drift between commits. **Showcase phone schema 100/200/300/400:** four memorable demo phones outside the generic `+7900000xxxx` range — `+79991000000` solo master (Анна — was `+79991000009`, migrated by reset+rerun), `+79992000000` studio owner (Виктория Vision), `+79993000000` master-in-studio (Марина, ordinal 1 of Vision's 7 masters — overrides her ordinal-derived `+79992000001`), `+79994000000` platform admin (new). New constants in `helpers/markers.ts`: `SHOWCASE_PHONE_{MASTER,STUDIO_OWNER,STUDIO_MASTER,ADMIN}` + `SHOWCASE_PHONE_PREFIXES = ["+79991","+79992","+79993","+79994"]` (covers all showcase phones including Vision team). `reset.ts` extended to match these prefixes alongside the generic prefix + email domain — defense-in-depth even if a showcase row loses its email marker. New `seed-showcase-admin.ts` seeds an `[CLIENT, ADMIN]`-roled user with no domain data (just unlocks `/admin` routes for testing Phase 2 surfaces — SUPERADMIN intentionally not granted to keep blast radius small). Applied `ensureUserByPhone` in master showcase + studio showcase owner + each of 7 studio masters + admin seed. `seedEmail` extended to accept `"admin"` role. **Generic seed kept stable** — `seedProviders` / `seedClients` upsert-by-email pattern works fine because of unique slugs; risk-of-breakage outweighs marginal "more data" benefit; richness goal already met via STUDIO-SHOWCASE-SEED (7 masters / 35 services / 56 bookings / 15 reviews). **Idempotency:** `npm run seed:test` → `npm run seed:test` (no reset between) now succeeds cleanly. Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests. **Not executed against live DB** (Postgres unavailable in dev env) — verified structurally via Prisma client types (SEED-CONSOLIDATION-A)
- [x] **Studio clients page (segments + KPIs + table)** — `/cabinet/studio/clients` rewrite. New module `src/features/studio-cabinet/clients/` (~9 components + 1 server service + 3 lib helpers). Replaces legacy `src/features/studio/components/studio-clients-page.tsx` (214 LOC `"use client"`) which was a basic SWR-fetched table. **2-col layout**: segments sidebar (220px sticky on lg, stacked on mobile) + right column with search/master filter + table + cursor pagination. **5 KPI tiles**: total + addedThisMonth, active30d + %, avgLifetime, vip + revenue%, sleeping. **5 segments** (no birthday, no blacklist, no custom — all backlogged): all / vip / regular / new / sleeping. **Segments derived** via `classifyClient` from `src/lib/master/clients-classifier.ts` — reuse master thresholds (VIP_LTV=5M kopecks, REGULAR=5 visits, NEW<30d or ≤1 visit, SLEEPING>90d). `selectPrimarySegment(statuses)` picks one bucket per row with priority VIP > sleeping > regular > new > other. **Server data**: `loadStudioClientsData` lifts existing `getStudioClients` query shape but extends select with `masterProviderId` so "Основной мастер" + "у N мастеров" can be computed in-memory (no N+1). KPIs + segment counts computed BEFORE filters so sidebar counts always reflect full base. **CRM privacy** preserved: route gates via `resolveCurrentStudioAccess` (owner/admin only at studio cabinet level — master-scope view lives at `/cabinet/master/clients`). **Add client CTA → calendar**: `ClientCard` has no name field and the clients table sources from booking history, so standalone client creation without a booking is effectively invisible. Honest fix: «Клиент» button links to `/cabinet/studio/calendar` where create-booking-dialog captures phone+name+service+master+time atomically. **No chat icon** in rows (auth blocker per STUDIO-GAPS-FIX-A precedent). **No import/export/рассылка/custom segments** — backlog. **No birthday** (`ClientCard.birthday` doesn't exist — backlog). **No blacklist** (no flag mechanism; tags enum has no "blacklist" — backlog). URL state: `?segment=` / `?q=` / `?master=` / `?cursor=`. UI_TEXT subtree `studioCabinet.clientsV2.*` (~45 keys). Showcase seed (3 VIP + 7 ClientCards) renders correctly with proper VIP badges + segment buckets + masters chips. Legacy file kept (still referenced by `ClientCardDrawer` integration in places). Validation: typecheck ✅, lint 823/122 baseline preserved, encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-CLIENTS-A)
- [x] **Studio showcase seed (Vision Beauty Studio)** — rich-data fixture для visual validation всего studio cabinet, mirror master showcase (`seed-showcase-master.ts`) механизма. New file `prisma/seeds/test-data/seed-showcase-studio.ts` (~750 LOC), wired into `index.ts` после `seedShowcaseMaster`. Login: phone `+79992000000` → `/cabinet/studio`. Owner: Виктория Алмазова, plan: STUDIO_PREMIUM. **7 ACTIVE мастеров** (Марина / Елена / Ольга / Дарья / Светлана / Юлия / Татьяна) — все с `Provider.ownerUserId` set + `isPublished=true` (canonical predicate, invariant #24). **35 услуг** distributed across 8 APPROVED категорий (existing seed) + **2 PENDING категории scope студии** (`vision-tattoo-brows` / `vision-permanent-lips` с `createdByUserId=owner` + `createdByProviderId=studio.providerId` — invariant #23 demo). **~56 bookings** покрывают все 11 BookingStatus, разброс today/tomorrow/this-week/past-30d/prior-period, mix WEB + MANUAL sources. **3 VIP-клиента** (clients 0/1/2 каждый накапливает ~5M kopecks LTV через FINISHED bookings с дорогими услугами — combo / balayage / wedding-makeup). **15 reviews** разных мастеров (mostly 4-5★, 1 критический 3★ для realism). **3 ServicePackage** (Манипедикюр / Полный образ / Брови+ресницы). **7 ClientCard** с VIP tags. **12 notifications** owner'у (8 типов, 4 непрочитано). **2 PENDING ScheduleChangeRequest** (sidebar badge). Master schedules: weekly template Пн-Сб 10-19, Вс выходной. **No schema migration** — все на existing models. **Idempotent** — deterministic IDs prefix `seed-vision-*`, upsert by email/publicUsername/composite uniques. Reset через `npm run seed:test:reset` (catches owner + masters via SEED_EMAIL_DOMAIN). Phone prefix `+79992xxxxx` отделён от main seed (`+7900000xxxx`) и master showcase (`+79991000009`) — no collision. Run: `npm run seed:test`. Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-SHOWCASE-SEED)
- [x] **Studio cabinet visual polish (layout + hero + URL + topbar)** — 4 visual findings from live testing addressed in a single low-risk polish commit. **#1 layout:** stripped intermediate `<div mx-auto w-full max-w-6xl>` from `src/app/(cabinet)/cabinet/studio/layout.tsx` so studio main column mirrors master cabinet ergonomics (full-width with padding, no inner max-width clamp). Page-level structures unchanged — they continue to space themselves with their own gap/grid wrappers. **#2 hero:** `studio-today-banner.tsx` switched from `text-[rgb(var(--accent-fg))]` (resolved to near-black in light theme, unreadable on burgundy gradient) to explicit `text-white` (same as master `GreetingHero`). `dashboardV2.banner.titleTemplate` updated from `«Сегодня в студии {count} записей»` to `«Сегодня в студии {studioName} — {count} записей»` — studio name now names the headline directly instead of living as a faint caption above. **#4 URL:** `?master=<value>` switched from raw cuid to publicUsername fallback. Added `urlHandle: string` to `StudioMasterListItem` type (computed as `provider.publicUsername ?? provider.id`), used by `master-list-item.tsx` for URL writes. `loadStudioMasterDetail` resolves incoming param via `OR: [{ id }, { publicUsername }]` so old bookmarks with cuids still work; `masters-list.tsx` selection comparison matches against both `id` and `urlHandle`. **#6 topbar removal:** deleted `studio-topbar.tsx` (3 elements — studio chip / public-page link / theme toggle — all duplicates: name lives in sidebar UserChip, public-page link lives in sidebar nav, theme toggle lives in global public header). UI_TEXT `studioCabinet.topbar.*` keys removed. Layout flex column wrapper around topbar+main collapsed — main is now direct flex-1 sibling of sidebar (mirrors master cabinet structure). **No schema migration, no functional changes** — pure visual polish. Validation: typecheck/lint(823/122)/encoding/mojibake/prisma ✅, 247/247 tests (STUDIO-POLISH-A)
- [x] **Studio bug-fix sweep (category create + INVITED master guard)** — two functional bugs found in live studio cabinet testing. **Bug #3 (category create/display):** root cause = Prisma `{ visualSearchSlug: { not: "hot" } }` filter excludes NULL-valued rows (documented Prisma behaviour for nullable fields under SQL 3-valued logic). Freshly-proposed `GlobalCategory` rows have `visualSearchSlug=null` → silently dropped from the sidebar/picker query. Fixed by selecting `visualSearchSlug` and filtering post-query in all 4 affected sites (`services-data.service.ts:listAvailableCategoriesForStudio` + `buildCategoriesSidebar`, `services-view.service.ts:listAvailableGlobalCategories`, `portfolio-view.service.ts:listAvailableGlobalCategories`). Latent bug affected master cabinet too — now fixed in both surfaces. **Bug #5 (INVITED master eligibility):** root cause = no eligibility predicate. `assignMasterToService` / `createStudioBooking` / `moveStudioBooking` only checked `type=MASTER` + `studioId` match — not whether the master had accepted the invite (`ownerUserId IS NOT NULL`). Schedule grid `isAvailable` derived from `isPublished` alone, so an INVITED master with default `isPublished=true` showed as bookable. Fix: new shared helper `src/lib/studio/master-eligibility.ts` exposing `isStudioMasterActive(provider)` predicate (`ownerUserId !== null && isPublished`) and `requireActiveStudioMaster()` async guard (throws 409 `MASTER_NOT_ACTIVE` for INVITED/DISABLED). Applied in: assign-master + create-booking + move-booking lib mutations (server-side enforcement); `availableMasters` filter in `loadStudioServiceDetail` (assign-dialog picker excludes INVITED); schedule day/week `columns.isAvailable` (INVITED column rendered with `DisabledMasterOverlay` so admin sees the team member but can't book); `loadShellExtras` for bookings page mirrors same predicate (CreateBookingDialog/MoveBookingDialog pickers). New error code `MASTER_NOT_ACTIVE` (409). Assign-dialog `noAvailable` empty-state copy updated to explain INVITED masters appear after acceptance. **No schema migration.** Eligibility predicate piggy-backs on existing `Provider.ownerUserId` (NULL until invite acceptance) + `Provider.isPublished` (admin pause toggle) fields — the same data status-display derives `ACTIVE / INVITED / DISABLED` from in STUDIO-MASTERS-A. Strengthens invariant #21 (per-spec: only ACTIVE master accepts records) (STUDIO-BUGS-FIX-A)
- [x] **Studio service packages** — strict mirror of master `ServicePackage` pattern для studio. New module `src/features/studio-cabinet/services/{server,components}/packages-*` (~5 files: `packages-data.service.ts`, `package-modal.tsx`, `package-card.tsx`, `packages-section.tsx`, `delete-package-dialog.tsx`) + 2 new API endpoints (`POST /api/studio/service-packages` + `PATCH/DELETE /api/studio/service-packages/[id]`) — thin wrappers passing `studio.providerId` as `masterId` argument к **existing** `createMasterPackage`/`updateMasterPackage`/`deleteMasterPackage` lib helpers из `src/lib/master/services-mutations.ts`. **No schema migration** — `ServicePackage.masterId` is generic Provider FK (no `Provider.type` constraint at DB level), reusable для studio Provider records. Field name `masterId` is semantically misleading once studios use it — backlog rename (`masterId` → `providerId`), not blocking. Price computation: reuses pure `computeBundlePricing` helper from master (PERCENT round / FIXED min, кеpeks). Live preview в модалке (sum component prices, discount, final). Master ownership check `service.providerId === masterId` works correctly для studio because `Service.providerId === studio.providerId`. Зод-схемы переиспользованы через `.extend({ studioId })` / `.and(z.object({ studioId }))`. Validation: typecheck ✅, lint 823/122 baseline preserved, encoding/mojibake/prisma ✅, 247/247 tests. **Catalog visibility deferred** — public catalog surface для packages пока не существует (master `bundle-card.tsx` имеет комментарий «Booking is deferred until the public booking flow integrates ServicePackage»). UI_TEXT subtrees `studioCabinet.servicesV2.packages.*` / `package.*` / `packageDialog.*` / `deletePackageDialog.*` (~50 keys) (STUDIO-PACKAGES-A)
- [x] **Studio services management** — `/cabinet/studio/services` rewrite с 3-col layout (categories sidebar 240px / list 1fr / detail panel 420px). New module `src/features/studio-cabinet/services/` (~12 components + 1 server service + 1 lib helper). Categories sidebar показывает `ServiceCategory` rows (legacy studio-scoped — соответствует existing `createStudioService` requirement). Service list item: name + bookings30d + duration + price + master avatars chips + paused/no-master badges. Detail panel: form (name / price / duration / category) + masters assign chips с unassign × button + 30d stats (bookings + revenue) + Save / Delete actions. **Legitimate flag: `Service.isActive` toggle** (audit нашёл реальное поле в schema, used by `updateStudioService` endpoint, drives catalog/booking visibility). **NO 4 фейк toggles** (online booking / public price / master price change / addon) — все из jsx референса убраны. **NO ТОП/доп badges** — не реализованы. **NO «Импорт CSV», NO «Экспорт»** — backlog. URL state `?category=` / `?service=` / `?q=`. New `unassignMasterFromService` lib helper + `POST /api/studio/services/[id]/unassign-master` endpoint (soft unassign via `MasterService.isEnabled=false`). New `deleteStudioService` lib helper + `DELETE /api/studio/services/[id]` endpoint (hard delete; BookingServiceItem snapshots survive). Category create через existing `POST /api/studio/categories`. Service create через existing `POST /api/studio/services`. Master assign через existing `POST /api/studio/services/[id]/assign-master`. **MasterCardDrawer integration removed** — master chips теперь link на `/cabinet/studio/team?master=<id>` (canonical detail view из STUDIO-MASTERS-A). `MasterCardDrawer` сохранён (legacy `studio-settings-page.tsx` ещё его консумит). Legacy `studio-services-page.tsx` (1080 LOC) **НЕ помечен** `@deprecated` — он всё ещё embed'ed в `studio-settings-page.tsx` tab; Phase 7 cleanup уберёт обоих вместе при редизайне settings page. UI_TEXT subtree `studioCabinet.servicesV2.*` (~80 keys) (STUDIO-SERVICES-A)
- [x] **Studio bookings journal** — новая страница `/cabinet/studio/bookings` (раньше отсутствовала). Table-based журнал записей всех мастеров с filter chips (Сегодня/Завтра/Неделя/Все), status select, master select, search (client name / phone / service). Columns: Когда / Мастер / Клиент / Услуга / Цена / Источник / Статус / chat icon / action menu. **VIP badge через existing `CLIENT_STATUS_THRESHOLDS.VIP_LTV_KOPEKS` (5 000 000 копеек / 50 000 ₽)** — reuse порога из master cabinet's `classifyClient`. «новый» badge = client с 0-1 completed booking в studio scope. **NO «оплачено» indicator, NO «Экспорт», NO «Сегменты», NO ручной смены статуса** в action menu (статусы автоматические). KPI «Требуют действий» = только неподтверждённые (БЕЗ «опаздывает»). Source badges: WEB → «Каталог» (info tone), MANUAL → «Звонок», APP → graceful «Приложение». Action menu **inline-reuse** из STUDIO-SCHEDULE-A: BookingActionMenu + MoveBookingDialog + CancelBookingDialog + CreateBookingDialog (через type adapter — row → ScheduleBookingCell). **Phone теперь required в CreateBookingDialog** (carryover fix из STUDIO-SCHEDULE-A применён). N+1 prevention: lifetime client stats batched через single broad query per page, range counts через parallel `Promise.all`. Cursor pagination (50 items/page). Module `src/features/studio-cabinet/bookings/` (~10 components + 2 services + 2 lib). Nav item `/cabinet/studio/bookings` уже был добавлен в STUDIO-SHELL-A, теперь функционален (STUDIO-BOOKINGS-A)

### ⏳ Cabinet Studio (полный redesign отдельно)
- [x] **Schedule request approval UI** — closed functional gap (STUDIO-SCHEDULE-REQUEST-APPROVAL-A)
- [x] **Shell foundation** — sidebar + topbar + UserChip + bottom-nav (STUDIO-SHELL-A)
- [x] **Dashboard redesign** — rich KPIs + attention + revenue chart (STUDIO-DASHBOARD-A)
- [x] **Masters page redesign** — 2-col list+detail, status filters, invite/pause/activate (STUDIO-MASTERS-A)
- [x] **Schedule multi-master redesign** — день grid + неделя occupancy, action menus (STUDIO-SCHEDULE-A)
- [x] **Bookings journal** — table-based журнал всех записей с filter chips + VIP/new badges + action menu reuse (STUDIO-BOOKINGS-A)
- [x] **Services management** — 3-col layout (categories / list / detail panel) с CRUD + master assign (STUDIO-SERVICES-A)
- [x] **Service packages** — strict mirror of master ServicePackage pattern (STUDIO-PACKAGES-A)
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

### Booking flow enforcement — ✅ ЗАКРЫТ (BOOKING-WIDGET-A, 2026-05-18)
- `Provider.minBookingHoursAhead` — server-side guard в `resolveBookingCore` (`BOOKING_TOO_SOON` 400) + slots endpoint фильтрует
- `Provider.maxBookingDaysAhead` — server-side guard (`BOOKING_TOO_FAR` 400)
- `Provider.acceptNewClients=false` — server-side guard (`NEW_CLIENTS_CLOSED` 403) с prior-bookings count
- `Provider.visibleSlotDays` — slots endpoint clamps horizon via `clampVisibleSlotsHorizon`
- Pure helper: `src/lib/bookings/policy-enforcement.ts` + 18 unit tests
- Defense in depth: оба пути (`createBooking` + `createClientBooking`) inherit через `resolveBookingCore`
- UI error copy для новых кодов — backlog (новый widget UX подберёт)

### Booking widget foundation — ✅ ЗАКРЫТ (BOOKING-WIDGET-FOUNDATION-A, 2026-05-18)
- Guest booking enabled: `/api/bookings` POST принимает анонимный запрос (name+phone), `clientUserId: null` сохраняется
- Adaptation scope: `createBooking` + `resolveBookingCore` + `resolveBookingExtras` + `idempotency.loadBookingForIdempotency` accept `clientUserId: string | null`. Idempotency + rate-limit namespaced by phone for guests. `createBooking` itself НЕ переписан — idempotency/conflict/transaction/UTC plumbing intact
- Scenario A/B already wired: studio + `?master=` parsing works (was always wired в page.tsx)
- Server-side slot aggregation helper: `src/lib/schedule/studio-slot-aggregation.ts` + 9 unit tests. Reuses `listAvailabilitySlotsPaginated` per-master; pure `mergeByStart` for testing
- Enforcement (policy-enforcement.ts) применяется к guest: `acceptNewClients=false` блокирует guest как нового клиента
- Widget UI: новый guest contact card (name + phone inputs) когда нет сессии; auth modal больше не триггерится при submit

### Booking widget UX redesign (BOOKING-WIDGET-UI-A — этап 2)
- Полный wizard редизайн поверх foundation: 4/3-шаговый flow (Услуга → Мастер → Дата+Время → Контакты+Подтверждение), framer-motion переходы, sticky summary, hero context
- Per-error inline UI copy для `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR` / `NEW_CLIENTS_CLOSED` (сейчас generic error)
- Scenario B routing: master-direct `/u/anna/booking` URL (currently solo masters book via profile page)
- Wiring server-side `aggregateStudioSlots` в SSR'd "Сегодня свободно N окон" panel на public studio profile
- `silentMode` UI toggle (поле уже в schema, в widget нет surface)
- Skeleton refinements per step

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

### Из STUDIO-SHELL-A audit (2026-05-15)
- ~~**Symmetric role switcher в Master cabinet**~~ — **resolved by SYMMETRIC-SWITCHER-A (2026-05-15):** cross-cabinet navigation lives exclusively в public header `auth-user-menu.tsx` (`clientCabinet.switcher.*`). Cabinet UI намеренно НЕ хостит duplicate switcher — это лишний noise. Both `MasterUserChip` и `StudioUserChip` теперь static info-cards, consistent pattern
- **Per-page StudioPageHeader pattern** — отдельный sticky header для каждой страницы (breadcrumb / title / actions) появится в dedicated коммитах STUDIO-DASHBOARD-A / STUDIO-CALENDAR-A / etc. Текущий topbar намеренно lean и не претендует на эту роль
- **Legacy `studio-navbar.tsx` orphan** — после rewrite основного StudioSidebar legacy navbar остаётся используемым только в `src/app/(cabinet)/cabinet/billing/page.tsx` (cross-cabinet billing surface). Помечен на удаление через Phase 7 cleanup когда billing page получит свой redesign

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

### Из STUDIO-SHELL-A (2026-05-15)
- **Cache sidebar counts** — `getStudioSidebarCounts` запускает 3 параллельные queries при каждой загрузке любой studio-cabinet page. Сейчас acceptable (small indexed counts), но при росте может стать hotspot. Опция — `React.cache` per-render или 30-second Redis TTL. Pre-launch только если виден latency impact
- **StudioMember vs StudioMembership redundancy** (из STUDIO-AUDIT) — две модели для одного концепта. Только `StudioMembership` canonical (state machine PENDING/ACTIVE/REJECTED/LEFT), `StudioMember` orphan-ish. Cleanup migration на будущее
- **Глобальный `getStudioContext()` hook** — пересмотр shared utility чтобы внутренние pages могли pull studio info без duplicate fetch. Refactor opportunity, не сейчас

### Из SYMMETRIC-SWITCHER-A (2026-05-15)

🔵 **Nice-to-have:**
- **Public header switcher polish** — `auth-user-menu.tsx` сейчас содержит две кнопки переключения (master/studio/client). User упомянул, что styling could be прокачан visually. Backlog как UI polish — не блокирует функционал

### Из CATEGORY-UNIFICATION-A (2026-05-16)

🟠 **High priority:**
- **Legacy ServiceCategory full removal** — `ServiceCategory` model + `/api/studio/categories` endpoint still used by `studio-settings-page.tsx` services tab. Phase 7 cleanup при settings page redesign: drop endpoint, drop model, migrate any remaining `Service.categoryId` data to `globalCategoryId` (or null)
- **Admin category moderation visibility** — admin/catalog page approves/rejects PENDING categories. Verify studio-proposed categories surface там (existing `/admin/catalog/categories/*` endpoints handle this — should already work since proposal endpoint creates with `status=PENDING`)
- **Data migration для existing services без globalCategoryId** — post-launch, если accumulated legacy data: backfill `globalCategoryId` from `category.title` matching APPROVED globals OR add admin tooling «assign category» bulk. Pre-launch: not critical (per user scope decision)

🟡 **Medium priority:**
- **Category proposal scope to studio (not just user)** — currently `POST /api/categories/propose` scopes pending visibility by `proposedBy=user.id` + `createdByUserId=user.id`. Different studio admins of same studio can't see each other's pending proposals. Acceptable for now (typically owner proposes), но multi-admin studio в production может potential surprise. Enhancement: extend propose endpoint to accept `studioId` → set `createdByProviderId` from studio's `providerId`; extend `listAvailableCategoriesForStudio` to OR on `createdByProviderId IN (studio.providerIds for current user)`
- **Sidebar drift handling** — sidebar shows union (in-use + APPROVED + own-pending); selected category from URL may not survive once propose-pending categories migrate to APPROVED across sessions. Acceptable, but improve UX with "category renamed/approved" hint
- **Better empty state** when zero pickable categories — currently picker shows `"Выберите категорию"` placeholder только; add CTA «Создайте свою категорию» if list is empty

🔵 **Nice-to-have:**
- **Category hierarchy (parentId) full support в studio UI** — `GlobalCategory.parentId` exists в schema; surface nested categories in sidebar
- **Category merge для admin** — объединить дубликаты pending категории при approve (services из rejected → approved копия)
- **Master Wsbubmit auto-attach** — when studio admin proposes category, auto-attach the freshly-created service to it (already wired in add-service-dialog — verify on user testing)
- **Show service count в picker dropdown** — `"Маникюр (12)"` next to name

### Из STUDIO-GAPS-FIX-A (2026-05-16)

🟠 **High priority:**
- **Studio admin chat participation** — chat is currently 1:1 client↔master (`resolveChatAccess` enforces this). Studio admin/owner returns 403. If product requires studio admin to observe / participate в client chats — нужен auth model extension (e.g., add studio-owner check to access resolver) + UI surface in studio cabinet. Currently studio admin полностью off the chat surface (icon removed)
- **Recurring weekly breaks** — current break dialog supports one-time only (TimeBlock model). Recurring (weekly Mon/Tue/etc.) breaks live in `ScheduleBreak` (kind=WEEKLY) and go through `ScheduleEngine`/`editor.ts`. Required for studio admin to set «каждый понедельник 13:00-14:00 обед для Анны» without per-week click

🟡 **Medium priority:**
- **Break dialog cross-day add** — currently form pre-fills with current viewed day's date. Admin must navigate to other days to add breaks там. Could extend form с date picker → add break for any date
- **Click-to-add-break from grid** — click empty cell with "+ break" alternative action (current empty-cell click goes to create-booking only)
- **Break edit (вместо only add/delete)** — `PATCH /api/studio/blocks/[id]` endpoint exists; dialog currently only add+remove. Edit via inline UI

🔵 **Nice-to-have:**
- **UI_TEXT cleanup** — `bookingsV2.actions.openChat` dead-letter key. Drop in Phase 7
- **Break note display in grid cells** — TimeBlock `note` field exists (e.g., «Обед», «Кофе-пауза»). Currently grid cell shows только «Перерыв» label. Surface note as tooltip / subtitle

### Из STUDIO-SERVICES-A (2026-05-16)

🟠 **High priority:**
- **Studio category global proposal (master pattern)** — `POST /api/categories/propose` существует для мастера, но studio admin сейчас использует только legacy `ServiceCategory` (studio-scoped). Расширить add-category-dialog: дополнительный пункт «Предложить новую глобальную категорию» → создаёт `GlobalCategory.status=PENDING` (admin модерация). Услуга может линковаться с GlobalCategory через `globalCategoryId` для каталога — это уже supported в схеме / endpoint
- **Legacy `studio-services-page.tsx` (1080 LOC)** — всё ещё embed'ed в `studio-settings-page.tsx` как сервисный tab. **НЕ deprecated в STUDIO-SERVICES-A** для безопасности. Phase 7 cleanup: убрать сразу с settings page redesign

🟡 **Medium priority:**
- **Import CSV services** — batch import услуг (отложено)
- **Export services CSV/Excel** — отложено
- **Service reorder (drag)** — `reorderStudioServices` endpoint существует; UI пока без D&D
- **Bulk operations** — назначить мастера на N услуг, batch price change
- **Service description editing** — schema поле `description` есть, в новой UI скрыт; backlog item для full edit form

🔵 **Nice-to-have:**
- **Service «ТОП» highlight** — featured services (если бизнес захочет: derived popularity proxy или manual flag — требует schema field если manual)
- **Addon services** — «доп. услуга к основной» если бизнес-кейс появится (требует schema)
- **Service duplicate** — clone существующей услуги в другую категорию
- **Per-service online booking toggle** — `onlinePaymentEnabled` (existing flag, plan-gated); если business потребуется expose в новой UI

### Из BOOKING-WIDGET-A (2026-05-18)

🟠 **High priority (full widget UX redesign — deferred from this commit):**
- **`/u/[username]/booking` full UX redesign** — animated 4-step / 3-step wizard (Service → Master → When → You) with `framer-motion` AnimatePresence transitions, sticky right-column summary, hero context card, distinct scenario-A vs scenario-B flows. Spec exists (`page-studio-booking.jsx` + 2 reference PNGs); deferred because audit revealed too many entangled blockers for a single-commit rewrite of the core conversion path
- **Scenario B — master direct booking (`/u/{master-slug}/booking`)** — currently `page.tsx` lines 148–152 + 191–223 **redirect MASTER providers to `/u/{slug}` profile**. To support direct master booking links: remove the redirect, render a new lightweight master booking flow (or adapt existing `StudioBookingFlow` to handle studio-less context). Requires new component since `StudioBookingFlow` is studio-scoped end-to-end. Affects: Anna Sokolova solo route + every master-slug bookmark
- **Studio slot aggregation («любой свободный мастер»)** — `ANY_MASTER_ID` is a mock constant in `StudioBookingFlow` line 52; the actual logic just picks the first master with slots. A real aggregator service (`getStudioFreeSlots({ studioId, date })`) would merge availability across N masters into "Ближайшее окно: {master} в {time}" + total free slots today. High conversion value
- **Guest booking flow (auth + SMS-OTP)** — `/api/bookings` POST line 56–58 requires authenticated session. Public widget must currently force login before submit. Either (a) add SMS-OTP verification path (blocked on SMS gateway, P1 pre-launch), or (b) accept unauthenticated phone-only bookings + retroactively link via existing `linkGuestBookingsToUserByPhone`. Decision needed before any guest-flow redesign

🟡 **Medium priority:**
- **«Хочу помолчать» surfaced in new widget UI** — `Booking.silentMode: Boolean` already exists in schema (no migration needed). Current `StudioBookingFlow` line 77 already wires the checkbox; new widget design needs to surface it consistently
- **Routing split `/u/` master + `/v/` studio** — would simplify scenario detection (URL prefix tells type) + remove username collision risk between master and studio. Infrastructure work; deferred as explicit user decision
- **Online payment at booking** — prepayment / online charge during booking flow. Payment infra not built (cross-ref STUDIO-FINANCE-REMOVE-A payout backlog)
- **Policy enforcement: `cancellationDeadlineHours` enforcement at cancel time** — field is read by this commit's helper exports (for future use) but cancellation-side enforcement is separate. Cross-ref `lateCancelAction` enforcement (already known backlog)
- **Booking widget streaming refactor** — `/u/[username]/booking/page.tsx` does sequential awaits in places (lines 138–223); paths could parallel with `Promise.all`. Existing `loading.tsx` ships a real skeleton, so first-paint risk is low, but P-99 could improve
- **Surface `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR` / `NEW_CLIENTS_CLOSED` in widget UI** — server now throws these errors; existing `StudioBookingFlow` doesn't have copy for them. New widget should map error codes → friendly UI messages

🔵 **Nice-to-have:**
- A/B test multiple booking-flow variants for conversion (heatmap, A/B framework)
- HotSlot integration in widget (показывать «−20%» бейдж на слотах со скидкой)
- Multi-service booking (несколько услуг за визит)
- Booking widget per-step funnel analytics (где отваливаются клиенты)
- Booking widget skeleton refinements (step-specific shapes vs generic `BookingSkeleton`)

### Из STUDIO-PUBLIC-PROFILE-A (2026-05-18)

🟠 **High priority:**
- **Studio public live slot aggregation** — `buildSlotsForDay` is per-master; no studio-scope aggregator exists today. Need a new `getStudioFreeSlots({ studioId, date })` service that merges availability across all ACTIVE masters of the studio into a single "Сегодня свободно N окон · Ближайшее — {мастер} в {time}" payload. Without it the slot-bar ships as a deep-link CTA (no live count). Critical for conversion — clients respond to scarcity signals
- **Booking widget redesign** `/u/[username]/booking` — user explicitly flagged as the next priority (core conversion surface). This commit deep-links into it; the widget itself needs its own redesign pass

🟡 **Medium priority:**
- **Public page view + conversion analytics** — no tracking infra today. Reference jsx had owner-only «конверсия 6.2% · 2184 просмотра» — would need page-view ingest + booking-funnel attribution. Affects all public pages (studio profile, master profile, catalog, booking widget)
- **Studio FAQ entity** — schema model + admin editor + public render. Right now `description` carries everything
- **Studio history/values/philosophy fields** — long-form copy for the «О студии» section. Would extend Provider model with optional text columns
- **Studio verification badge** — `Provider.isVerified: Boolean` + admin moderation flow + verified-tick render
- **Pre-booking client→studio chat** — «Написать в студию» button. Currently blocked by chat auth model (only 1:1 client↔master, studio admin is not a chat participant). Cross-ref STUDIO-GAPS-FIX-A
- **Studio metro/walkMinutes fields** — schema columns + address-block enrichment. Cross-ref STUDIO-SETTINGS-A address backlog
- **Studio phone/social-links public fields** — separate from `contactPhone` (which exists but isn't on `ProviderProfileDto`); plus an array of social URLs

🔵 **Nice-to-have:**
- Hero gallery: video, 360° viewer, focal-point picker for the banner
- Portfolio lightbox with master attribution + nav-arrows
- OG image generation per studio (share card with hero + name + rating)
- "Все мастера" / "Все отзывы" / "Все портфолио" dedicated pages instead of in-place expand
- Skeleton refinements per section (current shared `<HeroSkeleton>`/`<ServicesSkeleton>` etc. are generic — section-specific shapes would improve perceived perf)
- Replace remaining `<FocalImage>` callers with direct `next/image` once focal-point cropX/Y migration completes (component marked deprecated)

### Из STUDIO-SETTINGS-A (2026-05-18)

🟠 **High priority:**
- **Transfer studio ownership flow** — no platform mechanism exists. Needs: dedicated endpoint with multi-factor confirmation (current owner + new owner accept), audit log entry, transitional period (e.g. new owner has 7 days to claim). Surface in owner-team section once endpoint lands
- **Invite admin to studio team** — current invite flow (STUDIO-MASTERS-A) creates MASTER memberships. Inviting ADMIN/FINANCE is a different scope: need either a new invite type (`StudioInvite.role`) or a separate flow. Currently surfaced as "появится позже" placeholder
- **Studio logo upload UI in new settings** — image uploader lives in legacy profile editor. Port the MediaAsset uploader to the new general section so admins don't need to bounce out to the old UI

🟡 **Medium priority:**
- **Studio address + geocode editing in new settings** — legacy editor has the geocode + suggestions UI. Currently read-only here with a deep link to Yandex Maps. Port the picker
- **Per-NotificationType preferences (real schema)** — needs `NotificationPreference` model `(userId, studioId, type, channel, enabled)` so admins can opt out of e.g. routine BOOKING_REMINDER. Backbone for the future per-team-member notification matrix mentioned in STUDIO-NOTIFICATIONS-A info-banner
- **Per-team-member notification routing** — once preferences exist, admins should be able to route notification types to specific team members (e.g. only finance person gets BILLING events). Cross-ref STUDIO-NOTIFICATIONS-A backlog
- **Studio policy editor on this page** — current implementation is read-only with a deep link to the schedule editor (which is the only edit surface today). Add an inline editor that posts through a thin studio-policy mutation
- **Anonymisation on studio delete** — `deleteStudioCabinet` uses cascade `deleteMany` which removes rows rather than anonymising them. For 152-ФЗ / GDPR compliance, switch to anonymised soft-delete (replace personal fields, keep aggregate metrics). Known platform-wide backlog
- **Phase 7 cleanup: legacy `studio-settings-page.tsx`** — 837-LOC big component still serves portfolio/profile sub-routes. After portfolio + profile main get their own redesigns, this whole file can go away
- **Legacy sub-routes consolidation** — `/settings/{profile,portfolio,general,public,features}` all render the same big component with different `initialTab`. After portfolio + profile redesign, fold into the new 5-section page (or kill the sub-routes)

🔵 **Nice-to-have:**
- **Studio working-hours default editor** — surfaces `WeeklyScheduleConfig` for the studio provider as a default schedule. Today, per-master schedule is the only authoritative source
- **Custom studio policy text** — free-form rules (e.g. «дети с родителями», «без животных») surfaced on public profile. Needs `Studio.publicRules: string[]` schema column
- **Studio danger zone audit trail** — log archive/delete actions to `AdminAuditLog`-style table so support can reconstruct history if a studio disputes

### Из STUDIO-FINANCE-REMOVE-A (2026-05-18)

🟡 **Medium priority:**
- **Studio Finance page (when payouts ship)** — Finance returns as a real surface once the platform has commission / payout / expense flows to differentiate it from Analytics. Today the redirect to Analytics is honest UX; rebuilding the page without distinguishing content would just be confusing. Cross-ref STUDIO-SERVICES-A payouts deferral
- **Expense tracking** (rent / materials / taxes) — significant new domain; if added, Finance becomes the natural home

🔵 **Nice-to-have (after payout flow):**
- **Studio bank account integration** — if a partner banking API becomes available
- **Export to 1С / PDF report** — once Finance has distinct numbers to export
- **Per-master payout reconciliation** — the «ВАМ» column Analytics intentionally drops

### Из STUDIO-ANALYTICS-A (2026-05-18)

🟠 **High priority:**
- **Cohort retention matrix view** — `/api/analytics/cohorts/retention` + `/cohorts/revenue` endpoints exist (PREMIUM-gated) but the studio cabinet clients view doesn't surface them yet. Add a third sub-section under Clients view that renders the retention matrix (rows = signup month, cells = % retained in N months). UI is the heavy lift; data is already there
- **Custom date range picker** — endpoints accept arbitrary `from/to`; master cabinet gates the picker behind `customPeriod = analytics_cohorts || analytics_forecast` PREMIUM proxy and shows «Скоро» alert. Studio currently ships presets only. Add picker mirror once master ships the real one
- **Revenue forecast widget** — `/api/analytics/revenue/forecast` (PREMIUM `analytics_forecast`) returns next-month projection based on confirmed bookings + historical cancel rate. Useful for studio cash planning; not in this commit's scope

🟡 **Medium priority:**
- **Analytics export Excel** — backlog (consistency with bookings/services/clients export deferral)
- **Studio commission / payout «ВАМ» column** — payouts not implemented anywhere in the platform; surfaces when payout flow lands. Cross-ref STUDIO-SERVICES-A precedent for the deferral
- **BookingSource as official analytics endpoint** — currently computed inline via `prisma.booking.groupBy` in the orchestrator. Move to `src/features/analytics/domain/bookings.ts` (`getBookingsSources`) for reuse + cache parity with other charts
- **Funnel + lead-time sections on Overview** — `/api/analytics/bookings/{funnel,lead-time}` (PREMIUM) exist but only KPI / heatmap surface from PREMIUM tier currently. Add as supplementary cards under Overview's bottom row
- **Rating delta in KPI** — currently no rating KPI; `getDashboardKpi` doesn't return one. Would require a snapshot model (same gap STUDIO-DASHBOARD-A flagged for occupancy/rating deltas)
- **Master analytics deep-link** — clicking a row in the Masters view should navigate to a per-master analytics drill-down. Not in scope; requires per-master analytics page (master cabinet already has one, but with master-session scope; needs studio-admin variant)
- **Service deep-link** — same shape as master deep-link

🔵 **Nice-to-have:**
- **Saved analytics views** — admin saves a (period, view, compare) preset for one-click revisit
- **Section-level «Поделиться» PDF/PNG** — export individual charts
- **Drilldown by source** — click a slice in sources donut → filter bookings by source

### Из STUDIO-NOTIFICATIONS-A (2026-05-18)

🟠 **High priority:**
- **Cabinet/room model + conflict notifications** — current schema has no physical-cabinet entity. If business needs «Кабинет N» tagging on bookings + conflict-detection notification («Конфликт в кабинете 2: две записи на одно место»), schema migration required: `model Cabinet { id, studioId, label, capacity? }` + `Booking.cabinetId?` + new `BOOKING_CABINET_CONFLICT` NotificationType + detection trigger in `createStudioBooking`. Not in scope without explicit business signal — keep watching usage to see if real studios run into this
- **Per-team-member push settings** — info banner promises «настраивается в Настройках студии», but the settings page hasn't been redesigned yet. Needs UI (toggle per team member, per notification category) + persistence (`StudioMembership.pushPreferences: Json?` or separate table). Cross-ref STUDIO-SETTINGS-A pending

🟡 **Medium priority:**
- **Multi-recipient broadcast for studio events** — current `Notification` model is single-recipient; STUDIO_SCHEDULE_REQUEST etc. land in the owner's inbox only. If studios want all admins to see + act on the same notification, broadcast logic needs adding (recipient resolution from `StudioMembership` roles in `notifyScheduleRequestSubmitted` etc.)
- **Notification preferences (subscribe/unsubscribe per type)** — studio admin opts out of e.g. routine BOOKING_REMINDER chatter. Settings UI + filter in delivery layer
- **SSE realtime updates on the feed** — current page is SSR with manual refresh on chip switch / mark-read. Master notif has SSE stream — studio could subscribe to the same `/api/notifications/stream` endpoint for live arrivals
- **«Открыть запрос» deep-anchor** — clicking the SCHEDULE_REQUEST nav chip currently lands on `/cabinet/studio/schedule-requests` (the page). Could append `?focus=<id>` so the specific request highlights / scrolls into view (existing schedule-requests page supports passing focus param trivially)
- **Card per-action mark-read** — currently mark-read is only the bulk button. Per-card "✓ прочитано" would mirror master pattern. Existing endpoint `/api/notifications/[id]/read` already supports it

🔵 **Nice-to-have:**
- **Group similar notifications** («3 новых бронирования» вместо 3 cards)
- **Snooze notification** (postpone to later)
- **Notification search** (within title + body)
- **Replace `openHref="/cabinet/studio/team"` on SCHEDULE_REQUEST** with `/cabinet/studio/schedule-requests` (currently center.ts emits the old path — works but suboptimal; trivial fix)

### Из STUDIO-REVIEWS-A (2026-05-17)

🟡 **Medium priority:**
- **Review request flow** — proactively prompt clients to leave a review after a finished booking (notification or SMS link). Header CTA «Запрос отзыва» reserved for this. Requires either a notification template + scheduled job or a manual "request now" button on the bookings journal
- **Bulk reply** — "Ответить всем" CTA in header to auto-publish a templated thank-you to multiple unanswered reviews at once. Useful for studios with backlogs. Needs UI for template editing + per-master attribution check + cap (e.g. 50/operation)
- **Rating delta (month-over-month)** — currently no «+0.12 за месяц» chip because there's no `RatingSnapshot` model (same gap STUDIO-DASHBOARD-A called out for occupancy/rating deltas). Solution would be daily snapshot like `MrrSnapshot` — applies to dashboard occupancy too. Cross-ref STUDIO-DASHBOARD-A backlog
- **Per-master reply identity** — currently every reply is labelled «Ответ студии» regardless of who typed it (admin or master). If a future business case wants masters to sign their own replies, add `repliedByUserId` field + UI toggle. Not in scope right now per explicit spec
- **Reply edit on studio surface** — `editReviewReply` exists in service layer but the studio reviews UI only offers POST (first reply). PATCH would let the studio fix typos / refresh the public response
- **Top/anti-top masters by rating** — reference design showed this, replaced with "top services by reviews" per spec. If business wants the leaderboard back, derive from `Review.rating` group-by `masterId` aggregate

🔵 **Nice-to-have:**
- **Quick-reply chips** — pre-defined response templates (mirror master cabinet's `ReviewReplyForm` pattern) for speed
- **Review bookmark / flag-as-important** — needs schema field (`ClientCard.tags` doesn't cover review-level marking)
- **Sentiment analysis hint** — auto-flag «угрожающие» reviews above standard spam/offensive report categories
- **Review export CSV** — for studio business reporting

### Из STUDIO-CLIENTS-A (2026-05-17)

🟠 **High priority:**
- **Client blacklist mechanism** — no schema flag or tag for "blacklist" currently exists (`tags` enum: vip/regular/new/allergy/late/no_show/discount/prepay/favorite — no blacklist). UX need: studios want to flag «не записывать», «proven no-show», etc. Options: (a) extend `ClientCard.tags` enum to include `blacklist`, (b) dedicated `ClientCard.isBlocked: Boolean` field with reason. Either way → schema change required + sidebar segment + row badge + server-side booking-creation guard
- **Client birthday field** — schema migration to add `ClientCard.birthday?: Date` (and/or `UserProfile.birthday?`). Unlocks: "Скоро ДР" segment with 7/14/30-day windows + birthday badge on rows + auto-greeting flow. Cross-ref client cabinet birthday backlog from earlier sprints

🟡 **Medium priority:**
- **Custom segments (saved filter presets)** — admin saves a filter combination as a named segment («Свой сегмент»). Schema: `StudioSavedSegment { studioId, name, filterJson }`. Sidebar surfaces them after the built-ins
- **Client import CSV** — bulk add via CSV (phone + name + notes). Endpoint + UI deferred
- **Client export CSV/Excel** — for outreach lists / backup
- **Рассылка / campaign engine** — mass SMS/push to a filtered client set (e.g. all VIPs, all sleeping >90d). Requires both transport infra (SMS gateway) + UI surface (compose modal + delivery status)
- **Client detail drawer redesign** — current `ClientCardDrawer` from `src/features/crm/components/` works but pre-dates studio-cabinet design tokens. A studio-specific drawer with rich history + notes + photos in unified styling
- **First-visit timestamp on row** — KPI "added this month" currently approximated via `visits ≤ 1 && lastVisitAt within month`. Surface `firstVisitAt` on `StudioClientRow` and use it directly for precise count + sort options
- **Phone search normalisation** — current search compares against `displayName` + raw `phone`. Should normalise the query to Russian phone format so `8911...` matches `+7911...`

🔵 **Nice-to-have:**
- **Client merge (duplicates)** — same person registered under multiple phones — UI to merge cards + reassign bookings
- **Tag management UI** — drag/drop tag assignment, custom studio-defined tags
- **One-click reactivation campaign** — pre-built flow for sleeping clients (auto-compose message with discount)
- **"Записать" → open create-booking-dialog with client pre-selected** — currently links to calendar generically. Could pre-fill client phone/name in the dialog if we surface clientHandle in URL

### Из STUDIO-POLISH-A (2026-05-17)

🟡 **Medium priority:**
- **Drop unused `mastersCount` from `getStudioShellInfo`** — after topbar removal, the field has no consumer in the layout. Helper still returns it (cheap to compute) but cleanup-time follow-up: trim return shape + drop from `studio-info.service.ts` query. Pre-launch not blocking
- **Per-page studio sticky header** — master cabinet pages render `<MasterPageHeader>` (sticky breadcrumb + title + actions slot). Studio pages currently rely on each section's own header. A `<StudioPageHeader>` analog would unify the chrome — flagged in STUDIO-SHELL-A audit ("Per-page StudioPageHeader pattern"), still pending
- **Public catalog studio profile link** — sidebar nav surfaces "Открыть страницу студии" only when `studio.publicHref` is set. Studios without a public profile have a hidden gap (no link surface at all). Audit whether all studios should have a public surface; if not, document why empty state appears

🔵 **Nice-to-have:**
- **`/u/<publicUsername>` profile preview popover** in masters list — hovering a row with a `publicUsername` could show the public profile card without leaving the cabinet
- **`publicUsername` setup CTA** for masters without one — currently INVITED + freshly-created masters have no slug, so their URL falls back to cuid. Could add a soft prompt on the master detail panel

### Из STUDIO-BUGS-FIX-A (2026-05-17)

🟡 **Medium priority:**
- **Audit `{ not: value }` filter usage on other nullable Prisma columns** — same null-exclusion gotcha may bite elsewhere. Sweep grep for `\{ not: ` in `src/` and review each site against the field's nullability. Lint rule (custom) could catch the pattern preemptively
- **`Provider.ownerUserId` IS NOT NULL index** — eligibility predicate runs on every booking flow / assign / schedule render. Partial index on `(studioId, isPublished) WHERE ownerUserId IS NOT NULL` would speed up large studios. Not blocking pre-launch
- **Standardise the `INVITED` predicate as a shared Prisma fragment** — `isStudioMasterActive` is a JS predicate. A Prisma `ProviderWhereInput` constant (`STUDIO_ACTIVE_MASTER_WHERE`) reused across `loadStudioServiceDetail`, future booking flows, master list filter would reduce duplication. Pulled if predicate logic evolves (e.g. add `acceptingNewClients` flag)

🔵 **Nice-to-have:**
- **Invite-acceptance event audit-log entry** — currently invite acceptance only flips `Provider.ownerUserId`. Could emit an audit-log row for traceability of when masters joined the team
- **«Принимает запись с N даты» tooltip** для INVITED chip — currently `DisabledMasterOverlay` shows generic «Недоступен». Could show «Ожидает принятия приглашения от {phone}» if INVITED specifically (vs DISABLED)
- **Visual distinction INVITED vs DISABLED columns** в schedule — currently both render with same `DisabledMasterOverlay`. Could use different label («Приглашён» vs «Приостановлен») so admin sees status at glance

### Из STUDIO-PACKAGES-A (2026-05-17)

🟠 **High priority:**
- **Public catalog / booking flow integration for ServicePackage** — packages currently invisible на public surfaces (`bundle-card.tsx` has TODO comment: «Booking is deferred until the public booking flow integrates ServicePackage»). Когда integration делается, обе сущности (master + studio packages) подключаются single shot through существующий unified `globalCategoryId` mechanism. Pre-launch decision: ship without public surface (master cabinet already lives с этой gap)
- **`ServicePackage.masterId` → `providerId` rename** — поле физически is generic Provider FK (no `Provider.type` constraint at DB level), но имя misleading после studio reuse. Migration: rename column + регенерация Prisma client + sweep всех usages в `services-mutations.ts` / `packages-data.service.ts` / `bundle-data.service.ts`. Field rename ~30-min focused commit, not blocking studio launch

🟡 **Medium priority:**
- **Package analytics (bookings count, revenue, popularity)** — currently nothing tracks how many bookings include a package vs individual services. Если booking flow integration состоится, surface stats в package card (как в service detail panel сейчас)
- **Package master assign** — sегодня package — это compose существующих services, мастера inherit'ятся через service-master assignment. Если бизнес-кейс «этот пакет может оказывать только Алина» появится — нужен `ServicePackage.masterIds[]` или join table
- **Package reorder (drag)** — `sortOrder` field существует но UI без D&D. Consistent с services reorder backlog
- **Package duplicate / clone** — clone existing package с tweaks

🔵 **Nice-to-have:**
- **Discount preview improvements** — show «было 5 000 ₽, теперь 4 250 ₽» с явным «−15%» badge в package card (currently shows только final price + savings template)
- **Package validity period** — temporary promo packages с `validUntil` field
- **Package booking constraints** — например «всё за один визит» vs «можно по частям»
- **«Featured» / «ТОП» package highlight** — pinning best-seller для marketing

### Из STUDIO-BOOKINGS-A (2026-05-16)

🟡 **Medium priority:**
- **Export bookings CSV/Excel** — отложено (как для masters)
- **Saved filter segments** («Сегменты») — saved query presets, новая фича
- **Booking detail drawer** — расширенный read-only view (clients history / chat preview / notes / audit). Сейчас только action menu modal. Может быть extracted из schedule action menu в shared
- **Bulk operations** — отменить/перенести несколько одновременно
- **Sort by column** — клик header сортирует (currently start-asc only)
- **Status filter «Активные»** — preset combining PENDING + CONFIRMED + IN_PROGRESS

🔵 **Nice-to-have:**
- **Column customization** — admin скрывает/показывает columns
- **APP source label** — когда мобильное приложение / PWA запустится
- **VIP threshold per-studio override** — текущий threshold global (`VIP_LTV_KOPEKS = 5 000 000`). Studio может хотеть свой порог
- **Client name masking** — для shared screens / mobile public displays admin может скрывать full names

### Из STUDIO-SCHEDULE-A (2026-05-16)

🟠 **High priority:**
- **D&D переноса записей** — drag-n-drop bookings между master columns и по времени. Сейчас action menus (детали / перенести / отменить). Consistent с master cabinet (там тоже action menus, D&D отложен глобально для consistency)
- **Месяц view** — calendar month grid для studio. Перегружен для multi-master (N мастеров × 30 дней = слишком много данных), нужен особый design (heatmap? aggregated занятость по дням?)
- ~~**Break management UI**~~ — **resolved by STUDIO-GAPS-FIX-A (2026-05-16):** dialog `ManageBreaksDialog` добавлен в schedule header. One-time breaks через `POST/DELETE /api/studio/blocks`. Recurring weekly breaks (через `ScheduleBreak` model + `editor.ts`) — отдельный enhancement, оставлен в backlog ниже
- **Booking detail drawer** — action menu имеет «Детали» но opens только action menu modal (плотный); полноценный read-only drawer с history / chat / notes — отдельный flow

🟡 **Medium priority:**
- **Schedule live updates (SSE)** — real-time refresh когда другой admin создаёт/переносит запись. Сейчас manual refresh button
- **Mobile day grid pinch-to-zoom** — на 320px columns 200px → нужен scroll; explore сжатие до 120px columns или time-of-day filter
- **Conflict warning UI improvement** — сейчас «Не удалось перенести» generic message. Improvement: показать конкретный конфликтующий booking
- **Service hint в create dialog** — при выборе master показывать только enabled services (already wired via `masterIds`); при отсутствии available services — empty state с CTA «настроить услуги мастера»
- **Bulk booking operations** — отменить/перенести несколько одновременно

🔵 **Nice-to-have:**
- **Print / export day schedule** — PDF day for printing
- **Drag-to-resize duration** — изменить duration существующей записи
- **Recurring bookings** — повторяющиеся записи (weekly)
- **Master schedule quick-edit from calendar** — admin меняет working hours прямо из calendar header (сейчас через masters page / settings)
- **Switch to day view from a specific time slot** — click week view cell с конкретным time → day view scrolled to that time

### Из STUDIO-MASTERS-A (2026-05-15)

🟠 **High priority:**
- **«В отпуске» status** — schema StudioMemberStatus имеет 3 значения (ACTIVE/INVITED/DISABLED). Reference jsx показывал 4 (включая «В отпуске»). Если бизнес-требование разделить «Пауза» от «Отпуск» — нужно либо новое enum value + миграция, либо отдельное поле `vacationUntil`. Сейчас «Пауза» (DISABLED) покрывает оба случая
- **Remove from studio (kick)** — у admin есть API `/api/cabinet/studio/members/[memberId]/remove` (с transferServices флагом), но UI button для этого в new masters detail panel НЕ surfaced. Сейчас admin может только pause/activate. Добавить «Удалить из студии» кнопку с confirm dialog + transfer services опцией

🟡 **Medium priority:**
- **`isStudioMaster(provider)` utility helper** — для catalog cards / public profile / любых surface где нужно решать, показывать ли PREMIUM badge. Studio masters в `isStudioMaster=true` → suppress badge. Reuses across multiple surfaces (rule из STUDIO-MASTERS-A scope). Сейчас в studio cabinet masters surface — handled implicitly (no badge rendered)
- **Export CSV/Excel мастеров** — отложено per scope
- **Bulk actions** — pause multiple masters, send mass message
- **Edit master profile from studio** — currently через PATCH endpoint доступно (name/tagline/isActive), но dialog для UI редактирования name/tagline НЕ surfaced. Reuse existing `MasterCardDrawer` (используется в services page) или новый dialog
- **Master role within studio editing** — StudioMembership.roles[] (OWNER/ADMIN/MASTER/FINANCE) НЕ редактируется через UI

🔵 **Nice-to-have:**
- **Sort options** — by revenue / by joined / by rating / by last activity
- **Master activity log** — last action timestamp («последняя запись 2 часа назад»)
- **Saved filters / segments** — admin saves common filter combos
- **Precise per-master week schedule total** — current `total = 5 if active day else 0` heuristic; replace with ScheduleEngine.getDayPlan slot count

### Из STUDIO-DASHBOARD-A (2026-05-15)

🟡 **Medium priority:**
- **Cleanup `getStudioDashboardStats()`** — после dashboard rewrite consumer'ов нет. Помечен `@deprecated`. Удалить в Phase 7 cleanup sweep вместе с `DashboardNavCards` (только studio-cabinet/components, ~50 LOC)
- **Precise occupancy via schedule engine** — текущий dashboard использует pragmatic proxy `bookings / (masters × 30 days × 5 slots)` для KPI «Загрузка студии» и `bookings_today / 5` для top-3 occupancy. Replacement: full slot-count computation через `ScheduleEngine` per master per day. Несрочно — текущий proxy достаточно для launch, но точные числа улучшат UX управления студией
- **Average rating delta tracking** — `Studio.ratingAvg` (читаем напрямую) не имеет historical snapshots, поэтому delta всегда «0.0» (neutral). Backlog: либо daily snapshot model (similar к `MrrSnapshot`), либо derive из `Review.createdAt` window aggregations. Сейчас delta показывается как «0.0», acceptable
- **Studio dashboard analytics gating** — некоторые insights могут требовать `analytics_dashboard` feature gate (как master cabinet). Сейчас полный dashboard виден всем studio admin без plan-gate. Возможно показывать только базовые KPI на FREE plan, остальное за upgrade

🔵 **Nice-to-have:**
- **AI-generated today insights** — banner subtitle сейчас статичный template («N мастеров на смене, средняя загрузка X%»). Можно использовать advisor module для contextual insights («У Алины М. — первый день после стажировки», «Загруженность ниже среднего за этот день недели»)
- **Attention items priority sorting** — admin может pin важные items / dismiss временно
- **Dashboard custom layout** — admin может скрыть / переупорядочить секции через preferences
- **Revenue chart by-master vs by-day toggle** — current view = bar chart by master. Toggle к line chart over time нагружал бы тот же endpoint но с разной aggregation

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

# BACKLOG-DONE.md — Архив выполненного (МастерРядом)

> Это **архив** завершённых задач из `BACKLOG.md`. Активные задачи — в [`BACKLOG.md`](BACKLOG.md).
> Полная прозовая история фиксов живёт в [`QA-FINDINGS.md`](QA-FINDINGS.md) (Round 1 + Round 2 ledger) и
> [`MASTERRYADOM_AI_CONTEXT.md`](MASTERRYADOM_AI_CONTEXT.md) **раздел 15** (per-commit changelog) + git history.
> Здесь — индекс (id · краткое описание · дата), чтобы ничего не потерять при trim активного бэклога.
>
> Создан: **23 июня 2026** (DOCS-CLEANUP / CONTEXT-REFRESH-R2 split).

---

## 2026-06-24 — PACKAGE-BOOKING-MVP-1 (solo sequential)

- ✅ **Solo-master sequential package booking — atomic + proportional + cancel-whole + reschedule-parts + cart UX.**
  Composes the hardened single-booking integrity (NOT a fork): `resolveBookingCore` + `ensureNoConflicts(tx)` +
  in-tx Serializable + P2034/P2002→409. Scope = solo master only (studio multi-master = MVP-2).
  - **Schema + migration `20260624140407_add_booking_package`** (`migrate dev --create-only` → review → deploy; drift OK):
    new model `BookingPackage` (servicePackageId SetNull / providerId / clientUserId / discountType+Value snapshot /
    totalKopeks / status) + enum `BookingPackageStatus {ACTIVE,CANCELLED}` + `Booking.bookingPackageId` (SetNull) +
    `ServicePackageItem.sortOrder` (backfilled by createdAt order).
  - **Atomic create** (`createSoloPackageBooking`, `src/lib/bookings/package-booking.ts`): per-component
    `resolveBookingCore` + **intra-package pairwise overlap** (siblings invisible to `ensureNoConflicts` mid-tx) +
    one Serializable tx creating BookingPackage + N Booking + N BookingServiceItem; all-or-none.
  - **Proportional discount** (`package-math.ts`, pure + unit-tested): largest-remainder split, Σ priceSnapshots ==
    final total exactly (kopeks); `packageFinalTotal` byte-identical to `computeBundlePricing.finalPrice`.
  - **Cancel-whole** (`cancelSoloPackageBooking`): one tx → all children REJECTED + pkg CANCELLED; lone-child cancel
    blocked in `cancelBooking` (409 `PACKAGE_CANCEL_WHOLE`). **Reschedule-parts**: existing move path, no change —
    `bookingPackageId` never touched, grouping survives (code + live verified).
  - **Endpoints**: `POST /api/public/packages/[id]/propose` (sequential placement preview), `.../book` (atomic create,
    guest-by-phone + 2-axis rate limit), `POST /api/bookings/package/[id]/cancel` (auth via child cancel-access).
  - **UX**: bundle card "Записаться на пакет" CTA (solo only) → modal: pick start → review N components (times +
    discounted prices + total) → confirm. `PublicBundleView` extended with `id` + `components` (booking-flow Rule-12 carve-out).
  - **Verify**: engine-safety (0 schedule changes, `/slots` SHA `e44cd0c2bb7582f6` deterministic Almaty-anchored) ·
    16 unit tests · live matrix (propose Σ-exact / atomic book + readback / atomic-fail no-partials / intra-overlap /
    cancel-whole / lone-child guard / already-cancelled / reschedule-part grouping) · UX both themes. test 762/85 · build ✅.
    Evidence: `.qa/diagnostics/package-mvp-1/`. **Deploy:** apply migration + regen snapshot (see BACKLOG deploy-ops).

---

## 2026-06-24 — EXP-TRIAGE-AND-GROUP1 (discovery/catalog)

- ✅ **EXP-волна затриажена** — все 33 `EXP-001…033` из `EXPLORATORY-FINDINGS.md` сведены в `BACKLOG.md` секцию
  «🔍 EXPLORATORY», сгруппированы тематически (discovery 5 / tz 4 / pricing 2 / content 8 / notif 3 / chat 2 /
  a11y 3 / seed 4 / verify-on-prod 2). Ничего не потеряно. Dedup: EXP-001…022 не пересекаются со старым backlog;
  «studio flat services» = public-профиль (cabinet уже группирует); «₽0 analytics» = R2-03-A.

- ✅ **Group 1 (discovery/catalog) — все 5 закрыты:**
  - **EXP-024** 🟠 — studio wizard листил всех мастеров → 5×409 `SERVICE_INVALID` + dead-end. Fix: `/api/providers/[id]/masters`
    отдаёт `serviceIds` (enabled MasterService); `booking-flow` фильтрует picker + availability-fetch на assigned-only.
    Live: «Маникюр классический» → 2/7 мастера, 0 console errors, 2× `/availability` 200.
  - **EXP-025 + EXP-026** 🟡/🔵 — `/availability` игнорил `minBookingHoursAhead` + расходился со `/slots` по `to`-inclusivity.
    Fix: новый shared `src/lib/schedule/bookable-window.ts` (`listBookableSlots`) — min-ahead + weekly/override schedule
    filter; оба endpoint'а зовут его (не могут разойтись). `/slots` byte-identical (engine untouched, verified SHA).
    `to` теперь inclusive в обоих.
  - **EXP-021** 🟠 — catalog city-selector был no-op. Fix: `/api/catalog/search` читает `getServerCity()` → `cityId` фильтр
    в `searchCatalog` (зеркало `/models`). Live: no-city 40 → moscow 18 / spb 7. Ungeocoded исключены из city-view.
  - **EXP-030** 🟡 — *floor-fix only*: `availableToday` = не построенный pipeline (всё пишет `false`). Footer «Мастера рядом»
    → `/catalog` (city-scoped, не dead-end); empty-state получил «Сбросить всё» CTA. Pipeline вынесен в новый backlog
    `CATALOG-AVAILABLE-TODAY-PIPELINE` (MEDIUM).
  - Validation: typecheck/lint(baseline)/encoding/mojibake ✅; **test 746/84** ✅; build ✅; engine-safety SHA-identical;
    live matrix (both themes spot). No DB mutations. Evidence: `.qa/diagnostics/exp-group1/`.

---

## 2026-06-24 — PII redaction + verify-closures (DOCS-CLEANUP follow-up)

- ✅ **R2-06-FI** (🟡 F + 🔵 I) — **closes the R2-06 sweep (A–I all ✅).** **F:** billing notifications gained an in-app
  CTA — `createBillingNotification` persists `billingScope`; `resolveNotificationOpenHref` maps `BILLING_*` →
  `billingUpgradeHref(scope)` (fallback `/cabinet/billing`); admin-initiated plan-edited threads scope. Live: center API
  returns MASTER/STUDIO/role-fallback hrefs. **I:** `createReview` self-review guard (`isBookingProviderSide`, 403)
  covering solo master / master-in-studio / studio owner+admins, keyed on the booking's linkage. Live: provider-as-client
  → 403; legit client still 201. typecheck/lint/test 746/build ✅. Evidence: `.qa/diagnostics/fix-r2-06-fi/`.
  **R2-06 final:** A reschedule-parity · B `?focus=` reader · C filterOffer · D schedule-requests link · E REVIEW_LEFT
  decode · F billing CTA · G hot-slot fallback · H review-gate · I self-review — all done.

- ✅ **R2-06-H** 🟡 — UI review-button gate aligned to the server can-leave gate (runtime-FINISHED + `REVIEW_WINDOW_DAYS=3`)
  via the single shared `canLeaveReview` predicate. Was: persisted-FINISHED + 14d re-derived in **3** places
  (`bookings.service` DTO, `reviews.service` KPI/list, `sidebar-counts` badge) → CONFIRMED-past bookings the server would
  accept showed no button. Extracted `reviewWindowFor` + `reviewCandidateWhere`; server gate unchanged. Live-verified:
  UI `canReview` === server `/can-leave` for all 9 bookings (0 mismatches), eligible submit → 201. typecheck/lint/test
  746/build ✅. Evidence: `.qa/diagnostics/fix-r2-06-h/`.

- ✅ **R2-06-A** 🟠 — studio reschedule **parity** with solo master (two-sided approval). Studio admin can now
  accept/decline a client-proposed reschedule. **Accept** reuses `POST /api/bookings/[id]/confirm` (auth already admits
  studio admin; same atomic FIX-R2-01-B `confirmBooking`). **Decline** = new shared `declineClientRescheduleRequest`
  (reverts to original time) + master path refactored to delegate to it (no drift) + new
  `POST /api/bookings/[id]/decline-reschedule`. **Surface:** inline Accept/Decline on the studio notifications page for
  `BOOKING_RESCHEDULE_REQUESTED`. Engine untouched. Live-verified (decline 200 + revert, privilege 403); studio actor
  code-certain (same auth; seed has 0 studio-master bookings to exercise live). Optional follow-up (calendar/journal
  action-menu surface) → active backlog 🔵. typecheck/lint/test 746/build ✅. Evidence: `.qa/diagnostics/fix-r2-06-a/`.

- ✅ **R2-06-B** 🟠 — shared `?focus=<id>` deep-link reader (scroll-to + transient highlight) for the booking-CTA
  family. Standardized all emitters to one canonical `?focus=` param (renamed 5 `?bookingId=` sites); new
  `useFocusHighlight()` hook + `<FocusHighlighter/>` island + `data-focus-id` row anchors on master bookings /
  dashboard (upcoming + attention) / client bookings / master reviews. Studio bookings N/A (notifications →
  `/calendar`). Live-verified (Playwright, real OTP) across master bookings + dashboard-attention + client bookings +
  graceful-degrade, 0 console errors; typecheck/lint/test 746/build ✅. Reusable for R2-06-A. Evidence:
  `.qa/diagnostics/fix-r2-06-b/`.

- ✅ **PII-LOGGING-FIX-A** 🔴 — raw email/phone в production logs замаскированы через shared `maskEmail`/`maskPhone`
  (`src/lib/logging/masking.ts`). 6 call-sites: `email/sender.ts` ×3 (`to`), `sms/index.ts` ×2 (`phone`),
  cabinet `email/verify/route.ts` ×1 (`email`). Реальный send (`sendMail`/`provider.send`) и OTP-логирование (rule 9)
  не тронуты. Masking at call-site = тот же payload в Telegram-alert sink + будущий Sentry. typecheck/lint-baseline/
  test 746/build ✅. Evidence: `.qa/diagnostics/pii-logging-fix-a/`. (Источник: SENSITIVE-DATA-LOGS-AUDIT-A 2026-06-02.)
- ✅ **MIGRATION-RECONCILIATION «full scope»** — verified reconciled: `check:schema-drift = OK (0 drift)`, schema.prisma
  ⟺ migrations history совпадают. *(Отдельная deploy-ops задача «применить `…_provider_timezone_default_moscow` на проде»
  остаётся в активном бэклоге — это apply-step, не reconciliation-gap.)*
- ✅ **QA-26 suite** — **не существовало** (phantom): Explore-агент misread заголовок `### QA (from QA-02 …, 2026-06-06)`
  как «QA-26». Реальные находки той секции (QA-101 dev-only, QA-108 fixed) уже закрыты FIX-25/FIX-01.

---

## Round 2 (blitz) — booking-lifecycle / billing / catalog / notifications (июнь 2026)

### R2-01 — reschedule + manual booking
- ✅ **R2-01-A** 🔴 — solo-master manual-booking double-book → `ensureNoConflicts` pre-tx + in-tx Serializable (FIX-R2-01-A, 2026-06-19)
- ✅ **R2-01-B** 🔴 — reschedule approval TOCTOU → exclude-self conflict re-check INSIDE move-tx + Serializable + commit-time 409 (FIX-R2-01-B, 2026-06-19). *Все booking-write пути теперь имеют единую in-tx Serializable conflict-дисциплину.*
- ✅ **R2-01-C** 📋 — manual-booking relaxations (min-hours/work-hours/walk-in) — documented-intentional

### R2-02 — onboarding-from-scratch
- ✅ **R2-02-A** 🔴 — timezone landmine → city-derived `Provider.timezone` + cabinet selector + schema default Moscow + миграция `20260619000000_provider_timezone_default_moscow` (FIX-R2-02-A, 2026-06-19). T4 resolved.

### BILLING-CYCLE
- ✅ **BC-1** 🟠 — renewal price source ≠ checkout → единый `resolvePlanPrice` (FIX-BC-1-2, 2026-06-20)
- ✅ **BC-2** 🟠 — pre-payment plan mutation removed; upgrade применяется только success-webhook (FIX-BC-1-2)
- ✅ **BC-3** 🟠 — webhook idempotency: `payment.succeeded` early-return на уже-SUCCEEDED (FIX-BC-1-2)
- ✅ **BC-4** 🟠 — период+план из authoritative DB-payment-row, не из mutable metadata (FIX-BC-1-2)

### R2-04 — studio complex flows
- ✅ **R2-04-A** 🟠 — studio create/move conflict re-check внутри tx (Serializable, exclude-self, 409) (FIX-R2-04-BA, 2026-06-21)
- ✅ **R2-04-B** 🟠 — studio work-hours guard в salon-tz (`resolveSalonLocalParts`) + `parseDateKeyToUtcStart` override-day fix (latent 500) (FIX-R2-04-BA, 2026-06-21)

### R2-05 — admin operational flows
- ✅ **R2-05-A** 🔴 — category approve never published → `APPROVED⟺visibleToAll` lockstep на approve/reject/PATCH (FIX-R2-05-AB, 2026-06-23)
- ✅ **R2-05-B** 🔴 (money) — plan-edit 0-price продавал длинные термы бесплатно → `isPriceable`>0 + upsert удаляет ≤0 row + marketing через тот же resolver + FREE до резолвера (FIX-R2-05-AB, 2026-06-23)

### R2-06 — notification CTAs + review-submit (FIX-R2-06-quick, 2026-06-23)
- ✅ **R2-06-E** 🟠 — `REVIEW_LEFT` dead notification → `decodePublicId(review.id)` перед lookup
- ✅ **R2-06-C** 🟡 — model-offer deeplink `?offerId=` → `?filterOffer=` (4 emitter-сайта)
- ✅ **R2-06-D** 🟡 — `SCHEDULE_REQUEST` "Открыть заявку" → `/cabinet/studio/schedule-requests`
- ✅ **R2-06-G** 🔵 — `HOT_SLOT_*` fallback `/hot-slots` 404 → `/catalog?hot=true`

---

## Round 1 — pre-launch self-QA campaign (FIX-01…FIX-25, июнь 2026)

> Полный ledger — `QA-FINDINGS.md` → «🏁 CAMPAIGN-CLOSURE LEDGER». Каждая QA-NNN закрыта соответствующим FIX.

- ✅ **QA-108** 🔴 — env.ts `process.exit` крашил prod client → guard prod-exit (FIX-01, 2026-06-14)
- ✅ **QA-001** 🟡 — /login hydration mismatch (Telegram/VK env-via-alias) → props + env.ts client literal-inlining (FIX-09, 2026-06-16) + CSP unsafe-eval removal (FIX-23, 2026-06-17)
- ✅ **QA-105** 🟡 — bulk-seed цены в рублях не копейках (FIX-02, 2026-06-14)
- ✅ **QA-102** 🟠 — catalog image resilience (unconfigured hosts) (FIX-02/12/21)
- ✅ **QA-109** 🟠 — цены 100× inflated (moneyRUB не ÷100) на 9 callsites (FIX-03, 2026-06-15)
- ✅ **QA-110** 🟠 — booking time-grid показывал 2 дня вперемешку (FIX-05, 2026-06-15)
- ✅ **QA-111** 🟡 — `slotStepMin` hardcoded 30 → plumbing (FIX-05)
- ✅ **QA-103** 🟠 — catalog search CUID leak → opaque id (FIX-13, 2026-06-16)
- ✅ **QA-104** 🟠 — home hero/footer deep-link param mismatch (FIX-13)
- ✅ **QA-112** 🔵 — dashboard capacity «0ч» + comparison label (FIX-08, 2026-06-15)
- ✅ **QA-113** 🟠 — master schedule labels в host-tz не provider-tz (FIX-04/11/20)
- ✅ **QA-114** 🟠 — studio master schedule-edit без approval-feedback (FIX-06, 2026-06-15)
- ✅ **QA-115** 🟡 — studio affiliation невидим на master cabinet/profile (FIX-06)
- ✅ **QA-116** 🔵 — seed weekday 0–6 vs ISO 1–7 (FIX-08)
- ✅ **QA-119** 🟠 — client mobile bottom-nav перекрывал контент (FIX-07, 2026-06-15)
- ✅ **QA-120** 🟡 — client booking action-buttons < 44px tap-target (FIX-07)
- ✅ **QA-122** 🟡 — time-grid exhausted-today empty state (FIX-10, 2026-06-16)
- ✅ **QA-123** 🟠 — master day-grouping в host-tz (FIX-20, 2026-06-18)
- ✅ **QA-002** — admin redirect/landing (FIX-08)
- ✅ **QA-106** 🔵 — off-schedule slot rejection copy (UI_TEXT only) (FIX-25, 2026-06-18)
- ✅ **RULE-12-SWEEP** (FIX-14…19) — public CUID leaks закрыты через `src/lib/public-id.ts` opaque encoding (search/models/portfolio/stories/providers/reviews/schedule)
- ✅ **IMG-RESILIENCE-SWEEP** (FIX-21) — 15 remote-image surfaces через FocalImage onError
- ✅ **QA-107** (частично, FIX-22) — salon-tz display + «Время салона (город, GMT+N)» label; `isToday`/«Ближайшая» salon-tz (FIX-20)
- ✅ **CSP/social-auth cluster** (FIX-24, 2026-06-18) — theme-nonce + Telegram frame-src/connect + VK CORS

### Plan-gating (FIX-26/27/28, 2026-06-19)
- ✅ **PLAN-GATE-CTA-BROKEN** (FIX-26) — scoped upgrade-CTA via `billingUpgradeHref`
- ✅ **PLAN-GATE-UI-INCONSISTENT / NOTIF-NO-AFFORDANCE / HINT-DIVERGENCE / DEAD-CANONICAL** (FIX-27) — единый `FeatureGate` (section+inline), derived-tier
- ✅ **PLAN-PARITY-DEAD-GATE-financeReport / DEAD-STUDIO-HOTSLOTS / clientNotes-appliesTo / SIDEBAR-VESTIGIAL-GATE** (FIX-28) + billing-notification deep-links scope-threaded
- ✅ **PLAN-STUDIO-PRO-BI-ASYMMETRY** — documented-intentional (FIX-28)

### Dev-only (no code change, prod-confirmed safe)
- ✅ **QA-101** — `/u/[username]` + slots API 500 = jest-worker dev artifact (prod 200 confirmed)
- ✅ **QA-117** — `/admin/reviews` slow-first-render = dev compile latency

---

## Завершённые workstreams и аудиты (май–июнь 2026)

> Детали каждого — `MASTERRYADOM_AI_CONTEXT.md` §15.

- ✅ **Cabinet Master** — полный redesign (sidebar shell / dashboard / bookings kanban / schedule / settings 5 tabs / clients / reviews / analytics / profile / messages / portfolio / services)
- ✅ **Cabinet Client** — полный redesign (bookings/favorites/messages/model-applications/notifications/profile/reviews/roles/settings/faq)
- ✅ **Cabinet Studio** — 19 коммитов (shell / dashboard / masters / schedule / bookings / services / packages / clients / reviews / notifications / analytics / settings + showcase seed + bug-fix/polish)
- ✅ **Admin Panel** — Shell / Dashboard / Catalog / Cities / Users / Billing / Settings / Reviews + AdminAuditLog integration + MRR snapshots
- ✅ **Public surfaces** — public master profile `/u/[username]` + booking widget (foundation + UX redesign) + public studio profile
- ✅ **Chat foundation** (3 коммита, 2026-05-19) — universal chat + SSE + read receipts + attachments
- ✅ **OpenAI → Yandex AI migration** — Phase 4a–4e (review-summary/reply/service-description/advisor) + wrapper + cleanup + prompt-tune (2026-05-31)
- ✅ **MIGRATION-RECONCILIATION-BATCH** (2026-05-30) — 24-op drift reconciled + `check:schema-drift` CI-гейт добавлен + `db push` запрещён (CLAUDE.md rule 16)
- ✅ **BUCKET-A-BATCH** (2026-05-29) — VAPID-NON-NULL-FIX · CONTEXT-FRESHNESS-CI-CHECK · RUNBOOK-INDEX-A · DRILL-PASS-CRITERIA-A · OPENAPI-ROUTE-CI · PORTFOLIO-EDITOR-NEXT-IMAGE
- ✅ **STRUCTURAL-PREVENTION-AUDIT** (capstone) + **CONTEXT-REFRESH-V3** (2026-05-29)
- ✅ **Audit-волна 11/11** — LEGACY-CLEANUP / SECURITY / CODE-CONSISTENCY / TEST-COVERAGE / ERROR-HANDLING / DEPLOYMENT-READINESS / BUSINESS-LOGIC / PERFORMANCE / UI-UX / DOCUMENTATION + sprint-retrospective
- ✅ **Audit-волна fix-prompts** — PROD-ENV-EXAMPLE-SYNC-A (DR-1) · **FEED-PORTFOLIO-N1-FIX-A** (PERF-1; `loadMasterServiceOverridesMap` + tests) · **MODAL-A11Y-BATCH-A** (UI-1+UI-3 = инвариант #27, закрыл MODAL-FOCUS-TRAP) · EMAIL-VERIFY-FIX-A · OTP-LOG-DEV-GUARD-A (SEC-1) · ENV-DISCIPLINE-SWEEP-A (CC-1) · FAST-WINS-BATCH-A · SECURITY-SURFACE-TESTS-A · SMS-GATEWAY-A (P1; SMS provider abstraction — live creds = deploy item)
- ✅ **Email/CORS/quick-wins** (май–июнь) — EMAIL-MODULE-AUDIT-A · EMAIL-BRAND-URL-FIX-A · EMAIL-SUPPORT-ADDRESS-CONSOLIDATE-A · CORS-FIXES-BATCH-A · PRE-LAUNCH-QUICK-AUDITS-A · EMPTY-STATE-COMPONENT-A · SENSITIVE-DATA-LOGS-AUDIT-A (audit; fix → PII-LOGGING-FIX-A остаётся OPEN)
- ✅ **GRAPHIFY-SETUP** + **PRE-LAUNCH-CHECKLIST-DOCUMENT** (2026-05-31)
- ✅ **Legacy sweep** (FIX-25) — 3 proven-orphan deletions (старые studio `studio-clients-page`/`studio-reviews-page`/`studio-profile-page`)

### Phases
- ✅ Phase 1 — Cabinet Master · Phase 1.5 — Cabinet Client + Public + Chat + Multi-city · Phase 2 — Admin Panel · Phase 3 — Cabinet Studio · Phase 4 — Public surfaces · Phase 5 — Chat enhancements

---

## Code-vs-backlog reconciliation (закрыто при DOCS-CLEANUP 2026-06-23)
Эти пункты числились OPEN в старом `BACKLOG.md`, но код подтверждает их завершённость:
- ✅ **SCHEMA-DRIFT-CI-CHECK** — `scripts/check-schema-drift.mjs` существует + wired в `npm run check` (MIGRATION-RECONCILIATION-BATCH)
- ✅ **FEED-PORTFOLIO-N1-FIX-A** — landed (`src/lib/feed/portfolio.service.ts` `loadMasterServiceOverridesMap` + regression test)
- ✅ **MODAL-FOCUS-TRAP-FIX-A** — закрыт MODAL-A11Y-BATCH-A (инвариант #27 `use-modal-a11y`)

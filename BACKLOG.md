# BACKLOG.md — Активные задачи МастерРядом

> Только **открытые** задачи. Завершённое — в [`BACKLOG-DONE.md`](BACKLOG-DONE.md). Детали находок — в
> [`QA-FINDINGS.md`](QA-FINDINGS.md); changelog — в [`MASTERRYADOM_AI_CONTEXT.md`](MASTERRYADOM_AI_CONTEXT.md) §15.
> Приоритеты: 🔴 pre-launch blocker · 🟠 high (желательно до launch) · 🟡 medium (после launch) · 🔵 nice-to-have.
> Когда задача делается — переносим её в `BACKLOG-DONE.md` с датой. Новую deferred-задачу — добавляем сюда.
>
> Выполненные пункты — в BACKLOG-DONE.md (append-only).
> Ведение: активные пункты — здесь, по приоритету (🔴→🔵). Завершил пункт →
> удали строку отсюда + допиши одну строку в BACKLOG-DONE.md. Не держи «Выполнено» тут.
>
> Trim/refresh: **23 июня 2026** (DOCS-CLEANUP). Split active/done: **6 июля 2026** (DOCS-LEDGER-01 — inline-✅ перенесены в ledger). DOCS-LEDGER-02: **7 июля 2026** — закоммиченные adversarial-bug-hunt findings (HARDENING-01…10, #1–#17) перенесены в BACKLOG-DONE.
> Состояние кода: Round 1 + Round 2 self-QA пройдены; booking / billing / catalog / timezone / auth-CSP закрыты.
> Остаток до launch — преимущественно **operational** (deploy/ops ниже) + R2-06 notification-слой + product-decision follow-ups.

---

## 🎯 ТЕКУЩИЙ ФОКУС

- **🎉 R2-06 sweep ЗАКРЫТ** (A–I все ✅, 2026-06-24). **🎉 EXP-волна затриажена** (33 находки в секции
  «🔍 EXPLORATORY» ниже) + **Group 1 (discovery/catalog) ЗАКРЫТ** (EXP-021/024/025/026/030, 2026-06-24)
  + **TZ-cross-surface ЗАКРЫТ** (EXP-017/019/020/023, 2026-06-25 — shared entity-tz `formatLocalHm`)
  + **Pricing-copy ЗАКРЫТ** (EXP-014 copy / EXP-015 CTA, 2026-06-25 — neutral public fallback + truthful `#pricing-plans` anchor)
  + **Content/grammar/SEO ЗАКРЫТ** (EXP-001/002/003/004/005/008/016/018, 2026-06-25 — source-fixed: title-template convention, consent grammar, genitive-month helper, configurable ИНН, truthful provider-count, etc)
  + **Chat/UX ЗАКРЫТ** (EXP-012 list-refresh-on-send / EXP-022 redirect setState-guard, 2026-06-25)
  + **a11y/PWA/cleanup ЗАКРЫТ** (EXP-033 pinch-zoom / EXP-032 orphan manifest / EXP-013 datetime upcoming-split, 2026-06-25).
- **🎉 PACKAGE-BOOKING ФИЧА ЗАКРЫТА (solo MVP-1 + studio MVP-2)** (2026-06-24/25; см. BACKLOG-DONE.md). MVP-2 (studio
  multi-master): клиент выбирает мастера на каждый компонент (только assigned — `assertMasterPerformsService`), компоненты
  **sequential по timeline КЛИЕНТА** (не parallel — клиент один, не может быть в двух креслах), **by-client** intra-package
  overlap, salon-tz per component, atomic + proportional (Σ exact) + cancel-whole + reschedule-parts; **surfaced на studio
  public profile** (R2-04-PKG закрыт). Reuse MVP-1 каркаса (no fork, no new migration). Engine-safety SHA-identical.
- **Seed-hygiene ЗАКРЫТ** (FIX-EXP-SEED-HYGIENE ✅ 2026-06-26 — EXP-006/007/010/011 + R2-03-A: RF-only seed (no KZ), Vision→Екатеринбург +5 для tz-testability, priced items → analytics non-zero, snapshot регенерирован).
- **Notifications/push ЗАКРЫТ** (FIX-EXP-NOTIFICATIONS ✅ 2026-06-26 — EXP-027 push gesture-gating + re-enable, EXP-028 client per-channel prefs incl. push, send-gating через `pushNotificationsEnabled`; EXP-029 per-event matrix DEFERRED как next feature). **🎉 EXP-консолидация завершена** (discovery/catalog · tz · pricing-copy · content/grammar · chat · a11y/PWA · seed-hygiene · notifications).
- **🎉 Adversarial bug-hunt (pre-launch hardening) ЗАКОММИЧЕН** — HARDENING-01…10 (findings #1–#17 + spawned billing/audit) закрыты и перенесены в `BACKLOG-DONE.md` (DOCS-LEDGER-02, 2026-07-07). Остаток по этой волне — чисто **operational** (см. DEPLOY / OPS: TRUSTED_PROXY flip → `YOOKASSA_IP_ALLOWLIST_ENFORCED`, trial-conversion backfill, live auth/SMS creds, миграции).
- Следующее: **pre-deploy verification runs** (deploy-ops чеклист на staging/prod) → затем EXP-029 per-event matrix + legacy/@deprecated sweep + commit-grouping для PR.
- **Deploy / ops** (см. секцию ниже) — env-домены, live social-auth creds, SMS creds, geocoder key, DevOps infra,
  применить FIX-R2-02-A миграцию на проде до regen seed-snapshot.
- **Product decisions решены Артёмом** (см. секцию ниже) → теперь это actionable code-задачи.

---

## 🔴 PRE-LAUNCH BLOCKERS (code)

- **Нет прочих открытых *общих* code-блокеров.** Последний (**PII-LOGGING-FIX-A**) закрыт 2026-06-24 — см. `BACKLOG-DONE.md`.
  Прочие 🔴 из прошлых волн (R2-05-A/B category+billing, R2-02-A timezone, booking-integrity) — тоже закрыты.
- **🔴 LEGAL launch-blockers (auth/channels) — precede deploy** *(из AUTH-DISCOVERY 2026-06-29)*. **⏰ DEADLINE: FZ-199 (поправки в КоАП) вступают в силу 7 июля 2026** — штрафы до 700k₽ за иностранные auth-сервисы. Code-сторона блокеров закрыта (Telegram удалён, Yandex добавлен, VK готов); остаток — **deploy-ops verification** (см. PRE-DEPLOY-CHECKLIST Layer 2). Time-critical:
  1. ✅ **FIX-TELEGRAM-KILLSWITCH** *(2026-06-29 — см. BACKLOG-DONE.md)* — user-facing Telegram погашен через two-layer flag
     (`NEXT_PUBLIC_TELEGRAM_ENABLED` env hard-ceiling, default false + admin SystemConfig toggle below it). Login/cabinets/
     delivery/footer/profile-contacts/partnership — gated absent + inert when off; ops-monitoring Telegram не тронут; код не удалён (re-enableable).
  2. ✅ **Yandex OAuth (add)** *(FIX-YANDEX-OAUTH 2026-06-29 — code-complete; см. BACKLOG-DONE.md)* — bespoke-parallel к VK: `src/lib/yandex/*`
     (config/pkce/cookies/oauth/schemas) + `api/auth/yandex/{start,callback,unlink}` + `YandexLink` model (миграция `20260629201051`) + `YandexLoginButton`
     (self-gating) + env `YANDEX_OAUTH_*` + `isYandexAuthEnabled`. Account-linking зеркалит vk/callback точно (new-vs-existing + 409 guard). CSP не тронут
     (top-level redirect, не framed widget). Default OFF. **🚀 Live OAuth round-trip = deploy-ops** (нужен registered Yandex app + creds + redirect_uri).
  3. ❌ **RF-email allow-list — CANCELLED / not required** *(решено PRE-DEPLOY-CHECKLIST 2026-06-30)*. Rationale: FZ-199/149-ФЗ ограничивают
     **механизм авторизации сайта** (иностранные login-кнопки типа Google/Apple), а **не** домен email-адреса, который вводит пользователь.
     Email-OTP — это собственный механизм платформы, поэтому RF-domain фильтр не нужен. Verified: `otpEmailRequestSchema` принимает любой
     deliverable email (нет `.superRefine`/allow-list — confirmed clean). Никакого кода не требуется.
  4. **VK completion** — code-complete (login + new-vs-existing linking работают). Остаток = чисто **deploy-ops**, **folded into PRE-DEPLOY-CHECKLIST**
     (нет отдельного промпта): register prod `redirect_uri` (`мастеррядом.online`) в VK app + live creds + live round-trip. Опц. hardening (logout-call, token-refresh) — post-launch.
  - Порядок: #1 Telegram ✅ → #2 Yandex ✅ (code) → ~~RF-email~~ (cancelled) → VK (deploy-ops). SMS — отдельно (deploy-ops, провайдер built).
  - **☑️ Telegram re-enable checklist (перед флипом kill-switch `NEXT_PUBLIC_TELEGRAM_ENABLED=true`):** (1) #9 Telegram login CSRF *(HARDENING-06)* — ✅ закоммичен (BACKLOG-DONE); (2) #13 reminder salon-tz *(HARDENING-09)* — ✅ закоммичен (BACKLOG-DONE) (иначе напоминания уходили бы в raw-UTC на non-Moscow салоны); (3) verified 2026-07-07 (HARDENING-09 Phase A audit): **других kill-switch-masked Telegram-путей нет** — единственный live time-formatting Telegram-путь это reminder (fixed); lifecycle CREATED/CANCELLED/CONFIRMED sender был dead и удалён; ops-monitoring (`MONITORING_TELEGRAM_*`) — отдельная система, не под kill-switch by design. **Note:** FZ-199 (иностранные auth-сервисы) — отдельный legal-блокер выше; Telegram re-enable касается техкорректности, не снимает legal-запрет.

---

## 🟠 HIGH PRIORITY

- **OBSERVABILITY-SENTRY-A** — нет error-aggregation/APM; production debugging = log-scraping. Ставить **после** PII-LOGGING-FIX-A
  (Sentry с `sendDefaultPii:false` + `beforeSend` PII-scrubber). ~half-day.

---

## 🟡 MEDIUM PRIORITY

> **📋 Post-report residue (adversarial bug-hunt HARDENING-01…10 закоммичены 2026-07-07 → перенесены в BACKLOG-DONE, DOCS-LEDGER-02):** весь tail (#1–#17) + spawned billing/audit находки **закрыты и в ledger'е**. **Остаётся открытым:** (1) 🔵 **PARTIAL-REFUND-ACCOUNTING** (ниже) — deferred feature (нужна schema-миграция, admin partial refunds заблокированы на API, не launch-blocker); (2) **deploy-checklist** (не код, см. DEPLOY / OPS): trial-conversion backfill · worker egress к `api.yookassa.ru` · sandbox-webhook validation · `TRUSTED_PROXY_HOPS`/`TRUSTED_REAL_IP_HEADER` под prod-edge → flip `YOOKASSA_IP_ALLOWLIST_ENFORCED=true` · Telegram re-enable checklist (#9+#13 закоммичены).

**R2 (Round 2) residual:**
- 🟡 **R2-05-G** *(DEFERRED — next-release, Артём 2026-07-01)* — нет фидбэка репортёру при модерации отзыва; нет UI восстановления soft-deleted отзыва (только manual SQL). **Rationale:** admin-moderation surface, non-blocking для MVP launch — Артём решил not-now (2026-07-01).
- 🟡 **R2-05-A2** *(DEFERRED — next-release, Артём 2026-07-01)* — category reject reason только в логах (нет колонки); владельцы portfolio-item не уведомляются при delist. **Rationale:** admin-moderation surface, non-blocking для MVP launch — Артём решил not-now (2026-07-01).
- ✅ **R2-05-J** *(BILLING-PRICE-ACTIVE-UI-01 2026-07-08 — implemented, pending commit → перенести в BACKLOG-DONE при коммите)* — first-class admin toggle для `BillingPlanPrice.isActive`. Теперь цену можно **деактивировать без удаления строки** (и снова активировать) — раньше только direct-DB / удаление period-row при ≤0. **Schema-free** (`isActive` колонка + DTO + `snapshotPlanForAudit` уже несли per-price isActive). **API:** расширен audit-logged `PATCH /api/admin/billing/plans/[id]` — `prices[].isActive` в Zod, upsert flip-если-передан / preserve-если-нет (create default true сохранён), isActive-дельта в `ADMIN_PLAN_EDITED` diff (`{period}m.active`). **Guard (BLOCK, server + client-mirror):** `findOrphanedOfferedPeriod` (`price-active-guard.ts`) — деактивация, оставляющая offered-период без resolvable-цены (нет active exact + нет active monthly-anchor), → 400 `BILLING_PRICE_LAST_ACTIVE`; деактивация 3/6/12 при активной monthly разрешена (fallback). **UI:** per-period Switch «Активна» + **live итоговая цена** (`resolvePlanPrice`, R2-05-C-v2 tie-in — видно, какую цену прочтёт renewal/checkout) + orphan-warning + save-disable. **Resolver semantics не тронуты** (все читатели — checkout/renewal-opt-in/marketing/MRR — фильтруют ту же `isActive` колонку). +7 unit-тестов. FULL gate: typecheck/lint(baseline)/encoding/mojibake/**test 1041** ✅. *(Audit-note: isActive-изменения логируются в едином `ADMIN_PLAN_EDITED` diff — консистентно с name/price/features, а не отдельными `BILLING_PRICE_ACTIVATED`-экшенами.)*

**Прочее:**
- **CATALOG-AVAILABLE-TODAY-PIPELINE** (spawned by EXP-030) — `Provider.availableToday` — snapshot, который **никто никогда не вычисляет** (все write-сайты ставят `false`). **Дизайн (AUDIT 2026-07-02):** cron-precompute boolean `availableToday`, ~30-min sweep. Фильтр `?availableToday=true` — это Prisma `WHERE` на колонке → нужен **stored** boolean (on-read не может paginate at DB). Scale = 43 published provider (дёшево). Engine-safe: читать через pure `getDayPlanFromContext`+`buildSlotsForDay`, НЕ `listAvailabilitySlotsPaginated` (пишет slots-cache). Cron-инфра уже есть (worker `setInterval` `startPeriodicJobs`). Фазы: **1** pure helper+tests · **2** recompute sweep + column write + x-cron trigger + one-shot script · **3** worker `setInterval` + live-verify filter/chip/badge · 4 (опц.) precise invalidation.
  - ✅ **Phase 1** *(2026-07-02 — pure helper + tests; ничего не wired, engine untouched)* — `src/lib/schedule/available-today.ts` (server-only, rule 13): `hasFreeSlotToday(providerId, now?)` (MASTER = single-probe; STUDIO = OR над ACTIVE-мастерами `ownerUserId!=null && isPublished`, short-circuit) + pure `anyBookableSlot` / `anyProviderFreeToday(providers, now, probe)` (injected probe для тестов) + `providerHasFreeSlotToday`. Salon-tz 'today' (`toLocalDateKey(now, tz)`), service-agnostic 30-min probe, mirrors `computeAvailabilityHint`. **🔴 Engine-safety:** git-diff = **0 mutation** slot-gen (только 2 новых файла); helper НЕ зовёт `listAvailabilitySlotsPaginated`/`setCachedSlotsForDate` (grep — только pure path + benign DayPlan-memo); TZ=UTC≡Europe/Moscow slot-gen SHA **byte-identical** (`COMBINED=8954c72d…843c42`, harness `.qa/diagnostics/available-today/`). Tests +13 (13/864): counting cutoff·+5 salon-tz bucketing·earliest-bookable·day-off·studio-OR 0-free/1+-free/short-circuit·service-agnostic. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. **Не wired** — catalog всё ещё serves static `false`.
  - ✅ **Phase 2** *(2026-07-02 — recompute sweep + первый column write + protected trigger + verify script; NO migration, NO setInterval)* — `src/lib/schedule/recompute-available-today.ts`: `recomputeAvailableToday(now?)` цикл по всем published providers (MASTER → `providerHasFreeSlotToday`; STUDIO → `hasFreeSlotToday` OR-branch). **Guardrails:** minimal-write (compare vs stored → batched `updateMany` только флипы), resilient (per-provider try/catch → `logError`+continue, errored keeps prev value, не abort), summary `{total,changed,errored,erroredIds}`. **Endpoint** `POST /api/catalog/available-today/run` (rule-12 internal, mirror MRR): x-cron-token (header/`?token=`) fail-closed (`!expected||token!==expected → 403`, unset-secret refuses); valid → inline sweep → summary JSON. **Env** `AVAILABILITY_CRON_TOKEN` (env.ts `.optional()` + оба `.env.example`/`.env.production.example` с placeholder+comment). **Script** `scripts/recompute-available-today.mts` (dynamic-import .mts; before/after print). **🔴 Engine-safety re-confirm:** loop-of-pure-read + column-write only; git-diff slot-gen files = **0 mutation** (только новые sweep/endpoint/script + env/templates). **Live (Docker):** baseline 0/43 free → sweep `{total:43,changed:36,errored:0}` (Vision +5 studio + Anna free — real availability; 6 generic studios busy); idempotent re-run `changed:0`; reactive (day-off override для Anna today + FLUSHALL → `changed:1` Anna→busy); endpoint no-token/wrong-token→403, valid→200+summary. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. Captures `.qa/diagnostics/available-today-phase-2/`. Baseline restored (0/43, override gone). **Не auto-scheduled** — Phase 3 добавит worker `setInterval` + live-verify filter/chip/badge с live-значениями.
  - ✅ **Phase 3** *(2026-07-02 — schedule + user-visible; **🎉 MVP complete**)* — sweep wired в worker `startPeriodicJobs` (`src/worker.ts`): startup run (fire-and-guard, non-blocking boot) + 30-min `setInterval`, тот же safe-wrapper что hot-slots/review-prompts (throw → `logError`, не crash worker/не block others). **Live (Docker):** worker.log — startup `{changed:27}` + 2 interval-ticks `{12:31 changed:10, 13:01 changed:0}` (setInterval **FIRES**, resilient errored:0). **Playwright both themes:** filter `?availableToday=true` → каждый item availableToday===true, **zero busy-leak** (DB WHERE работает — был всегда-пуст); card-chip «Сегодня свободно» present на free (5/5, light+dark)/absent на busy (Сирень/Олива без чипа); studio-badge present на free Vision / absent на busy Аура. Midnight-rollover self-heal: sweep recomputes `todayKey=toLocalDateKey(now,tz)` каждый run (noon vs morning-`now` sweep дали разный free-set для тех же providers) — ≤30-min, +5 pinned Phase-1 test. **🔴 Engine-safety:** git-diff slot-gen = 0 mutation (phase = `worker.ts` only); SHA byte-identical. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. Captures `.qa/diagnostics/available-today-phase-3/`. Baseline restored (0/43). *(Note: `/u/[username]` studio profile 500'ил на baseline т.к. `getProviderProfile` селектит `socialVk`/`socialInstagram` — FEAT-код в дереве, но baseline snapshot без колонок (FEAT-миграция `--create-only`, не применена). Временно добавил 2 nullable-колонки локально для badge-теста; restore их убрал. НЕ Phase-3 дефект; catalog card/filter (другой query) не затронуты. Cross-task: применится когда FEAT-миграция задеплоится.)*
  - ⏳ **Phase 4 (опционально/deferred)** — precise per-mutation invalidation (mark-dirty на `invalidateSlotsForBooking`/`invalidateSlotsForMaster` → targeted recompute) для <30-min freshness. Не нужно для MVP (30-min staleness accepted).
- **OTP-EMAIL-LOGIN-RACE** — 6-й P2002 site (OTP email login `create`), latent low-probability. Fix: re-read recovery.
- 🔵 **PARTIAL-REFUND-ACCOUNTING** *(spawned HARDENING-03 FIX-11)* — полноценный частичный возврат: `PARTIALLY_REFUNDED` enum-value + `BillingPayment.refundedKopeks` (schema-миграция) + пересчёт статуса/остатка при частичном refund. Сейчас admin partial refunds **заблокированы на API** (`decideRefund` → `PARTIAL_REFUND_NOT_SUPPORTED` 400); shipped UI шлёт только полный возврат, поэтому не launch-blocker.
- **PRISMA-INCLUDE-WHERE-CI-CHECK** — AST-гейт против nested-include без `where` (N+1 over-fetch class).
- **SMS-MONITORING-A** — admin balance-widget + daily low-balance cron (после live SMSC).
- **ENV-CONSOLIDATION** *(ENV-FILE-AUDIT + ENV-CONSOLIDATION 2026-06-30)* — split by ownership. ✅ **Tracked side (agent):** `.env.production.example` = единый canonical полный prod-template (cross-check vs env.ts 72 ключа — все required + launch-critical optionals покрыты; gaps только explainable: `MEDIA_LOCAL_*` = dev local-storage, `VK_ID_*` = alias-documented, `AI_PROVIDER` = vestigial-commented); `.env.example` = dev-onboarding (consistent, минус docker-only `POSTGRES_*`/`REDIS_PASSWORD`); VK-alias + AI_PROVIDER notes добавлены в оба; `.gitignore` verified (`.env`/`.env.local`/`.env.production` IGNORED, оба `.example` tracked). ⏳ **Local side (Артём, gitignored — agent не трогает):** в `.env.local` скопировать `WORKER_SECRET`+`AI_FEATURES_ENABLED` из `.env`; удалить 4 dead var (`SUPADATABASE_URL`,`SUPADIRECT_URL`,`OTP_EXPIRATION_TIME`,`DATABASE_URL_V6`); fix 2 stale `beautyhub.art`→`мастеррядом.online`; `Remove-Item .env` → один local-файл. Step-list в отчёте ENV-CONSOLIDATION. *(Снимает прежний ENV-DATABASE-CLEANUP «3 orphan vars».)*
- **OPENAPI-COVERAGE-INCREMENTAL** — гнать allowlist 216→0 по кластерам.
- **VISUAL-SEARCH-YANDEX-MIGRATION** (post-launch) — vision+embeddings на Yandex + schema `vector(1536)→vector(256)`.
- **AUTH-PROVIDER-ABSTRACTION** *(post-launch refactor, spawned by AUTH-DISCOVERY 2026-06-29)* — сейчас каждый OAuth-провайдер
  bespoke (VK = чистый `src/lib/vk/*`; Telegram размазан по `src/lib/auth/*`; login-grid = hardcoded JSX). После закрытия legal-блокеров
  (Yandex · VK; RF-email cancelled) — унифицировать в provider-abstraction + registry-driven login-grid, выведенный из рабочих провайдеров.
  **Не рефакторить под fine-pressure** — отложено на после launch.
- ✅ **TZ-DISPLAY-DEFERRED-3** — **ГОТОВО (TZ-DISPLAY-SALON-PARITY-01 2026-07-08; pending ledger-move в BACKLOG-DONE Артёмом на коммите).** Все 3 поверхности → salon-tz: (1) master reschedule-modal — provider tz через `reschedule-context/route.ts` → `context.timezone` (precedence `masterProvider ?? provider`, = slot-gen); (2) `/book` — `masterTimezone` из `getPortfolioDetail`; (3) CRM client-card — `card.timeZone` (= `provider.timezone`). `viewerTimeZone` оставлен ТОЛЬКО для `zonesDifferForViewer` (решение показать метку). Skill §3a.
- ✅ **TZ-DISPLAY-MINOR-2** — **ГОТОВО (TZ-DISPLAY-SALON-PARITY-01 2026-07-08; pending ledger-move).** (a) studio create-booking — read-only карточка `UI_FMT.dateTimeShort({ timeZone })` + `datetime-local` ввод через shared `datetime-input.ts` (salon-local wall-clock, метка «время салона»); (b) catalog card «Ближайшее» — `item.timezone` (= `provider.timezone`) в `formatAvailability` (dormant, correct-when-lit). Заодно закрыт **MoveBookingDialog `datetime-local`** tail (тот же FIX-4 helper — round-trip UTC↔salon-local, fallback `?? currentStartAtUtc` never-shift). Тесты: `datetime-input.test.ts` (round-trip Vision +5) + `salon-tz-display.test.ts`. Skill §3a.
- 🟡 **TZ-DISPLAY-MANAGE-BREAKS-INPUT** *(NEW, TZ-DISPLAY-SALON-PARITY-01 2026-07-08 — вне scope 5 named-поверхностей)* — studio `manage-breaks-dialog.tsx:37` строит значение `datetime-local` через `getHours()`/`getMinutes()` (браузер-tz) — **тот же класс, что FIX-4** для create/move, но диалог перерывов: cross-tz админ создаёт перерыв не в salon-local wall-clock. DISPLAY-часть перерывов (`:177-180`) уже salon-tz. Открыт только **input**-путь. Фикс: применить `datetime-input.ts` (`utcIsoToSalonInput`/`salonInputToUtcIso`) + метка «время салона» + round-trip тест. Флагнут `check:tz`. Skill §7.
- ✅ **BOOKING-JOURNAL-SERVICEID-01** — **ГОТОВО (2026-07-08; pending ledger-move в BACKLOG-DONE Артёмом на коммите; ранее только report-flag из BOOKING-STUDIO-RESCHEDULE-PARITY-01, не активная строка).** Journal `bookingToCell` (`booking-row.tsx`) хардкодил `serviceId: ""` → Move-from-journal «Перенести на мастера» гейтил `m.serviceIds.includes("")` = false для ВСЕХ мастеров → все target-мастера `disabled` «· несовместим» (over-block, «Перенести по времени» не затронут). **Не integrity-hole** — сервер `moveStudioBooking` независимо re-validates `assertMasterPerformsService` из DB (KEEP_SERVICE). Фикс = parity с calendar: `Booking.serviceId` (non-null FK; каждый package-child = отдельная строка со своим serviceId, без ambiguity) проброшен `bookings-list.service.ts` select+mapping → `StudioBookingRow.serviceId` → `bookingToCell` (вынесен в pure `lib/booking-to-cell.ts`, тестируемо). Reuse существующего `MoveBookingDialog`+server-пути, no new code path. Тест: `booking-to-cell.test.ts` (7 — threading + parity gating + package-child). No schema change.
- 🟡 **QA-TESTID-COVERAGE** *(spawned by SKILL-PLAYWRIGHT-01 2026-07-06 — recommend, не внедрено)* — в `src/` **0 `data-testid`** (verified grep), нет test-hook-конвенции → root-cause «empty selector» live-QA падений + вынуждает ловить неоднозначные `<main>`/локализованный текст. Пример живого бага: `.qa/fix-15.spec.ts:72` селектит `[data-testid="stories-rail"]`, которого нет в коде. Ввести конвенцию `data-testid`, начать с обоих shell-`<main>` (`app-shell.tsx:19` + page-mains) и строк списков (bookings/reviews). Даёт стабильные GOOD-локаторы (skill `playwright-qa` §2/§4). Не блокер; durable-фикс dual-`<main>` strict-mode + пустых селекторов.
- **UI a11y/polish** — REDUCED-MOTION-A · TAP-TARGET-AUDIT-A · TAILWIND-COLOR-LINT · STORYBOOK-SETUP (из UI-UX-AUDIT).
- **OVERLAY-PORTAL-REFACTOR** *(spawned by GUARDRAILS-01 2026-07-06)* — 5 genuine content-overlay'ев на hand-rolled `fixed inset-0` (сейчас warn'ят новым ESLint-гейтом, НЕ рефакторились): `city-prompt-overlay.tsx` · `portfolio-editor.tsx` (crop-modal) · `portfolio-strip.tsx` (lightbox) · `reviews-preview.tsx` · `stories-viewer-overlay.tsx` (последний — independent focus-trap, инвариант #27, консолидировать осторожно). Перевести на `<ModalSurface>`/`<Drawer>` (createPortal к body) — устраняет positioning-hazard (transform/filter/overflow ancestor). Работают сейчас; это robustness, не блокер. Каждый закрытый → снять warn или добавить в exempt-list.
- **CRM/booking фичи** — manual tag assignment · late-cancel CRM tracking · online payments + штрафы (`lateCancelAction==="fine"`) · manual finish-booking endpoint · anonymization-vs-deletion на account delete.

---

## 🔵 NICE-TO-HAVE

- **R2-02-D (badge only)** — PREMIUM badge на 1-дневном paid/trial master-профиле оставлен as-is (бейдж отражает активную подписку/триал, не «заслугу»; tenure-неточность «1 мес.» исправлена в FIX-PRE-STAGING). Revisit если нужно product-правило «tenure-gated badge».
- **R2-05-F** — seed `Provider.ratingCount` drift (Анна 47 hardcoded vs 9 actual = 6 master-seed + 3 client-seed reviews). Self-corrects на следующем review add/delete. Чистый фикс требует post-orchestration recalc (после обоих seed'ов) + export private `recalculateTargetRatings` — несоразмерно для 🔵 self-correcting. Noted, не fixed.
- **BC-F1/F2/F3** — factual (не баги): нет multi-year term; нет multi-license/seat; нет proration/refund на смене плана.
- **RULE-12-BOOKING-CONTRACT-OPTIONAL** — booking-flow provider/service/studio ids в URL (нужны funnel'у; encoding = contract change, flagged).
- **CI/structural** — PRE-COMMIT-SCHEMA-MIGRATION-PAIR · FINDMANY-TAKE-CI-CHECK · ENV-TEMPLATES-CI-CHECK · RUNBOOK-COVERAGE-CI · LOGGER-DISCIPLINE-CI-GATE · BUNDLE-SIZE-BASELINE · SW-SUPABASE-RULE-CLEANUP · STORIES-TAKE-CAP.
- **a11y/perf** — STORIES-VIEWER-A11Y-CONSOLIDATE · FRAMER-MOTION-REDUCED-MOTION-SWEEP · BOOKING-PARTIAL-UNIQUE-INDEX-A · BOOKING-STATUS-PROMOTION-CRON · BOOKING-AUDIT-LOG-A.
- **Studio/VK** — studio-admin chat with master (нужен auth-model decision) · studio public-page sidebar entry · VK notifications delivery subsystem (VK Bot API).
- **R2-06-A follow-up (optional)** — surface accept/decline reschedule ALSO в studio calendar/journal action-menu (FIX-R2-06-A сделал inline-on-notification — основная parity-поверхность). Нужен threading `proposedStartAt/actionRequiredBy` в `ScheduleBookingCell`/`StudioBookingRow` DTO; reuse the same `/confirm` + `/decline-reschedule` endpoints. Также: studio calendar `?focus=` reader (для deep-link highlight на календаре).
- Feature-buckets — CRM/Schedule/Catalog/Marketing/Notifications enhancements · mobile app · code-quality · admin dashboard/catalog enhancements.

---

## 🚀 DEPLOY / OPS (operational, не code — но не потерять)

- **env → `мастеррядом.online`** — выставить `VK_REDIRECT_URI`/`VK_ID_REDIRECT_URI` + `APP_PUBLIC_URL` в **prod env** (значения; gitignored `.env`/`.env.local` правит Артём локально). ✅ Tracked stale-домены закрыты *(FIX-PREDEPLOY-GAPS 2026-06-30)*: `.env.production.example` (8 строк) + `.env.example` (1) + `next.config.ts:98` `allowedDevOrigins` → все `мастеррядом.online`, grep tracked-templates+config = CLEAN.
- **VK** — зарегистрировать redirect_uri + live VK round-trip QA с реальными creds.
- **Yandex OAuth** *(FIX-YANDEX-OAUTH)* — зарегистрировать Yandex OAuth app (oauth.yandex.ru, scopes login:info/login:email/login:avatar), выставить
  `YANDEX_OAUTH_CLIENT_ID`/`YANDEX_OAUTH_SECRET`/`YANDEX_OAUTH_REDIRECT_URI` (→ `…/api/auth/yandex/callback`) + `NEXT_PUBLIC_YANDEX_ENABLED=true`, live round-trip QA.
  Код-комплит + start-redirect проверен; callback round-trip — только на staging с реальным app.
- **Telegram** — live round-trip с зарегистрированными creds (login + connect-modal).
- **SMS** — `SMS_PROVIDER_ENABLED=true` + `SMS_PROVIDER_LOGIN`/`PASSWORD` + баланс SMSC + smoke RU/KZ.
- **`YANDEX_GEOCODER_API_KEY`** в QA/prod env — prerequisite для tz-derivation walk на onboarding (FIX-R2-02-A).
- **Seed `BillingPlanPrice` rows** — явные active rows для каждого предлагаемого периода (1/3/6/12mo) в QA/prod (BC-1 consistency; fallback есть, но явная row предпочтительнее).
- **🚩 Legal — real ИНН** — выставить `NEXT_PUBLIC_LEGAL_INN` (реальный ИНН Артёма) в prod env до launch (152-ФЗ / footer requisites). Config wired (EXP-005); unset → footer показывает obvious «[не указан]». Значение — данные Артёма, в код НЕ вшито.
- **🚩 Footer VK** — выставить `NEXT_PUBLIC_VK_COMMUNITY_URL` (реальный VK-паблик МастерРядом) в prod env. Config wired (FIX-PRE-STAGING, FOOTER-VK); unset → footer **опускает** VK-иконку (старый `vk.com/beautyhub` удалён, wrong handle не выдумывался). Значение — реальный handle, в код НЕ вшито.
- **YooKassa** — replay `payment.succeeded`/`refund` + idempotency в live env; verify worker egress к `api.yookassa.ru` (re-fetch authenticity anchor) + sandbox-webhook validation.
- **🚩 Client-IP trusted-proxy (HARDENING-08 — code committed, это deploy-step)** — выставить `TRUSTED_PROXY_HOPS` (+ опц. `TRUSTED_REAL_IP_HEADER`) под реальный prod-edge (nginx / Yandex ALB / Selectel), **затем** flip `YOOKASSA_IP_ALLOWLIST_ENFORCED=true`. Wrong hop-count reject'ит реальные YooKassa-уведомления (worker API re-fetch остаётся authenticity anchor до флипа); default false / log-only безопасен до подтверждения топологии.
- **Trial-conversion backfill (перед launch)** — `npx tsx scripts/backfill-trial-conversion.ts` (dry-run) → `--apply` на staging/prod данных ДО launch (safety net к HARDENING-01 FIX-1; реальных affected rows скорее всего 0 — webhooks были заблокированы finding #2).
- **🚩 Применить миграции на проде** (`prisma migrate deploy`) — недавние `--create-only` *(PRE-DEPLOY-CHECKLIST Layer-1 — все ADD-only, корректно упорядочены)*: `20260619000000_provider_timezone_default_moscow` + `20260624140407_add_booking_package` + `20260626000000_add_push_notifications_enabled` + `20260629201051_add_yandex_link` + `20260702000000_add_provider_social_links` + `20260707221738_renewal_price_optin` (BILLING-RENEWAL-OPTIN-02 — `ADD COLUMN`×4 + `ALTER TYPE ADD VALUE`; enum-add-value безопасен на PG12+/pg16 в транзакции, столбцы не используют новое значение в той же миграции).
- **Snapshot `.qa/snapshots/post-seed.dump`** — **gitignored / local-only** (`.gitignore:91`; НЕ tracked, не попадает в коммиты, не prod-артефакт). Уже регенерирован FIX-EXP-SEED-HYGIENE (несёт `BookingPackage` + push schema) → это актуальный локальный dev-baseline. Регенерировать локально только при изменении схемы/seed (после нового `migrate dev`). *(Снимает прежний пункт «regen snapshot» — он был выполнен.)*
- **Email infra** — SMTP provider + DNS (DKIM/SPF/DMARC).
- **DevOps infra (4 решения)** — Postgres hosting · TLS termination · backups · deploy-rollback policy.

---

## 🧩 PRODUCT DECISIONS — решены Артёмом → actionable code

- ✅ **BC-CAP** *(BILLING-CAP-01 2026-07-08 — fix applied, pending commit → перенести в BACKLOG-DONE при коммите)* — team-limit теперь считает **ACTIVE-only** (`ownerUserId!=null && isPublished`, canonical `STUDIO_ACTIVE_MASTER_WHERE`); pending invites + INVITED/DISABLED больше не занимают место. Enforcement перенесён на **все seat-becomes-ACTIVE точки** (invite-accept `invites/service.ts` + re-activate `masters.service.ts` + legacy attach-by-id route), send-time guards (invite/add) остались как early-guard. Cap резолвится из плана **владельца** студии (`ensureStudioTeamLimit(studioId)` — сигнатура сменена с `(userId, studioId)`; закрыт латентный баг «ADMIN-не-владелец → FREE cap 2 на PRO студии»). Числа: `STUDIO_TEAM_CAP_BY_TIER` (`billing/constants.ts`, single source) — **FREE=2 / PRO=6 / PREMIUM=20 (product-confirmed Артёмом, BILLING-CAP-01-FIX)**; wired в prod-seed (FREE) + admin plan-CREATE backstop (STUDIO без явного cap → tier-default, закрывает «PRO по умолчанию 2» footgun) + test-seed (comment-pinned). Seat-display UI отсутствует → FIX-3 no-op. +14 unit-тестов. FULL gate: typecheck/lint(baseline)/encoding/mojibake/**test 1025** ✅.
- ✅ **R2-05-C-v2** *(BILLING-RENEWAL-OPTIN-02 2026-07-08 — implemented, pending commit → перенести в BACKLOG-DONE при коммите; 🚩 миграция `--create-only`, ждёт `migrate deploy` Артёма)* — opt-in renewal на росте цены. На renewal, если `newEffectivePrice > последнего SUCCEEDED-платежа` (`shouldEnterPriceOptIn`, `price-optin.ts`), cron **НЕ авто-списывает** — вход в 2-дневное opt-in-окно: `status=PAST_DUE + graceUntil=+2д + pendingPriceOptIn + pendingPriceKopeks`, audit `RENEWAL_PRICE_OPTIN_STARTED{old,new}`, notify `BILLING_RENEWAL_PRICE_INCREASE` (opt-in-branch НИКОГДА не зовёт `createRecurringPayment`). Равная/меньшая цена **или нет прошлого SUCCEEDED-платежа** → auto-renew байт-в-байт как раньше. Доступ в окне через HARDENING-03 grace (`PAST_DUE + graceUntil>now`). **Reminders** — scan-подход (restart-robust, `price-optin-cron.ts`): 24h-band `graceUntil∈(now+2h, now+24h]` + 2h-band `(now, now+2h]`, idempotent через `priceOptIn24h/2hSentAt`. **Accept** = существующий `POST /api/billing/checkout` на новую цену → webhook-success re-anchor ACTIVE + чистит opt-in-флаги (рядом с HARDENING-01 trial-clearing). **Lapse** — grace-cron §1 (`PAST_DUE && graceUntil<now → EXPIRED`) лапсит без force-charge + чистит флаги + price-decline копия (`reason:PRICE_OPTIN_DECLINED`). **MRR (HARDENING-10):** opt-in-sub (`PAST_DUE`+период истёк) исключён — согласуется с «grace ≠ revenue»; accept → снова в MRR по новой цене. Кабинет: amber-баннер «Принять новую цену» → checkout (plan+original period). **Схема (approved):** `UserSubscription.pendingPriceOptIn/pendingPriceKopeks/priceOptIn24hSentAt/priceOptIn2hSentAt` + `NotificationType.BILLING_RENEWAL_PRICE_INCREASE` (миграция `20260707221738_renewal_price_optin`, `graceUntil`=дедлайн, no new column). +9 unit-тестов (trigger/deadline/bands). FULL gate: typecheck/lint(baseline)/encoding/mojibake/**test 1034**/prisma validate ✅. 🚩 **enum `ALTER TYPE ADD VALUE` caveat** — на PG12+ (prod pg16) выполняется в транзакции штатно; ADD VALUE и ADD COLUMN независимы (столбцы не используют новое значение в той же миграции) → порядок безопасен.
- **Studio reschedule full parity** → studio-календарь получает «принять предложенное клиентом время» (сейчас только Move/Cancel) — пересекается с R2-06-A.

---

## 🔍 EXPLORATORY (EXP-001…033) — breadth-first whole-product Playwright pass (2026-06-23)

> Источник: `EXPLORATORY-FINDINGS.md` (independent second-layer QA). Сгруппировано тематически; ничего не потеряно
> (включая 🔵/seed/verify-on-prod). Dedup: ни один из EXP-001…022 не пересекается с прошлым backlog. Уточнение —
> известный «studio flat services list» = это **public** профиль; studio **cabinet** services page уже группирует по
> категориям. Известный «₽0 analytics revenue» = R2-03-A (не дублируем; EXP-014 — отдельная pricing-copy грань).
>
> Закрытые EXP-группы (Group 1 discovery/catalog · tz · pricing · content/grammar · chat · a11y/PWA · seed) — перенесены
> в `BACKLOG-DONE.md` (DOCS-LEDGER-01 2026-07-06). Ниже — только открытое.

**Notifications/push UX (FIX-EXP-NOTIFICATIONS ✅ 2026-06-26 — per-channel prefs + push gesture-gating):**
- 🟡 **EXP-029** *(DEFERRED — next feature, post-pre-deploy)* — per-event×channel routing matrix. Остаётся «Скоро»-плейсхолдер (master `PerEventPlaceholder`). НЕ строим в этом проходе (per locked decision). Foundation (per-channel on/off) готов — matrix построится поверх той же модели. VK delivery WIP, SMS не wired.
- 🚀 **DEPLOY/STAGING** — реальный «prompt появляется на gesture» + фактическая push-доставка проверяются на staging (dev: next-pwa отключает SW; push требует prod-build + HTTPS + VAPID). A/B (manual-only vs gesture-prompt) выбирается на staging — оба механизма заложены (manual toggle = default; `syncExistingSubscription` reusable для будущего gesture-trigger).

**Verify-on-prod (dev-config / dev-amplified — проверить на проде, не fix-в-dev):**
- 🔵 **EXP-009** — Telegram login widget «Bot domain invalid» (TG bot domain не сконфижен на localhost). Проверить prod bot-domain. *(пересекается с deploy-ops «Telegram live round-trip».)*
- 🔵 **EXP-031** — `/cabinet/studio/analytics` медленный (dev: 60s on-demand compile → ~5.9s SSR; агрегирует ~15 endpoints без кэша). Load-check на warm prod build.
- 🔵 **PWA SW/push prod-only** — SW не регистрируется в dev (next-pwa off); offline-кэш / install-prompt / push delivery exercise-able только на prod build. Manifest/icons/meta в dev корректны.

---

## КАК ИСПОЛЬЗОВАТЬ

1. Берём задачу → делаем → переносим строку в `BACKLOG-DONE.md` с датой.
2. Новая deferred-фича в обсуждении → добавляем сюда в нужную severity-секцию.
3. Раз в ~4–6 коммитов / 2 недели — sync с кодом (rule 15) + при необходимости новый CONTEXT-REFRESH.

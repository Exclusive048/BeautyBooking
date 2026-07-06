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
> Trim/refresh: **23 июня 2026** (DOCS-CLEANUP). Split active/done: **6 июля 2026** (DOCS-LEDGER-01 — inline-✅ перенесены в ledger).
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
- Следующее: **pre-deploy verification runs** (deploy-ops чеклист на staging/prod) → затем EXP-029 per-event matrix + legacy/@deprecated sweep + commit-grouping для PR.
- **Deploy / ops** (см. секцию ниже) — env-домены, live social-auth creds, SMS creds, geocoder key, DevOps infra,
  применить FIX-R2-02-A миграцию на проде до regen seed-snapshot.
- **Product decisions решены Артёмом** (см. секцию ниже) → теперь это actionable code-задачи.

---

## 🔴 PRE-LAUNCH BLOCKERS (code)

**Из adversarial bug-hunt 2026-07-06 (Phase 1, pre-launch; findings #1/#3/#4 закрыты HARDENING-01, #2 — HARDENING-02):**
- **#5 Grace-period dead code** — `billing/get-current-plan.ts` (тот же паттерн в `analytics/domain/guards.ts`): PAST_DUE grace-ветка фактически не срабатывает; оплаченный grace-период не даёт доступ, который должен давать.
- **#6 Studio move: stale `endAtUtc` при CHANGE_SERVICE** — `studio/bookings.service.ts`: при переносе со сменой услуги конец брони не пересчитывается под новую длительность → неверная длительность/конфликты.
- **#7 `acceptNewClients` OR-undefined bypass** — `bookings/booking-core.ts`: условие с `OR: undefined` пропускает новых клиентов к провайдеру, закрывшему запись для новых.
- **#8 «Свободно сегодня» игнорирует in-progress/cross-midnight брони** — `schedule/available-today.ts` + `public-profile-view.service.ts`: бейдж показывается, когда реальных окон нет.
- **#9 Telegram login CSRF** — нет state/nonce в Telegram-login flow (сейчас замаскировано kill-switch'ем `NEXT_PUBLIC_TELEGRAM_ENABLED=false`; починить ДО любого re-enable).
- **#10 Studio timezone validation self-brick** — `api/studios/[id]/route.ts`: студия может сохранить невалидную tz и «окирпичить» свой профиль (все tz-вычисления падают).
- **#11 Admin refund guards** — `admin/billing/refund/route.ts`: нет проверки статуса платежа / cap на сумму / идемпотентности → двойной refund или refund несостоявшегося платежа возможны.

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

---

## 🟠 HIGH PRIORITY

**Из adversarial bug-hunt 2026-07-06:**
- **#12 Non-atomic queue processing stamp → silent job loss** — `queue/queue.ts` ~204: LPOP/пометка processing не атомарны; краш между операциями теряет job без следа.
- **#17 X-Forwarded-For trusted-proxy decision** — решить вместе с deploy-конфигом (nginx/ALB): какой hop доверенный; **также гейтит webhook IP-allowlist — cross-reference HARDENING-02**.
- **Run trial-conversion backfill before launch** — выполнить `npx tsx scripts/backfill-trial-conversion.ts` (dry-run) → `--apply` на staging/production данных ДО launch (safety net к HARDENING-01 FIX-1; реальных affected rows скорее всего 0, т.к. webhooks были заблокированы finding #2).

- **OBSERVABILITY-SENTRY-A** — нет error-aggregation/APM; production debugging = log-scraping. Ставить **после** PII-LOGGING-FIX-A
  (Sentry с `sendDefaultPii:false` + `beforeSend` PII-scrubber). ~half-day.
- **🚨 TZ-DISPLAY-SYSTEM-MESSAGE** *(NEW finding, SKILL-TZ-01 2026-07-06 — НЕ исправлено)* — `src/features/chat/chat-window/system-message.tsx:85-86` рендерит **время записи** `card.startAtUtc` (иконка календаря + длительность + адрес = время встречи, не таймстемп сообщения) в **`viewerTimezone`, без метки**. Тот же класс, что исходный баг wizard'а, но **двусторонняя** поверхность (клиент И мастер видят карточку в чате) → cross-tz клиент читает не тот час. `ThreadBookingCardDto` не несёт `provider.timezone` — нужен plumbing tz в DTO + `formatLocalHm`/`UI_FMT.*({timeZone: salonTz})` + `formatZoneLabel`. **Кандидат на промоушен выше TZ-DISPLAY-DEFERRED-3** (стейкс выше — bilateral). Skill: `.claude/skills/timezone-correctness/SKILL.md` §7.

---

## 🟡 MEDIUM PRIORITY

**Из adversarial bug-hunt 2026-07-06:**
- **#13 Telegram reminder в raw UTC** — `bookingTelegramService.ts`: напоминание рендерит время без salon-tz конверсии (нарушает `formatLocalHm` правило §13). Замаскировано Telegram kill-switch'ем; починить до re-enable.
- **#14 MRR snapshot считает trials/lapsed grants** — `billing/mrr-snapshot.ts`: `isTrial=true` и admin-granted rows завышают MRR.
- **#15 Stuck-job recovery без lease/heartbeat** — `queue/queue.ts` ~349: recovery по таймауту может украсть ещё-живой job у медленного воркера (double-processing).
- **#16 `clampVisibleSlotsHorizon` UTC → provider-tz** — `bookings/policy-enforcement.ts`: горизонт клампится по UTC-дате, а не по дате провайдера (±1 день на границе суток).

**R2 (Round 2) residual:**
- 🟡 **R2-05-G** *(DEFERRED — next-release, Артём 2026-07-01)* — нет фидбэка репортёру при модерации отзыва; нет UI восстановления soft-deleted отзыва (только manual SQL). **Rationale:** admin-moderation surface, non-blocking для MVP launch — Артём решил not-now (2026-07-01).
- 🟡 **R2-05-A2** *(DEFERRED — next-release, Артём 2026-07-01)* — category reject reason только в логах (нет колонки); владельцы portfolio-item не уведомляются при delist. **Rationale:** admin-moderation surface, non-blocking для MVP launch — Артём решил not-now (2026-07-01).
- **R2-05-J** — `BillingPlanPrice.isActive` без admin UI — **by-design** (деактивация выражается удалением period-row при цене ≤0; resolver monthly-fallback handles; create hardcodes `isActive:true`; только direct-DB ставит `false`). «renewal может залогировать CRITICAL» — **неточно**: `renew/run/route.ts` на missing price отдаёт `null` gracefully → пишет `RENEWAL_FAILED·MISSING_PRICE` audit + `PAST_DUE` + continue, **без** `logError` → не достигает `alertCritical`. Низкий приоритет; не дефект-путь.

**Прочее:**
- **CATALOG-AVAILABLE-TODAY-PIPELINE** (spawned by EXP-030) — `Provider.availableToday` — snapshot, который **никто никогда не вычисляет** (все write-сайты ставят `false`). **Дизайн (AUDIT 2026-07-02):** cron-precompute boolean `availableToday`, ~30-min sweep. Фильтр `?availableToday=true` — это Prisma `WHERE` на колонке → нужен **stored** boolean (on-read не может paginate at DB). Scale = 43 published provider (дёшево). Engine-safe: читать через pure `getDayPlanFromContext`+`buildSlotsForDay`, НЕ `listAvailabilitySlotsPaginated` (пишет slots-cache). Cron-инфра уже есть (worker `setInterval` `startPeriodicJobs`). Фазы: **1** pure helper+tests · **2** recompute sweep + column write + x-cron trigger + one-shot script · **3** worker `setInterval` + live-verify filter/chip/badge · 4 (опц.) precise invalidation.
  - ✅ **Phase 1** *(2026-07-02 — pure helper + tests; ничего не wired, engine untouched)* — `src/lib/schedule/available-today.ts` (server-only, rule 13): `hasFreeSlotToday(providerId, now?)` (MASTER = single-probe; STUDIO = OR над ACTIVE-мастерами `ownerUserId!=null && isPublished`, short-circuit) + pure `anyBookableSlot` / `anyProviderFreeToday(providers, now, probe)` (injected probe для тестов) + `providerHasFreeSlotToday`. Salon-tz 'today' (`toLocalDateKey(now, tz)`), service-agnostic 30-min probe, mirrors `computeAvailabilityHint`. **🔴 Engine-safety:** git-diff = **0 mutation** slot-gen (только 2 новых файла); helper НЕ зовёт `listAvailabilitySlotsPaginated`/`setCachedSlotsForDate` (grep — только pure path + benign DayPlan-memo); TZ=UTC≡Europe/Moscow slot-gen SHA **byte-identical** (`COMBINED=8954c72d…843c42`, harness `.qa/diagnostics/available-today/`). Tests +13 (13/864): counting cutoff·+5 salon-tz bucketing·earliest-bookable·day-off·studio-OR 0-free/1+-free/short-circuit·service-agnostic. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. **Не wired** — catalog всё ещё serves static `false`.
  - ✅ **Phase 2** *(2026-07-02 — recompute sweep + первый column write + protected trigger + verify script; NO migration, NO setInterval)* — `src/lib/schedule/recompute-available-today.ts`: `recomputeAvailableToday(now?)` цикл по всем published providers (MASTER → `providerHasFreeSlotToday`; STUDIO → `hasFreeSlotToday` OR-branch). **Guardrails:** minimal-write (compare vs stored → batched `updateMany` только флипы), resilient (per-provider try/catch → `logError`+continue, errored keeps prev value, не abort), summary `{total,changed,errored,erroredIds}`. **Endpoint** `POST /api/catalog/available-today/run` (rule-12 internal, mirror MRR): x-cron-token (header/`?token=`) fail-closed (`!expected||token!==expected → 403`, unset-secret refuses); valid → inline sweep → summary JSON. **Env** `AVAILABILITY_CRON_TOKEN` (env.ts `.optional()` + оба `.env.example`/`.env.production.example` с placeholder+comment). **Script** `scripts/recompute-available-today.mts` (dynamic-import .mts; before/after print). **🔴 Engine-safety re-confirm:** loop-of-pure-read + column-write only; git-diff slot-gen files = **0 mutation** (только новые sweep/endpoint/script + env/templates). **Live (Docker):** baseline 0/43 free → sweep `{total:43,changed:36,errored:0}` (Vision +5 studio + Anna free — real availability; 6 generic studios busy); idempotent re-run `changed:0`; reactive (day-off override для Anna today + FLUSHALL → `changed:1` Anna→busy); endpoint no-token/wrong-token→403, valid→200+summary. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. Captures `.qa/diagnostics/available-today-phase-2/`. Baseline restored (0/43, override gone). **Не auto-scheduled** — Phase 3 добавит worker `setInterval` + live-verify filter/chip/badge с live-значениями.
  - ✅ **Phase 3** *(2026-07-02 — schedule + user-visible; **🎉 MVP complete**)* — sweep wired в worker `startPeriodicJobs` (`src/worker.ts`): startup run (fire-and-guard, non-blocking boot) + 30-min `setInterval`, тот же safe-wrapper что hot-slots/review-prompts (throw → `logError`, не crash worker/не block others). **Live (Docker):** worker.log — startup `{changed:27}` + 2 interval-ticks `{12:31 changed:10, 13:01 changed:0}` (setInterval **FIRES**, resilient errored:0). **Playwright both themes:** filter `?availableToday=true` → каждый item availableToday===true, **zero busy-leak** (DB WHERE работает — был всегда-пуст); card-chip «Сегодня свободно» present на free (5/5, light+dark)/absent на busy (Сирень/Олива без чипа); studio-badge present на free Vision / absent на busy Аура. Midnight-rollover self-heal: sweep recomputes `todayKey=toLocalDateKey(now,tz)` каждый run (noon vs morning-`now` sweep дали разный free-set для тех же providers) — ≤30-min, +5 pinned Phase-1 test. **🔴 Engine-safety:** git-diff slot-gen = 0 mutation (phase = `worker.ts` only); SHA byte-identical. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. Captures `.qa/diagnostics/available-today-phase-3/`. Baseline restored (0/43). *(Note: `/u/[username]` studio profile 500'ил на baseline т.к. `getProviderProfile` селектит `socialVk`/`socialInstagram` — FEAT-код в дереве, но baseline snapshot без колонок (FEAT-миграция `--create-only`, не применена). Временно добавил 2 nullable-колонки локально для badge-теста; restore их убрал. НЕ Phase-3 дефект; catalog card/filter (другой query) не затронуты. Cross-task: применится когда FEAT-миграция задеплоится.)*
  - ⏳ **Phase 4 (опционально/deferred)** — precise per-mutation invalidation (mark-dirty на `invalidateSlotsForBooking`/`invalidateSlotsForMaster` → targeted recompute) для <30-min freshness. Не нужно для MVP (30-min staleness accepted).
- **OTP-EMAIL-LOGIN-RACE** — 6-й P2002 site (OTP email login `create`), latent low-probability. Fix: re-read recovery.
- **PRISMA-INCLUDE-WHERE-CI-CHECK** — AST-гейт против nested-include без `where` (N+1 over-fetch class).
- **SMS-MONITORING-A** — admin balance-widget + daily low-balance cron (после live SMSC).
- **ENV-CONSOLIDATION** *(ENV-FILE-AUDIT + ENV-CONSOLIDATION 2026-06-30)* — split by ownership. ✅ **Tracked side (agent):** `.env.production.example` = единый canonical полный prod-template (cross-check vs env.ts 72 ключа — все required + launch-critical optionals покрыты; gaps только explainable: `MEDIA_LOCAL_*` = dev local-storage, `VK_ID_*` = alias-documented, `AI_PROVIDER` = vestigial-commented); `.env.example` = dev-onboarding (consistent, минус docker-only `POSTGRES_*`/`REDIS_PASSWORD`); VK-alias + AI_PROVIDER notes добавлены в оба; `.gitignore` verified (`.env`/`.env.local`/`.env.production` IGNORED, оба `.example` tracked). ⏳ **Local side (Артём, gitignored — agent не трогает):** в `.env.local` скопировать `WORKER_SECRET`+`AI_FEATURES_ENABLED` из `.env`; удалить 4 dead var (`SUPADATABASE_URL`,`SUPADIRECT_URL`,`OTP_EXPIRATION_TIME`,`DATABASE_URL_V6`); fix 2 stale `beautyhub.art`→`мастеррядом.online`; `Remove-Item .env` → один local-файл. Step-list в отчёте ENV-CONSOLIDATION. *(Снимает прежний ENV-DATABASE-CLEANUP «3 orphan vars».)*
- **OPENAPI-COVERAGE-INCREMENTAL** — гнать allowlist 216→0 по кластерам.
- **VISUAL-SEARCH-YANDEX-MIGRATION** (post-launch) — vision+embeddings на Yandex + schema `vector(1536)→vector(256)`.
- **AUTH-PROVIDER-ABSTRACTION** *(post-launch refactor, spawned by AUTH-DISCOVERY 2026-06-29)* — сейчас каждый OAuth-провайдер
  bespoke (VK = чистый `src/lib/vk/*`; Telegram размазан по `src/lib/auth/*`; login-grid = hardcoded JSX). После закрытия legal-блокеров
  (Yandex · VK; RF-email cancelled) — унифицировать в provider-abstraction + registry-driven login-grid, выведенный из рабочих провайдеров.
  **Не рефакторить под fine-pressure** — отложено на после launch.
- **TZ-DISPLAY-DEFERRED-3** *(из FIX-STUDIO-CALENDAR-SALON-TZ 2026-07-03 — всё ещё viewer-tz, нужен per-surface provider-tz plumbing; ранее жил ТОЛЬКО в BACKLOG-DONE, поднят в active SKILL-TZ-01 2026-07-06 т.к. deferred ≠ done)* — 3 поверхности показывают **время записи/слота** в браузерной tz зрителя, а не salon-tz: (1) master reschedule-modal `reschedule-modal.tsx:247,273`; (2) `/book` book-client «ближайшие слоты» `src/app/book/book-client.tsx:137`; (3) CRM client-card-drawer visit-history `client-card-drawer.tsx:341`. Все `viewerTimeZone` verified. Skill §7.
- **TZ-DISPLAY-MINOR-2** *(NEW findings, SKILL-TZ-01 2026-07-06)* — (a) 🟡 studio `create-booking-dialog.tsx:46` (`formatTimeLocal`) рендерит кликнутый слот `startAtUtc` через `toLocaleString` **без `timeZone`** → расходится с salon-tz сеткой для cross-tz админа; (b) 🔵 **dormant** catalog card «Ближайшее» — `slot-precision-format.ts` через `catalog-card.tsx:151` передаёт `viewerTimeZone`; не срабатывает т.к. `catalog.service.ts:748` хардкодит `nextSlot:null` (латентно — вскроется при включении availability-pipeline).
- **TZ-DISPLAY-TELEGRAM-UTC** *(= backlog #13 выше; кросс-ссылка)* — `bookingTelegramService.ts:55-62` (`formatDateTimeUtc`) время записи в **сыром UTC** без метки (in-app корректен, Telegram-путь нет). Замаскировано TG kill-switch'ем; починить до re-enable. Skill §7.
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
- **YooKassa** — replay `payment.succeeded`/`refund` + idempotency в live env.
- **🚩 Применить миграции на проде** (`prisma migrate deploy`) — **4** недавние *(PRE-DEPLOY-CHECKLIST Layer-1 — все ADD-only, корректно упорядочены, applied last в 22-migration history)*: `20260619000000_provider_timezone_default_moscow` + `20260624140407_add_booking_package` + `20260626000000_add_push_notifications_enabled` + `20260629201051_add_yandex_link` (последняя — Yandex auth, добавлена после того как этот пункт писался).
- **Snapshot `.qa/snapshots/post-seed.dump`** — **gitignored / local-only** (`.gitignore:91`; НЕ tracked, не попадает в коммиты, не prod-артефакт). Уже регенерирован FIX-EXP-SEED-HYGIENE (несёт `BookingPackage` + push schema) → это актуальный локальный dev-baseline. Регенерировать локально только при изменении схемы/seed (после нового `migrate dev`). *(Снимает прежний пункт «regen snapshot» — он был выполнен.)*
- **Email infra** — SMTP provider + DNS (DKIM/SPF/DMARC).
- **DevOps infra (4 решения)** — Postgres hosting · TLS termination · backups · deploy-rollback policy.

---

## 🧩 PRODUCT DECISIONS — решены Артёмом → actionable code

- **BC-CAP** → считать **ACTIVE-only** (сейчас `ensureStudioTeamLimit` считает INVITED/DISABLED+pending invites тоже) **+** задать числа cap для PRO/PREMIUM (FREE=2 есть).
- **R2-05-C-v2** (opt-in renewal на росте цены) → при повышении цены — renewal **opt-in**: 2-дневный grace + reminders на 24h/2h.
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

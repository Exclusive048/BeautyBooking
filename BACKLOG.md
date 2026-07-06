# BACKLOG.md — Активные задачи МастерРядом

> Только **открытые** задачи. Завершённое — в [`BACKLOG-DONE.md`](BACKLOG-DONE.md). Детали находок — в
> [`QA-FINDINGS.md`](QA-FINDINGS.md); changelog — в [`MASTERRYADOM_AI_CONTEXT.md`](MASTERRYADOM_AI_CONTEXT.md) §15.
> Приоритеты: 🔴 pre-launch blocker · 🟠 high (желательно до launch) · 🟡 medium (после launch) · 🔵 nice-to-have.
> Когда задача делается — переносим её в `BACKLOG-DONE.md` с датой. Новую deferred-задачу — добавляем сюда.
>
> Trim/refresh: **23 июня 2026** (DOCS-CLEANUP). Состояние кода: Round 1 + Round 2 self-QA пройдены; booking /
> billing / catalog / timezone / auth-CSP закрыты. Остаток до launch — преимущественно **operational** (deploy/ops
> ниже) + R2-06 notification-слой + product-decision follow-ups.

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
- ✅ **FIX-TELEGRAM-COPY-SWEEP** *(2026-06-29 — см. BACKLOG-DONE.md)* — все prose/маркетинг/FAQ/help/support упоминания Telegram убраны
  (about · become-master · how-it-works · how-to-book · gift-cards · faq · help · client-faq · faq-data · support contact-option gated) + completion-meter
  `/6`→`/5` (tgLinked исключён когда off, 100% достижим). Grep-proof: **0** user-facing Telegram copy. Legal-docs НЕ тронуты (→ ниже).
- ✅ **FIX-TELEGRAM-LEGAL-REVIEW** *(closed as content edit 2026-06-29 в FIX-YANDEX-OAUTH — pre-launch, нет binding contract)* — Telegram удалён из
  юр-документов как copy: `privacy-content.tsx` (§6.2 Telegram-процессор → «ООО «Яндекс» (Яндекс ID)», §2.5 Telegram→Yandex `<li>`, channel/avatar/deletion
  lists de-Telegram'd, numbering 6.1–6.8 + cross-ref intact) + `terms-content.tsx` («вход через Telegram» → «вход через Яндекс»). **Process (не код):**
  финальный lawyer-pass перед public launch всё ещё рекомендуется.

---

## 🟡 MEDIUM PRIORITY

**Из adversarial bug-hunt 2026-07-06:**
- **#13 Telegram reminder в raw UTC** — `bookingTelegramService.ts`: напоминание рендерит время без salon-tz конверсии (нарушает `formatLocalHm` правило §13). Замаскировано Telegram kill-switch'ем; починить до re-enable.
- **#14 MRR snapshot считает trials/lapsed grants** — `billing/mrr-snapshot.ts`: `isTrial=true` и admin-granted rows завышают MRR.
- **#15 Stuck-job recovery без lease/heartbeat** — `queue/queue.ts` ~349: recovery по таймауту может украсть ещё-живой job у медленного воркера (double-processing).
- **#16 `clampVisibleSlotsHorizon` UTC → provider-tz** — `bookings/policy-enforcement.ts`: горизонт клампится по UTC-дате, а не по дате провайдера (±1 день на границе суток).

**Legacy-retire migrations (spawned by LEGACY-AUDIT 2026-07-01 — TYPE-1 dead уже удалён; ниже — TYPE-2/3 миграции, по одной на большой прогон):**
- ✅ **LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE** *(2026-07-02 — см. BACKLOG-DONE.md; было `LEGACY-STUDIO-SETTINGS-SUBROUTES`)* — **port-and-retire** вместо редизайна: profile+portfolio-редактирование (реально жившее только на orphan-sub-routes) перенесено в NEW `studio-cabinet` settings pattern (2 новых nav-раздела «Профиль и медиа» + «Портфолио», reuse `StudioProfileHero`/`StudioProfileForm`/`PortfolioEditor`), live-verified (PATCH 200 + round-trip), затем удалён весь **2188-LOC** кластер (`features/studio/` целиком) + 3 orphan-роута. **🔴 Closed launch-gap:** студия не могла задать logo/banner/address/contacts/portfolio с reachable-страницы. **🐛 Bonus:** нашёлся + исправлен systemic `studioId→providerId` баг (GeneralForm + ArchiveToggle PATCH'или studioId → 404). Engine untouched; 817 tests + build green.
- ✅ **LEGACY-FOCAL-IMAGE-CLEANUP** *(2026-07-01 — см. BACKLOG-DONE.md)* — `focal-image.tsx`→`resilient-image.tsx`, `FocalImage`→`ResilientImage` (56 importers), убраны мёртвые пропы `focalX`/`focalY` (0 callers их передавали) + `@deprecated`. **🎉 последний `@deprecated` в кодбазе очищен (grep → 0).** Behaviorally-neutral (resilience: host-guard/onError/crop identical). typecheck+test 817+build green (build = proof все 56 import резолвятся); live catalog + studio profile (both themes) — images render, 0 broken.
- ✅ **LEGACY-MONEY-UTILS-RETIRE** *(2026-07-01 — см. BACKLOG-DONE.md)* — `moneyRUB`+`moneyRUBPlain` (non-÷100) удалены из `format.ts`; 2 сайта мигрированы на ÷100-boundary. **🐛 SLOT-DISCOUNT-100X (real bug fixed):** `slot-bubbles-row` FIXED-discount label показывал `moneyRUB(discountValue)` (копейки без ÷100) → **100× too large** ("-3 000 ₽" вместо "-30 ₽"); теперь `UI_FMT.priceLabel` (÷100, matches applied discount). PERCENT-ветка не тронута. OLD studio-services-page basePrice → `moneyRUBPlainFromKopeks` (÷100). R2-03 Δ=0 не regressed (display-only, revenue path untouched). build+test 817 green.
- ✅ **LEGACY-AUDIT** *(2026-07-01 — см. BACKLOG-DONE.md)* — полный категоризированный inventory всего legacy + удалено **11 proven-dead файлов / 2344 LOC** (TYPE-1). TYPE-2/3 → миграции выше. stories.service = НЕ legacy (это v2). focal-image = resilient wrapper (не shell). 817 tests + build green.
- ✅ **FEAT-PROVIDER-SOCIALS** *(2026-07-02 — code-complete; **миграция --create-only, ждёт `migrate deploy` Артёма**; live-verified)* — free-text **VK + Instagram** community-links (НЕ OAuth) для **обеих** ролей (studio + master = `Provider`). **Полная фича:** миграция → persist → cabinet-inputs → public-icons. **Схема:** `Provider.socialVk` + `socialInstagram` (nullable TEXT); миграция `20260702000000_add_provider_social_links` создана **--create-only** (additive ADD COLUMN, применяется на проде `migrate deploy` — rule 16). **🔴 SECURITY (крит):** shared pure `src/lib/providers/social-links.ts` — извлекает validated handle, **реконструирует URL из hardcoded `https://<host>/` base** → host+scheme залочены (vk.com/instagram.com only; `javascript:`/`data:`/foreign-host невозможны). Тот же нормализатор на server (persist boundary, throws 400 `INVALID_SOCIAL_LINK`) + client (live preview) + public render (defense-in-depth re-validate). Icons: `rel="noopener noreferrer" target="_blank"`. **Persist:** studio (`PATCH /api/studios/[id]` + `updateStudioProviderProfile`) + master (`PATCH /api/master/profile` + `updateMasterProfile`), оба через `ProviderProfileDto`. **Inputs:** URL-или-@handle, live preview (`SocialLinkPreview`); studio = explicit-save форма, master = inline-edit autosave (`SocialEditableRow` + новая «Соцсети» секция). **Public icons:** shared `ProviderSocialLinks` (master hero-block + studio details-section), shown-when-set. **No Telegram** (killswitch). **Collision:** master public card показывает free-text community VK (OAuth-vk живёт только read-only в cabinet contacts — не дублируется). **Validation:** typecheck/lint(baseline)/encoding/mojibake/ui-text/**test 851** (+34 exhaustive security tests)/build/prisma validate ✅. **Live (Playwright, миграция applied на local test DB, потом snapshot restore):** studio Виктория VK-как-URL + IG-как-username → PATCH 200 → reload persist (нормализованы); master Anna VK-username + IG-URL → autosave → reload persist; public icons обе роли (correct hrefs + rel + target + aria); absent-when-unset (Полина 0 icons); dark theme; **security — 4 hostile inputs (`javascript:`/`evil.com`/`data:`/HTML-inject) → 400, stored не тронут**. Captures `.qa/diagnostics/provider-socials/`. Резолвит прежний 🔴 `STUDIO-SOCIAL-COLUMNS-MIGRATION`. См. BACKLOG-DONE.md.
- 🟡 **FIX-STUDIO-SOCIAL-PERSIST** *(2026-07-02 — предшественник, см. BACKLOG-DONE.md)* — удалён phantom Telegram-input (FZ-199 killswitch); VK+Instagram persist был заблокирован на schema-add → **закрыт FEAT-PROVIDER-SOCIALS выше** (миграция + full wire). typecheck/test 817/build ✅.
- ✅ **STUDIO-SOCIAL-COLUMNS-MIGRATION** *(2026-07-02 — RESOLVED by FEAT-PROVIDER-SOCIALS)* — schema-add для VK+Instagram persist. Реализовано: `Provider.socialVk`+`socialInstagram` (--create-only migration, ждёт `migrate deploy` Артёма) + full persist/UI wire для studio + master.


**R2 (Round 2) residual:**
- ✅ **R2-04-C** *(FIX-R2-04-C 2026-07-01)* — public booking service list сгруппирован по attached category (`globalCategory.name`, order by `orderIndex`, uncategorized → «Другие услуги»). Presentational — same bookability/selection/submit. Реализовано в studio booking widget + master public profile (shared chokepoint DTO + pure helper). Live-verified (Vision 35 svc/11 cats, Галина 7/3; both themes + mobile/desktop; rule-12 clean; selection advances). См. BACKLOG-DONE.md.
- ✅ **R2-04-C filter-chips** *(WAVE-2-SMALL 2026-07-01)* — category filter-chips над R2-04-C секциями в studio booking widget (`service-step.tsx`). «Всё» (`catAll`) + чип на каждую категорию (labels, не ids — rule 12); reuse `groupServicesByCategory` (без re-derive). Presentational filtering; booking unchanged. Chips видны только при >1 категории; guard от search-trap (активная категория выпала из результатов → fallback на «Всё»). Mobile: horizontal-scroll. См. BACKLOG-DONE.md.
- 🟡 **R2-05-G** *(DEFERRED — next-release, Артём 2026-07-01)* — нет фидбэка репортёру при модерации отзыва; нет UI восстановления soft-deleted отзыва (только manual SQL). **Rationale:** admin-moderation surface, non-blocking для MVP launch — Артём решил not-now (2026-07-01).
- 🟡 **R2-05-A2** *(DEFERRED — next-release, Артём 2026-07-01)* — category reject reason только в логах (нет колонки); владельцы portfolio-item не уведомляются при delist. **Rationale:** admin-moderation surface, non-blocking для MVP launch — Артём решил not-now (2026-07-01).
- **R2-05-J** — `BillingPlanPrice.isActive` без admin UI — **by-design** (деактивация выражается удалением period-row при цене ≤0; resolver monthly-fallback handles; create hardcodes `isActive:true`; только direct-DB ставит `false`). «renewal может залогировать CRITICAL» — **неточно**: `renew/run/route.ts` на missing price отдаёт `null` gracefully → пишет `RENEWAL_FAILED·MISSING_PRICE` audit + `PAST_DUE` + continue, **без** `logError` → не достигает `alertCritical`. Низкий приоритет; не дефект-путь.
- ✅ **R2-03-A** *(FIX-EXP-SEED-HYGIENE 2026-06-26)* — closed: priced `BookingServiceItem` добавлены в `seed-showcase-master.ts` (priceSnapshot=service.price); analytics revenue Анны 51 000 ₽ / 14 (был ₽0), reconciles с dashboard (Δ=0). R2-03-B (latent fallback) остаётся.
- ✅ **R2-03-B** *(WAVE-2-SMALL 2026-07-01)* — analytics revenue теперь имеет `Service.price` fallback, зеркалящий dashboard `sumBookingPrice` (`day.service.ts`). Реализовано в shared `loadBookingRevenueMap` (`revenue.ts`) → используется timeline + by-master + forecast; item present → `priceSnapshot`, item absent → `service.price` (never both). `getRevenueByService` остаётся item-based by-design (breakdown по service-item title не может атрибутировать item-less брони). No-op для item-ful данных (snap>0 → snap) → R2-03 Δ=0 reconciliation сохраняется, analytics == dashboard. См. BACKLOG-DONE.md.

**Прочее:**
- **CATALOG-AVAILABLE-TODAY-PIPELINE** (spawned by EXP-030) — `Provider.availableToday` — snapshot, который **никто никогда не вычисляет** (все write-сайты ставят `false`). **Дизайн (AUDIT 2026-07-02):** cron-precompute boolean `availableToday`, ~30-min sweep. Фильтр `?availableToday=true` — это Prisma `WHERE` на колонке → нужен **stored** boolean (on-read не может paginate at DB). Scale = 43 published provider (дёшево). Engine-safe: читать через pure `getDayPlanFromContext`+`buildSlotsForDay`, НЕ `listAvailabilitySlotsPaginated` (пишет slots-cache). Cron-инфра уже есть (worker `setInterval` `startPeriodicJobs`). Фазы: **1** pure helper+tests · **2** recompute sweep + column write + x-cron trigger + one-shot script · **3** worker `setInterval` + live-verify filter/chip/badge · 4 (опц.) precise invalidation.
  - ✅ **Phase 1** *(2026-07-02 — pure helper + tests; ничего не wired, engine untouched)* — `src/lib/schedule/available-today.ts` (server-only, rule 13): `hasFreeSlotToday(providerId, now?)` (MASTER = single-probe; STUDIO = OR над ACTIVE-мастерами `ownerUserId!=null && isPublished`, short-circuit) + pure `anyBookableSlot` / `anyProviderFreeToday(providers, now, probe)` (injected probe для тестов) + `providerHasFreeSlotToday`. Salon-tz 'today' (`toLocalDateKey(now, tz)`), service-agnostic 30-min probe, mirrors `computeAvailabilityHint`. **🔴 Engine-safety:** git-diff = **0 mutation** slot-gen (только 2 новых файла); helper НЕ зовёт `listAvailabilitySlotsPaginated`/`setCachedSlotsForDate` (grep — только pure path + benign DayPlan-memo); TZ=UTC≡Europe/Moscow slot-gen SHA **byte-identical** (`COMBINED=8954c72d…843c42`, harness `.qa/diagnostics/available-today/`). Tests +13 (13/864): counting cutoff·+5 salon-tz bucketing·earliest-bookable·day-off·studio-OR 0-free/1+-free/short-circuit·service-agnostic. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. **Не wired** — catalog всё ещё serves static `false`.
  - ✅ **Phase 2** *(2026-07-02 — recompute sweep + первый column write + protected trigger + verify script; NO migration, NO setInterval)* — `src/lib/schedule/recompute-available-today.ts`: `recomputeAvailableToday(now?)` цикл по всем published providers (MASTER → `providerHasFreeSlotToday`; STUDIO → `hasFreeSlotToday` OR-branch). **Guardrails:** minimal-write (compare vs stored → batched `updateMany` только флипы), resilient (per-provider try/catch → `logError`+continue, errored keeps prev value, не abort), summary `{total,changed,errored,erroredIds}`. **Endpoint** `POST /api/catalog/available-today/run` (rule-12 internal, mirror MRR): x-cron-token (header/`?token=`) fail-closed (`!expected||token!==expected → 403`, unset-secret refuses); valid → inline sweep → summary JSON. **Env** `AVAILABILITY_CRON_TOKEN` (env.ts `.optional()` + оба `.env.example`/`.env.production.example` с placeholder+comment). **Script** `scripts/recompute-available-today.mts` (dynamic-import .mts; before/after print). **🔴 Engine-safety re-confirm:** loop-of-pure-read + column-write only; git-diff slot-gen files = **0 mutation** (только новые sweep/endpoint/script + env/templates). **Live (Docker):** baseline 0/43 free → sweep `{total:43,changed:36,errored:0}` (Vision +5 studio + Anna free — real availability; 6 generic studios busy); idempotent re-run `changed:0`; reactive (day-off override для Anna today + FLUSHALL → `changed:1` Anna→busy); endpoint no-token/wrong-token→403, valid→200+summary. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. Captures `.qa/diagnostics/available-today-phase-2/`. Baseline restored (0/43, override gone). **Не auto-scheduled** — Phase 3 добавит worker `setInterval` + live-verify filter/chip/badge с live-значениями.
  - ✅ **Phase 3** *(2026-07-02 — schedule + user-visible; **🎉 MVP complete**)* — sweep wired в worker `startPeriodicJobs` (`src/worker.ts`): startup run (fire-and-guard, non-blocking boot) + 30-min `setInterval`, тот же safe-wrapper что hot-slots/review-prompts (throw → `logError`, не crash worker/не block others). **Live (Docker):** worker.log — startup `{changed:27}` + 2 interval-ticks `{12:31 changed:10, 13:01 changed:0}` (setInterval **FIRES**, resilient errored:0). **Playwright both themes:** filter `?availableToday=true` → каждый item availableToday===true, **zero busy-leak** (DB WHERE работает — был всегда-пуст); card-chip «Сегодня свободно» present на free (5/5, light+dark)/absent на busy (Сирень/Олива без чипа); studio-badge present на free Vision / absent на busy Аура. Midnight-rollover self-heal: sweep recomputes `todayKey=toLocalDateKey(now,tz)` каждый run (noon vs morning-`now` sweep дали разный free-set для тех же providers) — ≤30-min, +5 pinned Phase-1 test. **🔴 Engine-safety:** git-diff slot-gen = 0 mutation (phase = `worker.ts` only); SHA byte-identical. typecheck/lint(baseline)/enc/mojibake/test 864/build ✅. Captures `.qa/diagnostics/available-today-phase-3/`. Baseline restored (0/43). *(Note: `/u/[username]` studio profile 500'ил на baseline т.к. `getProviderProfile` селектит `socialVk`/`socialInstagram` — FEAT-код в дереве, но baseline snapshot без колонок (FEAT-миграция `--create-only`, не применена). Временно добавил 2 nullable-колонки локально для badge-теста; restore их убрал. НЕ Phase-3 дефект; catalog card/filter (другой query) не затронуты. Cross-task: применится когда FEAT-миграция задеплоится.)*
  - ⏳ **Phase 4 (опционально/deferred)** — precise per-mutation invalidation (mark-dirty на `invalidateSlotsForBooking`/`invalidateSlotsForMaster` → targeted recompute) для <30-min freshness. Не нужно для MVP (30-min staleness accepted).
- **OTP-EMAIL-LOGIN-RACE** — 6-й P2002 site (OTP email login `create`), latent low-probability. Fix: re-read recovery.
- ✅ **MONEY-BRAND-TYPE-A** *(WAVE 2026-07-01)* — branded `Kopeks` type (`src/lib/money/kopeks.ts`, client-safe) threaded через money chokepoints. Type-only (erased at runtime → byte-identical). Брендированы: `computeBundlePricing` · `package-math` (`proportionalDiscountedPrices`/`packageFinalTotal`) · `resolvePlanPrice` (output — DB-read boundary) · `day.service.sumBookingPrice` · analytics `loadBookingRevenueMap` (R2-03-B path) · YooKassa `formatAmount`+`amountKopeks`. Boundary-branding через `toKopeks`/`kopeksToRubles` — **0 casts** вне 2 конструкторов модуля. typecheck ✅ green с брендом (enforcement works) / 817 tests identical / R2-03 Δ=0 holds (analytics==dashboard 36 914 700) / build ✅ (rule 13). No real unit bug surfaced. `discountValue` намеренно НЕ branded (dual-unit). Full-DTO/display cascade (105 formatter + 215 field sites) deferred (would force cast-littering). См. BACKLOG-DONE.md.
- **PRISMA-INCLUDE-WHERE-CI-CHECK** — AST-гейт против nested-include без `where` (N+1 over-fetch class).
- **SMS-MONITORING-A** — admin balance-widget + daily low-balance cron (после live SMSC).
- **ENV-CONSOLIDATION** *(ENV-FILE-AUDIT + ENV-CONSOLIDATION 2026-06-30)* — split by ownership. ✅ **Tracked side (agent):** `.env.production.example` = единый canonical полный prod-template (cross-check vs env.ts 72 ключа — все required + launch-critical optionals покрыты; gaps только explainable: `MEDIA_LOCAL_*` = dev local-storage, `VK_ID_*` = alias-documented, `AI_PROVIDER` = vestigial-commented); `.env.example` = dev-onboarding (consistent, минус docker-only `POSTGRES_*`/`REDIS_PASSWORD`); VK-alias + AI_PROVIDER notes добавлены в оба; `.gitignore` verified (`.env`/`.env.local`/`.env.production` IGNORED, оба `.example` tracked). ⏳ **Local side (Артём, gitignored — agent не трогает):** в `.env.local` скопировать `WORKER_SECRET`+`AI_FEATURES_ENABLED` из `.env`; удалить 4 dead var (`SUPADATABASE_URL`,`SUPADIRECT_URL`,`OTP_EXPIRATION_TIME`,`DATABASE_URL_V6`); fix 2 stale `beautyhub.art`→`мастеррядом.online`; `Remove-Item .env` → один local-файл. Step-list в отчёте ENV-CONSOLIDATION. *(Снимает прежний ENV-DATABASE-CLEANUP «3 orphan vars».)*
- ✅ **PWA-ARTIFACTS-GITIGNORE** *(FIX-PREDEPLOY-GAPS 2026-06-30)* — `public/{sw.js,sw.js.map,workbox-*.js,workbox-*.js.map,fallback-*.js,worker-*.js}` добавлены в `.gitignore` + `git rm --cached` (staged untrack, **не** закоммичено — Артём review+commit). Post-fresh-build: regenerated файлы (incl. новый fallback-hash) все IGNORED, zero `M`/`??` churn. Files остаются на диске.
- ✅ **VK_ID_*-SCHEMA-GAP** *(FIX-PREDEPLOY-GAPS 2026-06-30)* — `env.ts` теперь объявляет `VK_ID_CLIENT_ID/SECRET/REDIRECT_URI` (optional) рядом с canonical `VK_*` → оба набора имён валидируются Zod, ни один не bypass'ит. `vk/config.ts` читает через `env` (alias-first, behaviour identical); `yandex/config.ts` read-path `process.env`→`env` (rule 11). Importers server-only (rule 13 safe). Ни одна var не стала required; `isVkAuthEnabled` gating не тронут; start-route 503-without-creds preserved.
- **OPENAPI-COVERAGE-INCREMENTAL** — гнать allowlist 216→0 по кластерам.
- **VISUAL-SEARCH-YANDEX-MIGRATION** (post-launch) — vision+embeddings на Yandex + schema `vector(1536)→vector(256)`.
- **AUTH-PROVIDER-ABSTRACTION** *(post-launch refactor, spawned by AUTH-DISCOVERY 2026-06-29)* — сейчас каждый OAuth-провайдер
  bespoke (VK = чистый `src/lib/vk/*`; Telegram размазан по `src/lib/auth/*`; login-grid = hardcoded JSX). После закрытия legal-блокеров
  (Yandex · VK; RF-email cancelled) — унифицировать в provider-abstraction + registry-driven login-grid, выведенный из рабочих провайдеров.
  **Не рефакторить под fine-pressure** — отложено на после launch.
- ✅ **QA-121** *(WAVE-1 2026-07-01)* — двойной mobile bottom-nav на client-кабинете закрыт: `bottom-nav.tsx` теперь исключает весь `/cabinet`-subtree (incl. invisible `(user)`-группу) минус `/cabinet/billing` (стоит вне группы, полагается на глобальный nav). См. BACKLOG-DONE.md.
- **UI a11y/polish** — REDUCED-MOTION-A · TAP-TARGET-AUDIT-A · TAILWIND-COLOR-LINT · STORYBOOK-SETUP (из UI-UX-AUDIT).
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
- ✅ **STUDIO-BOOKING-E2E** *(2026-06-30 — LIVE-VERIFIED; moved → BACKLOG-DONE.md WAVE-1 reconciliation)* — R2-06-A (studio reschedule two-sided #32) + R2-06-I (self-review block #33) проверены вживую на Vision. Полная live-matrix + seed-детали — в BACKLOG-DONE.md.
- ✅ **Legacy retire** — `studio-settings-page.tsx` (837) + `studio-services-page.tsx` (1080) + `master-card-drawer.tsx` (271) + `moneyRUBPlain`-на-dead-services-tab — **всё удалено** LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE (2026-07-02, port-and-retire). `features/studio/` больше не существует.
- ✅ **TELEGRAM-ALERT-PII-REVIEW** *(WAVE-1 2026-07-01)* — raw user cuid убран из ops-monitoring alert (8 auth-login сайтов: message + alert-key обезличены, dedup стал per-condition; `logError({userProfileId})` сохраняет id в structured logs). Kept ops-канал, не user-facing Telegram. См. BACKLOG-DONE.md.
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
- **Package booking** (R2-04-PKG) → **✅ ФИЧА ЗАКРЫТА (solo MVP-1 + studio MVP-2)** (2026-06-24/25; atomic tx + proportional discount + cancel-whole + reschedule-parts; studio multi-master с by-client sequential placement + surfaced на studio public profile; см. BACKLOG-DONE.md).
- **R2-05-C-v2** (opt-in renewal на росте цены) → при повышении цены — renewal **opt-in**: 2-дневный grace + reminders на 24h/2h.
- ✅ **R2-05-I** (copy) *(WAVE-1 2026-07-01)* — поведение оставлено; copy «приостановлен» поправлена → «закрыт для новых подписок» (subscriber notice + admin dialog body + test). См. BACKLOG-DONE.md.
- **Studio reschedule full parity** → studio-календарь получает «принять предложенное клиентом время» (сейчас только Move/Cancel) — пересекается с R2-06-A.

---

## ✅ (verify) — оба пункта подтверждены и закрыты 2026-06-24 (см. BACKLOG-DONE.md)

- **MIGRATION-RECONCILIATION «full scope»** → **DONE.** `npm run check:schema-drift` = `OK — 0 drift` (schema.prisma ⟺ migrations history reconciled). *(`migrate status` показывает 1 not-yet-applied миграцию `…_provider_timezone_default_moscow` — это ОТДЕЛЬНАЯ deploy-ops задача «применить на проде», не reconciliation-gap; остаётся в «🚀 Deploy / ops».)*
- **QA-26 suite** → **phantom (не существовало).** Это был misread Explore-агента: оригинальный бэклог имел заголовок секции `### QA (from QA-02 client discovery→booking funnel, 2026-06-06)`, чьи находки (QA-101 dev-only, QA-108 fixed, …) уже ✅ закрыты FIX-25/FIX-01. Нет «QA-26».

---

## 🔍 EXPLORATORY (EXP-001…033) — breadth-first whole-product Playwright pass (2026-06-23)

> Источник: `EXPLORATORY-FINDINGS.md` (independent second-layer QA). Сгруппировано тематически; ничего не потеряно
> (включая 🔵/seed/verify-on-prod). Dedup: ни один из EXP-001…022 не пересекается с прошлым backlog. Уточнение —
> известный «studio flat services list» = это **public** профиль; studio **cabinet** services page уже группирует по
> категориям. Известный «₽0 analytics revenue» = R2-03-A (не дублируем; EXP-014 — отдельная pricing-copy грань).

**Discovery/catalog → Group 1 ✅ ЗАКРЫТ 2026-06-24 (EXP-TRIAGE-AND-GROUP1 Part 2; см. BACKLOG-DONE.md):**
- ✅ 🟠 **EXP-024** — studio wizard теперь листит только assigned мастеров (masters endpoint отдаёт `serviceIds`; wizard фильтрует) → 0×409, нет dead-end. Live: «Маникюр классический» → 2/7 мастера, 0 console errors, 2× `/availability` 200.
- ✅ 🟠 **EXP-021** — catalog route читает `getServerCity()` → `cityId` фильтр (зеркало `/models`). Live: no-city 40 → moscow 18 / spb 7. Ungeocoded исключены из city-view; нет города = все города.
- ✅ 🟡 **EXP-025** — `/slots` + `/availability` теперь делят `listBookableSlots` (shared min-ahead + schedule filter) — не могут разойтись. Verified SHA-identical.
- ✅ 🟡 **EXP-030** — *floor-fix*: footer «Мастера рядом» → `/catalog` (city-scoped, не dead-end); empty-state получил «Сбросить всё» CTA. *Pipeline сам не построен* → новый backlog `CATALOG-AVAILABLE-TODAY-PIPELINE` ниже.
- ✅ 🔵 **EXP-026** — оба endpoint'а теперь трактуют `to` как **inclusive** (в shared primitive). Callers `to` не шлют → zero runtime impact, contract выровнен.

**TZ cross-surface (FIX-EXP-TZ-CROSS-SURFACE ✅ 2026-06-25 — shared entity-tz primitive `formatLocalHm(date, tz)` в client-safe `src/lib/schedule/timezone.ts`; live-verified на Almaty +5; engine SHA-identical):**
- ✅ 🟡 **EXP-017** — dashboard attention/upcoming/greeting форматируют bookings в **salon-tz** (`formatLocalHm`, было `getUTCHours`) → совпадают с kanban. Удалены 3 локальные UTC-`formatHm` копии. Live: dashboard 16:00/19:00/15:00 == kanban (Almaty).
- ✅ 🟡 **EXP-019** — master week-schedule card лейбл теперь salon-tz (`formatLocalHm`, было host-tz `schedule-utils.formatHm`) → совпадает с grid-позицией (та же salon-tz). Удалён host-tz `formatHm` export. Live: все 6 карточек label-top == grid-top.
- ✅ 🟡 **EXP-023** — профиль chip earliest-bookable теперь применяет `earliestBookableUtc(min-ahead)` cutoff + buffer в `buildSlotsForDay` (service-agnostic probe — не регрессит studio-masters). Live: chip «14:30» == widget первый bookable слот.
- ✅ 🔵 **EXP-020** — studio calendar «today» резолвится через `toLocalDateKey(now, studioTz)` (было `isSameUtcDay`/UTC-date) → совпадает с master/client. Live: «ЧТ 25 июня» = studio-tz today. Near-midnight rollover покрыт unit-тестом `toLocalDateKey`.

**Pricing/billing copy (FIX-EXP-PRICING-COPY ✅ 2026-06-25 — copy + CTA only, resolver/seed untouched):**
- ✅ 🟡 **EXP-014** *(copy)* — fallback `placeholderHint` сменён с admin-process «Цена будет настроена администратором» на нейтральное public «Цена скоро появится» (`UI_TEXT.pricing.periods.placeholderHint`). Fires на обоих fallback-branch'ах plan-card (`!plan` + `plan.prices.length === 0` = FIX-R2-05-AB no-price path). Resolver не тронут; FREE «0 ₽ навсегда» по-прежнему отличим. **Live (оба таба, обе темы):** PRO/PREMIUM показывают «[Уточняется]» + «Цена скоро появится», без admin-языка. ⚠️ **Seed-root остаётся deploy-ops** — «all plans Бесплатно / MRR 0» = unset `BillingPlanPrice` (см. deploy-ops «Seed BillingPlanPrice»); **этот fix цены НЕ сидил** (verified planPrices=0).
- ✅ 🔵 **EXP-015** *(CTA)* — «Сравнить тарифы» теперь ведёт на реальное сравнение: `<a href="#pricing-plans">` (plain anchor — native smooth-scroll) к секции 3-х plan-card'ов на той же странице, вместо неправдивого редиректа на `/become-master`. `#pricing-plans` id добавлен на plan-cards `<section>`. **Live:** клик → hash `#pricing-plans` → smooth-scroll к comparison (scrollY 2701→433). *(Note: `pricing.comparison.*` UI_TEXT — dead, feature-comparison таблица не рендерится; реальное сравнение = 3 карточки.)*

**Content/grammar/SEO (FIX-EXP-CONTENT-GRAMMAR ✅ 2026-06-25 — source-fixed, live-verified):**
- ✅ 🟡 **EXP-001** — bare-title convention: root template `"%s | МастерРядом"` (kept) = единственный brand-adder; stripped self-branded суффикс с 14 static page titles + 3 dynamic `UI_TEXT.pages.*.titleTemplate` (publicProfile/publicBooking/modelOffer) + homepage → `title:{absolute}`. **Live:** «Тарифы | МастерРядом», «… | МастерРядом» на `/u/anna-sokolova` (был triple), homepage single — везде 1× бренд.
- ✅ 🟡 **EXP-002** *(legal/152-ФЗ)* — `LegalConsentCheckbox` (3 варианта): глагол «принимаю/принимаете {accusative}» → «соглашаюсь с / согласны с {instrumental}» (link text уже инструментальный → теперь верно). Документы/ссылки (`/terms`,`/privacy`) не тронуты, legal-смысл сохранён. **Live (/login):** «Я соглашаюсь с Пользовательским соглашением и Политикой конфиденциальности.», обе ссылки работают.
- ✅ 🟡 **EXP-003** — helper `formatMemberSince` (был `Intl(month:"long")`=nominative «июнь») → genitive `MONTHS_GENITIVE`. `displayBirthday` дедуплицирован на тот же const. **Live:** «С нами с июня 2026».
- ✅ 🔵 **EXP-004** — booking-success zone-label был `ml-1` (CSS-margin без space-char → «13:00—14:00(Алматы…)» в тексте/screen-reader) → реальный `{" "}` space. (client-bookings уже имел real space — verified «Время салона (Алматы, GMT+5)».)
- ✅ 🔵 **EXP-005** *(legal/deploy)* — footer ИНН → `NEXT_PUBLIC_LEGAL_INN` (env.ts + оба `.env*.example`); `text.ts` `entityTemplate` + `innUnset:"[не указан]"`; `FooterCopyright` читает env, unset/fake `1234567890` → **obvious** «[не указан]» (никогда fake-число). Имя «Дмитриев Артем Романович» сохранено. **Live:** «… ИНН [не указан]». ⚠️ **real ИНН → deploy-ops** (config wired, value pending; fix число НЕ выдумывал).
- ✅ 🔵 **EXP-008** — `getPublicStats.masters` = все published providers (masters + studios). Relabel «мастер» → «специалист» на **3** surface: catalog H1 plural (1/2/5 корректно), home hero eyebrow, login social-proof. **Live:** «7 специалистов рядом», «43 СПЕЦИАЛИСТОВ», «43 специалистов на платформе». (`statMastersLabel` — dead/без consumer; «{N} мастеров на смене» в studio — genuinely masters, не тронуто.)
- ✅ 🔵 **EXP-016** — client review-card `{serviceName ?? "—"} · {date}` → `[serviceName,date].filter(Boolean).join(" · ")` (зеркало studio-card). **Live:** service-less карточки = «25 июня 2026 г.», no bare «— ·».
- ✅ 🔵 **EXP-018** — master dashboard `announcements.ts`: WhatsApp (не интегрирован) → «в Telegram и по SMS»; past-dated вебинар (Чт 7 мая) → evergreen truthful tip «Соберите пакет услуг со скидкой» (real feature, без даты). **Live:** 3 анонса, no WhatsApp/webinar.

**Notifications/push UX (FIX-EXP-NOTIFICATIONS ✅ 2026-06-26 — per-channel prefs + push gesture-gating):**
- ✅ 🟡 **EXP-027** — push permission больше НЕ запрашивается gesture-lessly на load: `push-manager.tsx` mount теперь только re-sync (subscribe лишь если pref включён И permission уже granted; никогда не prompt). Запрос разрешения перенесён в явный toggle (`PushNotificationsSection`, user-gesture). Re-enable после deny: toggle перечитывает permission + показывает guidance. Новое поле `UserProfile.pushNotificationsEnabled` (миграция `20260626000000`) гейтит ВСЕ push-send пути в `sendPushToUser` (chokepoint). **Live:** `Notification.permission`=default после load (no auto-prompt); toggle on→DB `t`, off→DB `f` (оба направления). **Push toggle добавлен и мастерам** (shared ChannelsCard) — иначе removal авто-запроса оставил бы мастеров без способа включить push.
- ✅ 🔵 **EXP-028** — клиентский `/cabinet/settings` уже имел email/telegram/vk-секции; добавлена **push**-секция (per-channel on/off, parity с мастерами). Email-гейтинг был; telegram гейтится через `getTelegramChatIdForUser` (isEnabled); push теперь гейтится через `pushNotificationsEnabled`. send-test (4) пинит push-гейт.
- 🟡 **EXP-029** *(DEFERRED — next feature, post-pre-deploy)* — per-event×channel routing matrix. Остаётся «Скоро»-плейсхолдер (master `PerEventPlaceholder`). НЕ строим в этом проходе (per locked decision). Foundation (per-channel on/off) готов — matrix построится поверх той же модели. VK delivery WIP, SMS не wired.
- 🚀 **DEPLOY/STAGING** — реальный «prompt появляется на gesture» + фактическая push-доставка проверяются на staging (dev: next-pwa отключает SW; push требует prod-build + HTTPS + VAPID). A/B (manual-only vs gesture-prompt) выбирается на staging — оба механизма заложены (manual toggle = default; `syncExistingSubscription` reusable для будущего gesture-trigger).

**Chat/UX (FIX-EXP-CHAT-UX ✅ 2026-06-25):**
- ✅ 🟡 **EXP-012** — root: `useConversations` ревалидировал список ТОЛЬКО на входящий `CHAT_MESSAGE_RECEIVED`, но отправитель НЕ получает его на своё первое сообщение → список оставался пустым до reload. Fix: `ChatShell` прокидывает `refresh` списка → `ChatWindow` → `Composer.onSent` (после POST-success) дёргает и thread-refresh, и list-**revalidate** (refetch, не optimistic-insert → no phantom). **Live (Алёна↔Анна, CONFIRMED booking, 0 msgs):** первое сообщение → тред появился в левом списке мгновенно, без reload; 2-е сообщение в существующем треде → список остался 1 строкой (no duplicate, no regression).
- ✅ 🔵 **EXP-022** *(intermittent — code guard, absence ≠ proof)* — `/u/[master]/booking` solo-master redirect = **server** `permanentRedirect` (clean). Реальный unguarded setState — detached `void (async()=>…)()` enrich-fetch в `booking-flow-stepper.tsx` (post-submit success-card), `dispatch` без mounted-guard → пост-unmount при mobile sheet-close/navigate-to-profile. Fix: `mountedRef` + `if (enriched && mountedRef.current)` перед dispatch. **«Invalid token» verdict:** 0 dynamic imports в `/booking` route (grep), redirect-URL well-formed → не app-bug (likely dev HMR/framework redirect-prefetch chunk artifact). **Best-effort walk:** 3× solo /booking→profile (mobile 390×844) = 0 console errors (только benign next/image-quality warnings).

**a11y/PWA/cleanup (FIX-EXP-A11Y-PWA ✅ 2026-06-25):**
- ✅ 🔵 **EXP-033** — `viewport` export (`layout.tsx`): убраны `maximumScale: 1` + `userScalable: false` (блокировали pinch-zoom, WCAG 1.4.4). Осталось `width=device-width, initial-scale=1, viewport-fit=cover`. **Live (mobile):** viewport content без `user-scalable=no`, zoom разблокирован.
- ✅ 🔵 **EXP-032** — orphan `public/manifest.json` (off-brand `theme_color #c6a97e`) **удалён** (в src/ его не линковал никто — только comment + build-artifact sw.js precache, который регенерится на build; живой `manifest:` = `/brand/manifest.webmanifest`). Comment в `layout.tsx` обновлён. **Live:** `/manifest.json` → 404, `/brand/manifest.webmanifest` → 200, head linkает brand-manifest.
- ✅ 🔵 **EXP-013** *(reuse runtime-finished cutoff, no new "past")* — `/cabinet/bookings` split был **status-based** (CONFIRMED/PENDING → «Предстоящие» даже если elapsed). Fix: новый pure `classifyClientBookingGroup` (`src/lib/client-cabinet/booking-classification.ts`) **переиспользует `resolveBookingRuntimeStatus`** (тот же canonical predicate, что `can-leave`/`canReview`) → группа upcoming/finished/cancelled по datetime+статусу (instant-based, tz-agnostic; entity-tz = display-only `isToday`). Elapsed-но-не-FINISHED бронь → history. Reschedule/cancel gated на `booking.isUpcoming` (`client-bookings-page.tsx:521`) → elapsed теряет Перенести. **Live (Виктория, Анна = Almaty +5):** «Предстоящие»=1; elapsed PENDING (25 июня 16:00 Almaty) → history, action-row «Оставить отзыв» (НЕ «Перенести»); future CONFIRMED (26 июня) → upcoming + «Перенести/Отменить». 8 unit-тестов. **No third 'past' definition** (divergence-class avoided).

**Seed-data hygiene (FIX-EXP-SEED-HYGIENE ✅ 2026-06-26 — RF-only seed, re-seed + DB-verified, snapshot regenerated):**
- ✅ 🔵 **EXP-006 + R2-03-A** — все провайдеры → Россия (no KZ): Анна → Москва (Europe/Moscow, «ул. Покровка, 22», cityId=moscow), Vision + 8 мастеров → **Екатеринбург (Asia/Yekaterinburg +5)** — намеренный non-MSK RF-провайдер, сохраняет salon-tz regression-surface (R2-04-BA) без KZ; bulk-Новосибирск (+7) тоже остаётся. TZ derived из City (FIX-R2-02-A). Booking-времена пересчитаны из salon-local intent под новой tz (`dateAtLocalUtc` tz-aware, не naive-UTC) — Анна показывает 11:00/14:00/… в Москве (в рабочих часах), не сдвиг. **R2-03-A:** добавлены priced `BookingServiceItem` (priceSnapshot=service.price) → analytics revenue Анны **51 000 ₽ / 14** (был ₽0); priceSnapshot==service.price → dashboard==analytics → R2-03 Δ=0 reconcile, теперь non-zero.
- ✅ 🔵 **EXP-007** — public review-preview (3 newest, createdAt desc): master-отзывы получили spread createdAt (3 distinct-author newest), отзывы showcase-клиента (Елена) сдвинуты старше (−10..−12d) → preview = 3 разных автора (Сергей Петров · Галина Семёнова · Евгений Кузнецов).
- ✅ 🔵 **EXP-010** — showcase-client email → `elena.petrova.91@yandex.ru` (реалистичный; reset.ts ловит по +7999 phone-prefix). Bulk-клиенты (фоновые, не показываются в demo-profile) остаются на test-домене.
- ✅ 🔵 **EXP-011** — invalid seed `PushSubscription` (p256dh 22-char ASCII ≠ 65 bytes) **удалён** (не подделан — forged key всё равно упал бы web-push). Push KPI Анны = «Выключены». 0 push-ошибок в логе.
- **Snapshot:** `.qa/snapshots/post-seed.dump` регенерирован (RF-данные + priced items + BookingPackage schema) — canonical baseline; clears the deploy-ops snapshot-regen item.

**Verify-on-prod (dev-config / dev-amplified — проверить на проде, не fix-в-dev):**
- 🔵 **EXP-009** — Telegram login widget «Bot domain invalid» (TG bot domain не сконфижен на localhost). Проверить prod bot-domain. *(пересекается с deploy-ops «Telegram live round-trip».)*
- 🔵 **EXP-031** — `/cabinet/studio/analytics` медленный (dev: 60s on-demand compile → ~5.9s SSR; агрегирует ~15 endpoints без кэша). Load-check на warm prod build.
- 🔵 **PWA SW/push prod-only** — SW не регистрируется в dev (next-pwa off); offline-кэш / install-prompt / push delivery exercise-able только на prod build. Manifest/icons/meta в dev корректны.

---

## КАК ИСПОЛЬЗОВАТЬ

1. Берём задачу → делаем → переносим строку в `BACKLOG-DONE.md` с датой.
2. Новая deferred-фича в обсуждении → добавляем сюда в нужную severity-секцию.
3. Раз в ~4–6 коммитов / 2 недели — sync с кодом (rule 15) + при необходимости новый CONTEXT-REFRESH.

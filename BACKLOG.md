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
  «🔍 EXPLORATORY» ниже) + **Group 1 (discovery/catalog) ЗАКРЫТ** (EXP-021/024/025/026/030, 2026-06-24).
- Следующее: **package-booking MVP** (decision #4 — booking-foundation discovery defects на `/availability`+wizard
  закрыты, можно строить) → затем оставшиеся EXP-группы (tz-cross-surface EXP-017/019/020/023, pricing-copy,
  content/grammar, notifications, chat, a11y, seed-hygiene) → 🟡/🔵 consolidation sweep.
- **Deploy / ops** (см. секцию ниже) — env-домены, live social-auth creds, SMS creds, geocoder key, DevOps infra,
  применить FIX-R2-02-A миграцию на проде до regen seed-snapshot.
- **Product decisions решены Артёмом** (см. секцию ниже) → теперь это actionable code-задачи.

---

## 🔴 PRE-LAUNCH BLOCKERS (code)

- **Нет открытых code-блокеров.** Последний (**PII-LOGGING-FIX-A**) закрыт 2026-06-24 — см. `BACKLOG-DONE.md`.
  Прочие 🔴 из прошлых волн (R2-05-A/B category+billing, R2-02-A timezone, booking-integrity) — тоже закрыты.
  Остаток до launch — **операционный**, см. «🚀 Deploy / ops» ниже.

---

## 🟠 HIGH PRIORITY

- **OBSERVABILITY-SENTRY-A** — нет error-aggregation/APM; production debugging = log-scraping. Ставить **после** PII-LOGGING-FIX-A
  (Sentry с `sendDefaultPii:false` + `beforeSend` PII-scrubber). ~half-day.
- **R2-05-H** — plan enable/disable toggle без confirmation guard (mis-click отключает план + рассылает «приостановлен»
  всем active subs). Reversible, но рискованно. Fix: confirm-modal когда `activeSubscriptionsCount > 0`.

---

## 🟡 MEDIUM PRIORITY

**R2 (Round 2) residual:**
- **R2-02-B** — studio publish ungated (`studio.ts` ставит `isPublished` из input без address/service/master-проверки),
  асимметрично master `ADDRESS_REQUIRED`. Fix: требовать ≥1 услугу до publish.
- **R2-02-C** — published пустая студия отдаёт dead-end 4-step booking wizard. Fix: «настраивается»/redirect для пустой студии.
- **R2-04-C** — many-services public booking page = flat 35-item list без группировки. Fix: группировать по globalCategory / фильтр категорий.
- **R2-05-G** — нет фидбэка репортёру при модерации отзыва; нет UI восстановления soft-deleted отзыва (только manual SQL).
- **R2-05-A2** — category reject reason только в логах (нет колонки); владельцы portfolio-item не уведомляются при delist.
- **R2-05-J** — `BillingPlanPrice.isActive` без admin UI + latent direct-DB mass-expiry path (renewal может залогировать CRITICAL).
- **R2-03-A** — seed-артефакт: 38 showcase-броней Анны без `BookingServiceItem` → analytics revenue ₽0. Fix: добавить priced items в `seed-showcase-master.ts`.
- **R2-03-B** — analytics revenue без `Service.price` fallback (в отличие от `day.service.ts`). Latent (prod всегда пишет items). Fix: shared fallback или backfill.

**Прочее:**
- **CATALOG-AVAILABLE-TODAY-PIPELINE** (spawned by EXP-030) — `Provider.availableToday` — это snapshot, который **никто никогда не вычисляет** (все write-сайты ставят `false`). Это не disabled-cron, а **не построенный pipeline** (нужен job: для каждого published provider посчитать есть ли сегодня-окна через slot-engine + invalidate-хуки на booking-write + cron). Floor-fix уже закрыл user-facing dead-end (footer→/catalog, empty-state CTA). Пока pipeline нет — toggle «Свободно сегодня» гарантированно даёт 0 (опц. follow-up: скрыть toggle до построения pipeline, чтобы не предлагать заведомо-пустой фильтр). Размер: своя задача (cron+job+invalidation), не fix.
- **OTP-EMAIL-LOGIN-RACE** — 6-й P2002 site (OTP email login `create`), latent low-probability. Fix: re-read recovery.
- **MONEY-BRAND-TYPE-A** — brand-type `Kopeks` для compile-time защиты от рубли/копейки mix (~20 сайтов).
- **PRISMA-INCLUDE-WHERE-CI-CHECK** — AST-гейт против nested-include без `where` (N+1 over-fetch class).
- **SMS-MONITORING-A** — admin balance-widget + daily low-balance cron (после live SMSC).
- **ENV-DATABASE-CLEANUP** — 3 orphan vars в `.env`/`.env.local`.
- **OPENAPI-COVERAGE-INCREMENTAL** — гнать allowlist 216→0 по кластерам.
- **VISUAL-SEARCH-YANDEX-MIGRATION** (post-launch) — vision+embeddings на Yandex + schema `vector(1536)→vector(256)`.
- **UI a11y/polish** — REDUCED-MOTION-A · TAP-TARGET-AUDIT-A · TAILWIND-COLOR-LINT · STORYBOOK-SETUP (из UI-UX-AUDIT).
- **CRM/booking фичи** — manual tag assignment · late-cancel CRM tracking · online payments + штрафы (`lateCancelAction==="fine"`) · manual finish-booking endpoint · anonymization-vs-deletion на account delete.

---

## 🔵 NICE-TO-HAVE

- **R2-01-D** — master-created manual booking = `PENDING, actionRequiredBy: MASTER` (redundant self-action).
- **R2-02-D/E/F** — PREMIUM badge + «На платформе 1 мес.» на 1-дневном master-профиле; master-facing copy виден клиенту; empty-name `<title>`.
- **R2-05-E** — review delete = soft, но JSDoc + confirm-copy говорят «полностью убирает из БД» (copy-only mislabel).
- **R2-05-F** — seed `Provider.ratingCount` drift (recalc корректит на следующем add/delete).
- **BC-F1/F2/F3** — factual (не баги): нет multi-year term; нет multi-license/seat; нет proration/refund на смене плана.
- **QA-106 (server-string)** — off-schedule message «Окошко уже занято…» для direct-API (UI уже исправлен FIX-25).
- **RULE-12-BOOKING-CONTRACT-OPTIONAL** — booking-flow provider/service/studio ids в URL (нужны funnel'у; encoding = contract change, flagged).
- **STUDIO-SCHEDULE-UTC-DAY-GROUPING** — studio day-grouping UTC-based (host-independent, но не studio-tz-aligned).
- **FOOTER-VK-HANDLE-FIX** — footer `vk.com/beautyhub` (stale community handle).
- **CI/structural** — PRE-COMMIT-SCHEMA-MIGRATION-PAIR · FINDMANY-TAKE-CI-CHECK · ENV-TEMPLATES-CI-CHECK · RUNBOOK-COVERAGE-CI · LOGGER-DISCIPLINE-CI-GATE · BUNDLE-SIZE-BASELINE · SW-SUPABASE-RULE-CLEANUP · STORIES-TAKE-CAP.
- **a11y/perf** — STORIES-VIEWER-A11Y-CONSOLIDATE · FRAMER-MOTION-REDUCED-MOTION-SWEEP · BOOKING-PARTIAL-UNIQUE-INDEX-A · BOOKING-STATUS-PROMOTION-CRON · BOOKING-AUDIT-LOG-A.
- **Studio/VK** — studio-admin chat with master (нужен auth-model decision) · studio public-page sidebar entry · VK notifications delivery subsystem (VK Bot API).
- **R2-06-A follow-up (optional)** — surface accept/decline reschedule ALSO в studio calendar/journal action-menu (FIX-R2-06-A сделал inline-on-notification — основная parity-поверхность). Нужен threading `proposedStartAt/actionRequiredBy` в `ScheduleBookingCell`/`StudioBookingRow` DTO; reuse the same `/confirm` + `/decline-reschedule` endpoints. Также: studio calendar `?focus=` reader (для deep-link highlight на календаре).
- **Legacy retire** — `studio-settings-page.tsx` (837 LOC, 3 live sub-route importers) + `studio-services-page.tsx` + `moneyRUBPlain` — когда portfolio/profile sub-routes получат studio-cabinet redesign (LEGACY-CLEANUP-EXEC остаток).
- **TELEGRAM-ALERT-PII-REVIEW** — review cuid в alert-тексте (admin chat only).
- Feature-buckets — CRM/Schedule/Catalog/Marketing/Notifications enhancements · mobile app · code-quality · admin dashboard/catalog enhancements.

---

## 🚀 DEPLOY / OPS (operational, не code — но не потерять)

- **env → `мастеррядом.online`** — выставить `VK_ID_REDIRECT_URI` + `APP_PUBLIC_URL` (stale `beautyhub.art` живёт только в gitignored `.env`/`.env.local`; в tracked-коде 0).
- **VK** — зарегистрировать redirect_uri + live VK round-trip QA с реальными creds.
- **Telegram** — live round-trip с зарегистрированными creds (login + connect-modal).
- **SMS** — `SMS_PROVIDER_ENABLED=true` + `SMS_PROVIDER_LOGIN`/`PASSWORD` + баланс SMSC + smoke RU/KZ.
- **`YANDEX_GEOCODER_API_KEY`** в QA/prod env — prerequisite для tz-derivation walk на onboarding (FIX-R2-02-A).
- **Seed `BillingPlanPrice` rows** — явные active rows для каждого предлагаемого периода (1/3/6/12mo) в QA/prod (BC-1 consistency; fallback есть, но явная row предпочтительнее).
- **YooKassa** — replay `payment.succeeded`/`refund` + idempotency в live env.
- **🚩 Применить миграцию `20260619000000_provider_timezone_default_moscow`** на проде **до** regen seed-snapshot.
- **Email infra** — SMTP provider + DNS (DKIM/SPF/DMARC).
- **DevOps infra (4 решения)** — Postgres hosting · TLS termination · backups · deploy-rollback policy.

---

## 🧩 PRODUCT DECISIONS — решены Артёмом → actionable code

- **BC-CAP** → считать **ACTIVE-only** (сейчас `ensureStudioTeamLimit` считает INVITED/DISABLED+pending invites тоже) **+** задать числа cap для PRO/PREMIUM (FREE=2 есть).
- **Package booking** (R2-04-PKG) → **wire booking** + **proportional discount**; пакет раскрывается в component-items + summed duration + один conflict-check. Нужен discovery-проход.
- **R2-05-C-v2** (opt-in renewal на росте цены) → при повышении цены — renewal **opt-in**: 2-дневный grace + reminders на 24h/2h.
- **R2-05-I** (copy) → поведение «disable плана = блок новых signups, active subs не истекают» оставить; **поправить copy** «приостановлен» (вводит в заблуждение).
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

**TZ cross-surface (out-of-scope для dev/MSK run; reported где cross-surface contradiction, не pure wrong-absolute-time):**
- 🟡 **EXP-017** — одна бронь = два времени на master-поверхностях (dashboard 07:00 UTC vs kanban 12:00 salon-tz).
- 🟡 **EXP-019** — master week-schedule: карточка нарисована в 12:00-слоте, а лейбл «10:00–11:00» (расхождение = Almaty/MSK offset).
- 🟡 **EXP-023** — профиль chip «Сегодня свободно с 11:30» игнорит min-ahead+lunch (реальный earliest = 14:00).
- 🔵 **EXP-020** *(verify-on-prod)* — studio calendar «today» = UTC-date, расходится с master/client (local-tz) на 1 день у local-midnight.

**Pricing/billing copy:**
- 🟡 **EXP-014** — public `/pricing` PRO/PREMIUM показывают «[Уточняется] · Цена будет настроена администратором» (admin-process copy наружу); admin/billing все планы «Бесплатно», MRR 0 (root = unset seed prices; см. deploy-ops «Seed BillingPlanPrice»).
- 🔵 **EXP-015** — `/pricing` «Сравнить тарифы» CTA ведёт на `/become-master`, не на сравнение.

**Content/grammar/SEO:**
- 🟡 **EXP-001** — `<title>` дублирует бренд-суффикс («… — МастерРядом | МастерРядом») sitewide.
- 🟡 **EXP-002** — login consent checkbox грамматически неверен (legal): «Я принимаю Пользовательск**им** соглашени**ем**…» (instrumental после accusative-глагола).
- 🟡 **EXP-003** — «С нами с **июнь** 2026 г.» — nominative month после «с» (нужен genitive «июня»).
- 🔵 **EXP-004** — нет пробела перед TZ-меткой в booking-success: «13:00**(Алматы, GMT+5)**».
- 🔵 **EXP-005** — placeholder ИНН `1234567890` в footer (sitewide legal text).
- 🔵 **EXP-008** — счётчик «43 мастера» включает студии (label accuracy).
- 🔵 **EXP-016** — пустой service-label «— ·» в client review-карточках.
- 🔵 **EXP-018** — master dashboard «Анонсы» с past-dated вебинаром (Чт 7 мая) + WhatsApp (не интегрированный канал).

**Notifications/push UX:**
- 🟡 **EXP-027** — нет user-facing push-контрола; prod авто-`requestPermission()` без user-gesture (браузеры душат) + нет re-enable после deny.
- 🔵 **EXP-028** — у клиентов нет notification-preferences (меньше контроля чем у мастеров: только in-app центр).
- 🔵 **EXP-029** — нет per-event-type routing (документированный «Скоро»); VK delivery WIP, SMS не wired.

**Chat/UX:**
- 🟡 **EXP-012** — chat conversation-list не рефрешится после первого сообщения в новом треде (нужен reload). *(смежно с FIX-R2-06-B `?focus=`/SSE-рефреш паттерном.)*
- 🔵 **EXP-022** *(intermittent, low-confidence)* — React «setState on unmounted» + «Invalid token» при `/u/[master]/booking`→профиль redirect (solo-master), mobile. Не воспроизвёлся на retry.

**a11y/PWA/cleanup:**
- 🔵 **EXP-033** — viewport `user-scalable=no, maximum-scale=1` блокирует pinch-zoom (WCAG 1.4.4).
- 🔵 **EXP-032** — orphan `/manifest.json` (200) со stale off-brand `theme_color #c6a97e` (живой = `/brand/manifest.webmanifest`).
- 🔵 **EXP-013** *(seed-amplified)* — «Предстоящие» включает уже-прошедшие брони (split по статусу CONFIRMED/PENDING, не по datetime).

**Seed-data hygiene:**
- 🔵 **EXP-006** — Almaty адрес+TZ под Москва-городом (city/address mismatch; TZ-label by-design FIX-22).
- 🔵 **EXP-007** — public review-preview: 3 отзыва все от одного автора (preview-ordering/seed).
- 🔵 **EXP-010** — seed placeholder email `seed-client-…@test.masterryadom.local` виден в client profile.
- 🔵 **EXP-011** — push delivery падает на invalid seed PushSubscription (`p256dh … 65 bytes`); log-noise, не user-visible.

**Verify-on-prod (dev-config / dev-amplified — проверить на проде, не fix-в-dev):**
- 🔵 **EXP-009** — Telegram login widget «Bot domain invalid» (TG bot domain не сконфижен на localhost). Проверить prod bot-domain. *(пересекается с deploy-ops «Telegram live round-trip».)*
- 🔵 **EXP-031** — `/cabinet/studio/analytics` медленный (dev: 60s on-demand compile → ~5.9s SSR; агрегирует ~15 endpoints без кэша). Load-check на warm prod build.
- 🔵 **PWA SW/push prod-only** — SW не регистрируется в dev (next-pwa off); offline-кэш / install-prompt / push delivery exercise-able только на prod build. Manifest/icons/meta в dev корректны.

---

## КАК ИСПОЛЬЗОВАТЬ

1. Берём задачу → делаем → переносим строку в `BACKLOG-DONE.md` с датой.
2. Новая deferred-фича в обсуждении → добавляем сюда в нужную severity-секцию.
3. Раз в ~4–6 коммитов / 2 недели — sync с кодом (rule 15) + при необходимости новый CONTEXT-REFRESH.

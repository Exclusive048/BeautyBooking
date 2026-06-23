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

- **R2-06 notification-слой** — последний R2-discovery-sweep, 5 открытых пунктов (A/B/F/H/I). Рекомендуемый старт:
  **R2-06-B** (shared `?focus=` reader) — разблокирует весь booking-CTA-deeplink family и независим от product-decision-задач.
- **Deploy / ops** (см. секцию ниже) — env-домены, live social-auth creds, SMS creds, geocoder key, DevOps infra,
  применить FIX-R2-02-A миграцию на проде до regen seed-snapshot.
- **Product decisions решены Артёмом** (см. секцию ниже) → теперь это actionable code-задачи.

---

## 🔴 PRE-LAUNCH BLOCKERS (code)

- **PII-LOGGING-FIX-A** — 3 сайта пишут raw phone/email в production logs: `src/lib/email/sender.ts:41,47`
  (`{ to: opts.to }`), `src/app/api/cabinet/user/profile/email/verify/route.ts:99` (`email: normalizedEmail`),
  `src/lib/sms/index.ts:66,74` (phone — verify masked). Fix: обернуть в `maskPhone`/`maskEmail`. **Блокирует Sentry**
  (иначе он молча зальёт PII; 152-ФЗ). Helpers уже есть (`src/lib/logging/masking.ts`). ~30–45 мин. (Источник: SENSITIVE-DATA-LOGS-AUDIT-A 2026-06-02.)

> Прочие 🔴 из прошлых волн (R2-05-A/B category+billing, R2-02-A timezone, booking-integrity) — закрыты, см. `BACKLOG-DONE.md`.
> Остальные «launch-blocker»-задачи — **операционные**, вынесены в «🚀 Deploy / ops».

---

## 🟠 HIGH PRIORITY

- **R2-06-A** — booking-reschedule (`BOOKING_RESCHEDULE_REQUESTED`) без inline accept/decline ни на одной поверхности;
  studio-календарь вообще не имеет «принять предложенное время» (только Move/Cancel, игнорящие proposal); deeplink
  теряет `?focus=`. Fix: inline accept/decline на нотификации (master+studio) + studio accept-proposed-time + `?focus=` reader.
- **R2-06-B** — booking/reminder/chat/review deeplinks **теряют** `?focus=`/`?bookingId=`/`&chat=open` → лендят на список
  без подсветки (`master/bookings` читает только q/tab/client; dashboard + client-bookings не читают booking-param).
  Fix: **shared `?focus=<id>` reader** на bookings/dashboard/client-bookings. *(Рекомендуемый первый R2-06 фикс — un-breaks весь CTA family, независим от product-decisions.)*
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
- **R2-06-F** — все `BILLING_*` нотификации без in-app CTA (только push несёт scope-correct `billingUpgradeHref`).
  Fix: `openHref = billingUpgradeHref(scope)` для billing-нотификаций.
- **R2-06-H** — review UI показывает affordance на *persisted* FINISHED+14d, а серверный гейт = *runtime*-FINISHED+3d →
  server-eligible CONFIRMED-past бронь без кнопки отзыва (и persisted-FINISHED 4–14d с мёртвой). Fix: surface на runtime-FINISHED + выровнять окно.
- **R2-03-A** — seed-артефакт: 38 showcase-броней Анны без `BookingServiceItem` → analytics revenue ₽0. Fix: добавить priced items в `seed-showcase-master.ts`.
- **R2-03-B** — analytics revenue без `Service.price` fallback (в отличие от `day.service.ts`). Latent (prod всегда пишет items). Fix: shared fallback или backfill.

**Прочее:**
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
- **R2-06-I** — нет явного self-review block в `createReview` (mitigated booking-ownership). Fix: `authorId !== owner` guard.
- **BC-F1/F2/F3** — factual (не баги): нет multi-year term; нет multi-license/seat; нет proration/refund на смене плана.
- **QA-106 (server-string)** — off-schedule message «Окошко уже занято…» для direct-API (UI уже исправлен FIX-25).
- **RULE-12-BOOKING-CONTRACT-OPTIONAL** — booking-flow provider/service/studio ids в URL (нужны funnel'у; encoding = contract change, flagged).
- **STUDIO-SCHEDULE-UTC-DAY-GROUPING** — studio day-grouping UTC-based (host-independent, но не studio-tz-aligned).
- **FOOTER-VK-HANDLE-FIX** — footer `vk.com/beautyhub` (stale community handle).
- **CI/structural** — PRE-COMMIT-SCHEMA-MIGRATION-PAIR · FINDMANY-TAKE-CI-CHECK · ENV-TEMPLATES-CI-CHECK · RUNBOOK-COVERAGE-CI · LOGGER-DISCIPLINE-CI-GATE · BUNDLE-SIZE-BASELINE · SW-SUPABASE-RULE-CLEANUP · STORIES-TAKE-CAP.
- **a11y/perf** — STORIES-VIEWER-A11Y-CONSOLIDATE · FRAMER-MOTION-REDUCED-MOTION-SWEEP · BOOKING-PARTIAL-UNIQUE-INDEX-A · BOOKING-STATUS-PROMOTION-CRON · BOOKING-AUDIT-LOG-A.
- **Studio/VK** — studio-admin chat with master (нужен auth-model decision) · studio public-page sidebar entry · VK notifications delivery subsystem (VK Bot API).
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

## ❓ (verify) — подтвердить у Артёма (не удалено, оставлено активным)

- **MIGRATION-RECONCILIATION «full scope»** — старый бэклог упоминал остаток «1–2 ч / 24 операции»; MIGRATION-RECONCILIATION-BATCH (2026-05-30) + `check:schema-drift` выглядят как полное закрытие. Подтвердить, что остатка нет → иначе вернуть в 🔴.
- **QA-26 suite (2026-06-06)** — в старом бэклоге значилось «дополнительные находки» без детализации. Подтвердить scope/severity или закрыть.

---

## КАК ИСПОЛЬЗОВАТЬ

1. Берём задачу → делаем → переносим строку в `BACKLOG-DONE.md` с датой.
2. Новая deferred-фича в обсуждении → добавляем сюда в нужную severity-секцию.
3. Раз в ~4–6 коммитов / 2 недели — sync с кодом (rule 15) + при необходимости новый CONTEXT-REFRESH.

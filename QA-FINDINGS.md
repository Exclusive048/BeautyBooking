# QA Findings — МастерРядом (pre-launch self-QA)

Environment: dev (`npm run dev`, localhost:3000) · Chromium · Playwright MCP / `@playwright/test`
Method: exploratory self-QA. Findings only — fixes are separate, explicitly-instructed prompts.

## Severity scheme (aligned to BACKLOG.md)
- 🔴 Blocker — flow broken / pre-launch blocker → also queue into BACKLOG.md 🔴
- 🟠 High — major defect, flow degraded
- 🟡 Medium — works but wrong/confusing
- 🔵 Minor / cosmetic

## Finding row format
`QA-NNN · <surface> · <severity> · repro steps · expected vs actual · console/network errors · screenshot path · covered-by-test (yes/no)`

---

## Recon (QA-01) — login / OTP harness

- **OTP:** 6 digits (`crypto.randomInt(100000, 1000000)`). `OtpCode.codeHash` =
  `HMAC-SHA256(OTP_HMAC_SECRET, "<phone>:<code>")`. The DB stores **only the
  hash** — no plaintext. SMS is not wired in dev; the code is logged to the
  dev-server stdout (`logInfo("OTP requested", { code })`, masked phone) but
  the harness cannot tail that stream.
- **Read strategy chosen — brute-force the hash.** The harness reads the
  latest unused `codeHash` for the phone from the DB and recovers the plaintext
  by hashing all 900k 6-digit candidates (`<2s`). Self-contained, no log
  dependency. Exact DB read template:
  ```bash
  docker exec masterryadom-db psql -U master -d masterryadom -tA -c \
    "SELECT \"codeHash\" FROM \"OtpCode\" WHERE phone='<phone>' AND \"usedAt\" IS NULL AND \"expiresAt\" > now() ORDER BY \"createdAt\" DESC LIMIT 1;"
  ```
- **Rate limit:** `OTP_REQUEST_IP_LIMIT = 5 / 60s` per IP — exactly the role
  count. Harness runs single-worker, `retries:0`, and clears the Redis
  rate-limit keys before the run.

### Seed account → role map (all 5 seeded — none BLOCKED)

| # | Role | Phone (login id) | roles[] | Distinguisher | Expected landing |
|---|------|------------------|---------|---------------|------------------|
| 1 | Master (independent) | `+79991000000` | CLIENT, MASTER | Provider MASTER, `studioId` NULL (Anna Sokolova) | `/cabinet/master/dashboard` |
| 2 | Studio admin | `+79992000000` | CLIENT, STUDIO, STUDIO_ADMIN | Owner of Vision studio (Victoria Almazova) | `/cabinet/studio` |
| 3 | Master in studio | `+79993000000` | CLIENT, MASTER | Provider MASTER + `studioId` set + ACTIVE StudioMembership (Marina Lebedeva) | `/cabinet/master/dashboard` |
| 4 | Client | `+79995000000` | CLIENT | Pure client (Elena Petrova) | `/cabinet/profile` |
| 5 | Site admin | `+79994000000` | CLIENT, ADMIN | Platform admin | `/cabinet/profile` (see QA-002) |

- **Existing test infra:** none for e2e — Vitest (unit only); no
  `@playwright/test`, no `playwright.config.*`, no `e2e/` dir, no login fixture
  before this prompt.
- **OTP login the same in dev & prod:** phone OTP is the production login path
  (not a dev-only affordance). The dev-only affordance is the OTP code being
  *logged* — a pre-launch hardening item (see BACKLOG 🔴).

---

## Login smoke result — 5/5 PASS

Run: `npx playwright test` (single worker, retries:0) against dev localhost:3000.
Each role: fresh 1440×900 context → phone OTP login → lands on its correct
surface → storage-state saved to `.qa/auth/<role>.json`. Authoritative data in
`.qa/smoke-results.json`; screenshots in `.qa/screenshots/<role>.png`.

| # | Role | Login | Landed | Expected | Console errors | Failed requests |
|---|------|-------|--------|----------|----------------|-----------------|
| 1 | Master (independent) | ✅ PASS | `/cabinet/master/dashboard` | `/cabinet/master/dashboard` | 1 (QA-001) | 0 |
| 2 | Studio admin | ✅ PASS | `/cabinet/studio` | `/cabinet/studio` | 1 (QA-001) | 0 |
| 3 | Master in studio | ✅ PASS | `/cabinet/master/dashboard` | `/cabinet/master/dashboard` | 1 (QA-001) | 0 |
| 4 | Client | ✅ PASS | `/cabinet/profile` | `/cabinet/profile` | 1 (QA-001) | 0 |
| 5 | Site admin | ✅ PASS | `/cabinet/profile` | `/cabinet/profile` (QA-002) | 1 (QA-001) | 0 |

---

## Cross-cutting findings (login)

`QA-001 · /login (all roles) · 🟡 Medium · repro: open /login in a fresh
context (dev) → React emits a console **pageerror** "Hydration failed because
the server rendered HTML didn't match the client. As a result this tree will
be regenerated…" · expected: no hydration error · actual: fires on every
role's login (5/5), independent of the QA harness (reproduced with NO storage
seeding) · console: 1 pageerror per role · screenshot: .qa/screenshots/*.png ·
covered-by-test: yes (smoke captures it in consoleErrors).`
  - Impact: React recovers by regenerating the subtree, but input typed during
    that window is wiped (the harness had to retry phone entry until it stuck —
    a real user typing immediately on a slow first paint could lose a keystroke).
  - **Must verify against a production build** — dev mode double-renders and is
    noisier about hydration; this may be dev-only OR a genuine SSR/CSR divergence
    on the login page (stats numbers / brand logo / framer-motion / theme).
    See the BACKLOG 🔴 "prod-build smoke subset" watch-item.

---

## 1. Master (independent)
- **Login smoke: ✅ PASS** — `+79991000000` → `/cabinet/master/dashboard`.
  Storage-state saved (`.qa/auth/master.json`). No failed requests. Console:
  QA-001 only.
### QA-05 — Master cabinet breadth deep-test (2026-06-15, Playwright MCP, dev server)

**Headline: the master cabinet is in good shape — every surface loads with 0
console errors, the client→master booking lifecycle (confirm / decline / cancel)
works and is graceful, and schedule-edit cache invalidation holds (rule 5 PASS).**
3 findings: QA-113 (server-local-time formatting 🟠), QA-112 (dashboard copy/calc
🔵), and master-side confirmation of QA-111 + the full QA-109 scope. Subject:
Анна Соколова (`+79991000000`). Server: **dev** (QA-101 jest-worker did not
reproduce — all master surfaces 200). Anna's 4 seeded PENDING bookings exercised
the confirm/decline flow (no setup needed). Evidence: `.qa/diagnostics/qa05-master/`.

**Surfaces swept (all 0 console errors):** dashboard, bookings (kanban),
schedule (week), schedule/settings (5 tabs), services, clients, reviews,
notifications, messages, profile.

**Phase results:**
- **Dashboard ✅** — loads, prices CORRECT (Выручка сегодня 7 000 ₽ / неделю 13 500 ₽
  — ÷100, not inflated). Minor oddities → QA-112.
- **Bookings ✅** — kanban 5 columns / 38 total; prices CORRECT (4 000 / 8 000 ₽;
  header В ожидании 27 000 ₽). **Confirm**: clicked Подтвердить on Виктория Петрова
  → DB anna-01 PENDING→CONFIRMED, header totals updated (27000→23000 / 32000→36000),
  PENDING 4→3 / CONFIRMED 9→10 — end-to-end PASS. **Decline**: opens a
  ModalSurface "Отклонить запись" with required "Причина отказа" (submit disabled
  until reason entered) — graceful; not completed. CHANGE_REQUESTED card correctly
  shows "Запрос переноса отправлен" (no confirm/decline); in-progress card has
  disabled Перенести/Отменить.
- **Schedule + cache invalidation ✅ (rule 5 PASS)** — week view loads, Sunday
  "Выходной". Verified the slot engine applies exceptions (read-only): June 22
  ("не работаю") → 0 slots; June 28 (Sun-off + "10–14" short-day exception) → 7
  slots 10:00–13:00 (override + truncation correct). **Edit test:** added a
  day-off exception for Wed June 24 via UI → `ScheduleOverride OFF` created + public
  slots dropped **16→0 immediately**; deleted it → slots restored to 16. Cache
  invalidates on both add and delete.
- **Settings ✅ (persist)** — Правила values match DB (minBookingHoursAhead=2,
  maxBookingDaysAhead=60, autoConfirm=f, cancellationDeadlineHours=4,
  lateCancelAction=reminder, slotPrecision=exact). slotStepMin change saved (DB=15).
- **Services ✅ (price boundary correct)** — created "QA Boundary Test 1234" with
  price field labeled "Цена, ₽" = 1234 → stored **123400 kopecks** (×100 correct),
  displayed "1 234 ₽". No mis-storage. Test service deleted. Services list prices
  all CORRECT (8 000 / 2 000 ₽; package "Сумма 8 500 ₽ · −15% · Итого 7 225 ₽").
- **Cancel (Phase 6) ✅ graceful** — confirmed bookings have Отменить → opens
  "Отменить запись" modal, "Причина отмены" required (submit disabled until filled);
  not completed. See lateCancelAction verdict below.
- **Clients ✅** — prices CORRECT (LTV 61 000 ₽, avg 3 813 ₽ — master CRM uses
  `priceLabel`, NOT inflated).

**lateCancelAction verdict:** `lateCancelAction=reminder`. The Правила tab exposes
it as "После — статус" with 3 options — **ничего / напоминание / отметить в CRM**
(none / reminder / CRM-flag). **There is no payment "fine" option in the UI**, so
the BACKLOG "`lateCancelAction === 'fine'` not enforced" concern is **moot from the
product surface** (a master cannot select a fine). lateCancelAction governs the
consequence when a CLIENT cancels after the free-cancel deadline; the master's own
cancel is a separate authority path (graceful reason-modal) and does not invoke it.
A full client-late-cancel behavioral test belongs to a client-side pass.

**QA-111 — CONFIRMED master-side.** Changed slot step 30→15 in settings → DB
persisted `slotStepMin=15`, but the offered public slot grid stayed **30-min**
(10:00, 10:30, 11:00… no 10:15/10:45). The setting is inert (slots.ts:69 hardcodes
30). Reverted to 30. So the master can pick 15/30/60 but only 30 is ever produced.

`QA-112 · /cabinet/master/dashboard · 🔵 Minor · two display/calc oddities on the
KPI tiles: (1) "Записей сегодня 3 из 0ч · загрузка дня" — the day-capacity shows
"0ч" (load denominator computed as 0 hours); (2) "Выручка сегодня 7 000 ₽ · vs
прошлая суббота" — the comparison baseline is "last Saturday" while today is Monday
(odd/unstable comparison label). Cosmetic; dashboard otherwise renders cleanly with
correct prices. May be partly TZ-related (today-boundary) — see QA-113/QA-107. ·
screenshot: .qa/diagnostics/qa05-master/dashboard.png · covered-by-test: no.`

`QA-113 · master booking-time labels (server-side formatting) · 🟠 High
(PROD-host-dependent) · repro: master bookings kanban + schedule render Виктория
Петрова (DB startAtUtc=2026-06-15 11:00 UTC) as "14:00" — i.e. UTC+3 (Moscow),
NOT the provider's Asia/Almaty (+5 would be 16:00). · root cause:
src/lib/master/bookings.service.ts:83 `formatWhenLabel` formats with
`date.getHours()/getMinutes()/getDay()/getDate()` — plain JS local-time methods
that use the **Node server process's system timezone**, with NO conversion to a
provider/viewer timezone (the JSDoc "computed against the master timezone" is
inaccurate — there is no TZ arg). On this dev host (system TZ Europe/Moscow) labels
come out MSK; **on a typical Linux prod host (UTC) the same labels would render in
UTC** → every master would see booking times shifted (Moscow −3h, Almaty −5h). This
is environment-dependent correctness, not a display-target preference. Likely also
in dashboard.service.ts (same pattern). Distinct from the QA-107 per-viewer feature
gap. · caveat: confirmed only against the MSK dev host; MUST be confirmed against a
UTC prod build to see the wrong offset. · covered-by-test: no.`

**QA-113 — FULL server-side scope (grep audit, QA-06).** All sites use JS
local-time `Date.get*` (process TZ) instead of TZ-aware `Intl.DateTimeFormat({ timeZone })`.
On the UTC prod host these compute against UTC → wrong day/time boundaries + labels
for RU/KZ users. **Server-side offenders (display/grouping — fix these):**
- `lib/master/bookings.service.ts:83` `formatWhenLabel` — booking time labels (the original).
- `lib/master/schedule.service.ts:103` — `getHours()*60+getMinutes()` → booking offset/position in the master schedule grid.
- `lib/master/model-offers-stats.ts:64-68` — model-offer date/weekday DISPLAY label (`getDate/getMonth/getDay/getFullYear`).
- `lib/master/model-offers-view.service.ts:661-663` — builds `YYYY-MM-DD` date key from a Date (`getMonth/getDate`) for grouping.
- `lib/master/notifications.service.ts:60-62` — "today" same-day grouping (`getFullYear/getMonth/getDate`).
- `features/studio-cabinet/notifications/server/notifications-data.service.ts:67-69` — same "today" grouping (studio side).
- `lib/master/schedule-utils.ts:41-43,49,58-60` — `YYYY-MM-DD` date keys + week-offset math from a Date.
- `lib/master/reviews-stats.ts:40,44` — month bucketing for stats (boundary-only; lower priority).
- `features/master/components/master-dashboard-page.tsx` (server component) — dashboard greeting / "today" likely same pattern — **verify**.
**Negligible / benign (not offenders):** `lib/email/templates/{notification,otp-code}.ts` (copyright `getFullYear()` only); `lib/bookings/recent-masters.ts:62` (`setMonth` cutoff arithmetic, not display).
**Client-only (browser TZ, NOT this bug class):** the ~20 `.tsx` modals/dialogs/tabs
+ client lib helpers (reschedule-modal, manual-booking-modal, exception-modal,
create/move-booking-dialog, when-step, exceptions-tab, client-reschedule-modal,
group-by-month/day, time-greeting, chat/format-time, date-preset-chips, plan-card,
FooterCopyright). Comprehensive fix = format all SERVER-side sites with an explicit
`timeZone` (the viewer's, per QA-107) instead of `Date.get*`.

**QA-07 — TZ=UTC diagnostic (2026-06-15): is QA-113 a prod booking-integrity 🔴 or a cosmetic 🟠?**
Ran the dev server under **`TZ=UTC`** (prod-like Linux host; confirmed `Intl…timeZone=UTC`,
offset 0; fresh server PID, verified active by the label shift below) and compared to the
MSK-host baseline. **Verdict: QA-113 stays 🟠 — NOT a 🔴.** No bookable availability or
day-boundary shift; the damage is display + grouping (all master-facing times render in
UTC on the prod host).

| Category | UTC-host result vs MSK baseline | Verdict |
|---|---|---|
| **Schedule / availability** (slots API, `/u` booking grid) | Galina Wed 17: first slot **10:00** (`startAtUtc 07:00Z`), last **18:00** (`15:00Z`), 17 slots — **IDENTICAL** to MSK. Sunday 21 day-off = **0 slots** (no UTC-boundary misfire). The slots route resolves against the provider's explicit `timezone: Europe/Moscow` (engine `slots.ts` uses TZ-aware helpers, not `Date.get*`). | **TZ-SAFE ✅** — no shift |
| **"today" groupings** (dashboard, notifications) | Mid-day "Записей сегодня" **count unchanged (3)** — mid-day bookings stay in the same calendar day under both TZ. But process-TZ-derived: greeting flipped (host-time), and the day-capacity denominator shifted **"0ч"(MSK)→"10ч"(UTC)** (QA-112 is partly TZ/time-driven). | **process-TZ** — count stable for mid-day; near-midnight bookings (22:00–23:59 UTC) WOULD misbucket the "today" group on a UTC host (no such seeded booking to demo directly) |
| **Display labels** (master kanban, dashboard attention, schedule week grid) | Виктория Петрова (`startAtUtc 11:00Z`): kanban + attention + grid all show **"11:00"** under UTC (was **"14:00"** on MSK). Сергей (`14:00Z`) → "14:00" (was "17:00"). Master schedule grid card **positions** also shift (11:00–12:30 vs 14:00–15:30). | **SHIFT confirmed 🟠** — every master-facing time renders in UTC on the prod host |
| **Booking happy-path** | Not re-run E2E under UTC, but: availability is TZ-safe (row 1), `startAtUtc` storage is TZ-agnostic, and the public widget renders times in the **browser** TZ (client-side, unaffected by server TZ). | **Holds** — client booking unaffected by server host TZ |

**Final severity: 🟠 (display + grouping batch), NOT 🔴.** The public availability engine is
TZ-safe, so on the UTC prod host clients are still offered the correct slots and bookings store
correct UTC — **no booking-integrity / data corruption.** HOWEVER this is a **high-impact 🟠 / strong
pre-launch fix**: on the UTC prod host EVERY master-facing time (bookings kanban, dashboard
attention, schedule week grid labels + card positions) renders in **UTC instead of the master's
local time** — a master could misread when an appointment is (real-world no-show risk), and "today"
groupings/greeting/capacity compute against UTC. The MSK dev host hid all of this (QA-108 masking
pattern). Evidence: `.qa/diagnostics/qa07-tz-utc/schedule-grid-utc-shift.png`. Fix scope unchanged
(the server-side `Date.get*` list above); the diagnostic only sets priority, not the fix surface.

**QA-107 (TZ) — observations (NOT finalized; rendering feature is a BACKLOG item):**
- **Data-consistency check → NOT a bug.** Anna's `timezone=Asia/Almaty` is
  consistent with her address ("ул. Достык, 89, Медеуский район" = Almaty, KZ). Her
  TZ is correct data; only the rendering model applies. NOTE: her `cityId` is NULL
  (no City FK; address+TZ are coherent Almaty regardless).
- **Rendering baseline (per the TZ model note — recorded, not filed per-surface):**
  the app does NOT render Anna's surfaces in her provider (Almaty) TZ as the prompt
  assumed. Two distinct mechanisms observed: (a) **client-side** surfaces use
  `getViewerTimeZone()` = the **browser's** `Intl` TZ (fallback Europe/Moscow) — NOT
  derived from the viewer's profile city; (b) **server-side** labels use the server
  **process** TZ (QA-113). This session both were Europe/Moscow (browser TZ = MSK,
  dev host = MSK), so everything showed MSK. **Per-viewer-CITY rendering is not
  implemented** (it's browser-TZ / host-TZ incidental). → single BACKLOG item.

**Mobile:** deferred (breadth pass; desktop surfaced no master-cabinet blockers,
only QA-112 🔵 + QA-113 🟠 which is host-TZ not layout). Defer to a later pass.

- _(feature findings added by the Master deep-test prompt)_

## 2. Studio admin
- **Login smoke: ✅ PASS** — `+79992000000` → `/cabinet/studio`.
  Storage-state saved (`.qa/auth/studio-admin.json`). No failed requests.
  Console: QA-001 only.
### QA-08 — Studio admin cabinet breadth pass (2026-06-15, Playwright MCP, dev server)

**Headline: the studio admin cabinet is in good shape — the two priority checks both
PASS. The QA-06 approval loop closes correctly (Victoria sees + approves Marina's
request; her live schedule updates faithfully), and cross-tenant security HOLDS (no
leakage across studios). No new blockers; the only fresh items are positive
confirmations + QA-109/113 rolled in.** Subject: Виктория Алмазова (`+79992000000`,
STUDIO_ADMIN, owner of Vision Beauty Studio — 8 members: Victoria OWNER/ADMIN + 7
masters incl. Marina). Server: **dev** (all studio surfaces 200, 0 console errors).
Baseline restored first (reset `seed-vision-scr-01` to fresh PENDING).

**Phase 1 — schedule-change-request approval loop ✅ (closes QA-06):**
- **Admin DOES surface pending requests** (the QA-114 counterpart): nav "Заявки" **badge
  "2"** + dashboard "Заявок на расписание: 2" + a full `/cabinet/studio/schedule-requests`
  list (each request shows the proposed weekly grid + exceptions + comment + Подтвердить/
  Отклонить). **Sharp contrast with the master side (QA-114), which gave zero feedback.**
- **Approve applied correctly to Marina's LIVE schedule.** Clicked Подтвердить on Marina's
  request → confirmation dialog ("Расписание мастера Марина Лебедева будет обновлено сразу…")
  → confirmed. Result: `seed-vision-scr-01` → **APPROVED**; pending count 2→1; nav badge →1;
  request moved to "Недавние решения · Подтверждена". Marina's live `WeeklyScheduleDay`
  changed to **weekday 1=off, 2–7=on** = (ISO `1=Mon..7=Sun`) **Monday off, Tue–Sun on** =
  **exactly the request** ("Пн Выходной, Вт–Вс 10:00–19:00"). ✅
- **Weekday convention clarified (NOT a bug):** the engine reads `WeeklyScheduleDay.weekday`
  as **ISO 1=Mon … 7=Sun** (`engine-context.ts:90` maps JS Sunday(0)→7). Anna's reference
  data confirms (weekday 7 = her Sunday-off). An initial "data corruption" read was a
  convention misread — the apply is correct.
- **Cache invalidation:** live schedule (source of truth) updated correctly; Redis was
  flushed pre-test; slot-cache invalidation uses the same `invalidateSlotsForMaster` path
  verified in QA-05. (Marina has 0 services, so per-slot availability couldn't be re-queried
  directly — verified at the schedule-data layer instead.)
- **Reject path:** not exercised (the 2nd pending request belongs to Елена Корнеева — left
  intact to avoid over-mutating; reject UI button present). Master-decision notification not
  re-checked from Marina's side (breadth).

**Phase 7 — cross-tenant security ✅ HELD (no leakage):** probed studio per-id endpoints as
Victoria (browser carries her session) with another studio's ids:
| Probe | Result |
|---|---|
| Own studio (Vision model id) + own master (Marina) — control | **200** ✅ |
| **Foreign studio (Студия Аура) + Аура master** | **403** ✅ denied |
| **Foreign studio (Аура) + own (Vision) master** | **403** ✅ denied |
| **Own studio (Vision) + foreign (Аура) master** — id-confusion | **404** ✅ no leak |
`ensureStudioRole({ studioId, userId })` denies any studio Victoria isn't a member of (403);
a foreign master id under her own studioId yields 404 (lookup scoped to her studio). The
secure "client-supplies-id, server-authorizes" pattern. (Studio **model** id is the scoping
key; the studio's **provider** id → 404.)

**Phase 3 — dashboard ✅:** rich aggregate KPIs (Выручка 30d, Записей 30d, Загрузка студии,
Клиенты, per-master revenue), studio name shown ("Сегодня в студии Vision Beauty Studio"),
0 errors. **Prices CORRECT** ("176 000 ₽" 30d, "5 333 ₽" avg, per-master figures — ÷100, not
inflated; studio cabinet uses `priceLabel`). "today"/greeting = process-TZ → rolls into QA-113.

**Phase 4 — services ✅:** "Услуги студии" — studio admin manages a **central price list**
("Общий прайс. Мастера могут добавлять свои услуги") + Добавить услугу/Категория/Создать пакет.
**Hybrid control:** studio-central services + per-master additions (matches QA-06 where Marina
could add her own). New studio-cabinet services page uses `priceLabel` (clean). The legacy
QA-109-inflated `studio-services-page.tsx` is a deprecated sub-route, not in the main nav.

**Phase 5 — public studio profile ✅ + QA-109 confirmed:** `/u/vision-studio` renders (0 errors),
shows **all 7 member masters** ("Мастера студии") and service prices correctly (3 500–7 500 ₽).
**QA-109 confirmed live here:** the priceFrom shows **"от 130 000 ₽"** (DB `priceFrom=130000`
kopecks via `details-section.tsx:67` `moneyRUB`, no ÷100 — should be "от 1 300 ₽"). Rolled into QA-109.

**Phase 6 — settings ✅:** `/cabinet/studio/settings` renders (Название, Адрес и местоположение,
Уведомления и связь, Опасная зона) with editable fields, 0 errors. Did not exhaustively
save-persist test (breadth).

**TZ + data check:** Vision provider `timezone=Asia/Almaty` consistent with its Almaty address
("ул. Жибек Жолы, Алмалинский район"); `cityId` NULL. **Not a data bug** (same pattern as
Anna/Marina). Surfaces render MSK/process-TZ → rolls into QA-107/QA-113.

`QA-116 · WeeklyScheduleDay weekday convention drift (seed vs engine) · 🔵 Minor (latent) ·
the bulk/showcase seed (seed-providers.ts) writes `weekday` as **0–6 (0=Sunday)**, but the
engine + editor/apply path use **ISO 1–7 (7=Sunday)** (`engine-context.ts:90`, `unified.ts:162`).
For the standard "Mon–Sat working, Sunday off" pattern this is benign — weekday 1–6 align in
both conventions, and Sunday-off coincides with the engine's default-off when no weekday-7 row
exists (QA-04 confirmed Galina's Sunday=0 slots works). Once a master's schedule is saved via
applyScheduleSnapshot / approved (QA-08), their rows migrate to 1–7. Latent risk only if a
seed master were configured to WORK Sundays (seed weekday-0=on would be ignored by the engine).
No current user impact; seed should write 1–7 to match the engine. · covered-by-test: no.`

- _(feature findings added by the Studio-admin deep-test prompt)_

## 3. Master in studio
- **Login smoke: ✅ PASS** — `+79993000000` → `/cabinet/master/dashboard`
  (correctly a master surface, not a studio one — Marina is a MASTER member,
  not a studio admin). Storage-state saved (`.qa/auth/master-in-studio.json`).
  No failed requests. Console: QA-001 only.
### QA-06 — Master-in-studio DELTA pass (2026-06-15, Playwright MCP, dev server)

**Headline: the one enforced studio delta — the schedule-change-request /
approval flow — WORKS correctly (Marina cannot bypass it). The gaps are
UX/visibility: the approval state is computed server-side but never surfaced in
the settings UI (QA-114), and the studio affiliation is invisible on both her
cabinet and public profile (QA-115).** Subject: Марина Лебедева (`+79993000000`,
studio member of **Vision Beauty Studio**, StudioMembership ACTIVE/MASTER,
`ownerUserId` = her own → ACTIVE per invariant #24). Server: **dev** (all surfaces
200, public profile + cabinet 0 console errors). Baseline restored from
post-seed.dump first.

**Phase 2 — schedule approval flow ✅ WORKS (the key delta).**
- Edited Marina's weekly hours (Часы tab: Sat end 19:00→17:00, then Sat toggled
  off). Two `PATCH /api/cabinet/master/schedule` → **200 OK**, but the **live
  schedule did NOT change** (DB `WeeklyScheduleDay` weekday=6 still active 10:00–19:00)
  and **no new SCR was created**. The response `approval` block explains it:
  `{ mode: "STUDIO_MASTER", requestStatus: "PENDING", pendingRequestId:
  "seed-vision-scr-01", lastAction: "REQUEST_UPDATED" }`. The edit was routed into
  the **existing pending ScheduleChangeRequest** (amended it, not duplicated). DB
  confirms: `seed-vision-scr-01` payload now carries Marina's change
  (`weekSchedule[5]` Sat → isWorkday:false, endTime 17:00), status PENDING.
- **Marina cannot bypass approval** — her edits never touch the live schedule;
  they accumulate in the change request awaiting studio-admin action. ✅
- **Weekday convention (NOT a bug):** the API uses **Monday-first** `dayOfWeek`
  (0=Mon … 5=Sat, 6=Sun) in both request and response; the DB uses **Sunday-first**
  `weekday` (0=Sun … 6=Sat). The two layers translate consistently (live schedule
  reads correctly Mon–Sat on / Sun off in both). Recorded so a future reader isn't
  alarmed comparing the PATCH payload to raw DB rows.
- **HANDOFF → studio-admin pass:** pending request **`seed-vision-scr-01`**
  (provider=Marina `cmprgovmw0187vlaks8by9ewr`, studio model `cmprgovm2017yvlak08ch3k68`
  = Vision), now UPDATED with Marina's proposed Saturday-off change. Approve/reject
  it from Victoria's cabinet. (This mutation reverts on snapshot restore.)

**Permission deltas (Phase 3):**
- **Services NOT studio-locked.** Marina's `/cabinet/master/services` shows the
  empty state + an enabled "Добавить услугу" button — same self-service capability
  as an independent master (Anna). No "studio-controlled / read-only" gating. (She
  has 0 seeded services — the showcase seed attached services to the studio
  provider, not to member masters.) Whether services *should* be studio-governed is
  a product question — recorded, not assumed.
- Schedule (Часы/Исключения) is the only surface that routes through approval;
  bookingRules + visibility came back in the normal response shape.

**Phase 4 — bookings:** Marina has **0 incoming bookings** (seed gave her none),
so confirm/decline could not be re-exercised. No studio routing is evident in the
booking path (bookings target the master's own provider id). Lifecycle already
validated in QA-05.

**TZ baseline (per QA-107 model):** Marina's surfaces render in **MSK** (browser/
host TZ), same as Anna — NOT her provider's Almaty TZ. **Data check → NOT a bug:**
`timezone=Asia/Almaty` is consistent with her address ("ул. Жибек Жолы, 75,
Алмалинский район" = Almaty, KZ); `cityId` is NULL (same as Anna). Rolls into the
single QA-107 BACKLOG item.

**Schema note (🔵):** `Provider.studioId` stores the studio's **provider** id
(`cmprgovlu017…`), not the `Studio` model id (`cmprgovm2017…`). Consistent but a
query footgun — noted, not a user-facing bug.

`QA-114 · master schedule settings (studio member) · 🟠 High · repro: log in as a
studio master (Marina), open /cabinet/master/schedule/settings, edit any hours/day
· expected: clear indication that the change needs studio approval + that it's now
pending (and that the live schedule is unchanged) · actual: the settings UI is
presented as freely self-editable with **no banner, no "requires studio approval"
note, no pending-request badge, and no save-status chip**. The edit silently routes
into the pending ScheduleChangeRequest (PATCH 200, response carries a full
`approval` block: mode=STUDIO_MASTER, requestStatus=PENDING, pendingRequestId), but
the UI **ignores that block** — Marina sees her draft change on screen and gets
zero feedback, so she would reasonably believe it applied. It did not (live
schedule unchanged; awaits studio-admin approval). The approval flow is correct
data-wise (QA-06 Phase 2); this is purely the missing UX surfacing. · root cause:
the schedule-settings UI doesn't render the server's `approval` state (mode /
requestStatus / pendingRequestId / rejectedComment / lastAction). · covered-by-test: no.`

`QA-115 · studio affiliation invisibility (studio master) · 🟡 Medium · repro:
view Marina's master cabinet dashboard AND her public profile (/u/vision-marina-lebedeva-1)
· expected: some indication she belongs to Vision Beauty Studio (team/branding on
cabinet; "часть студии Vision" / studio link on the public profile) · actual:
**neither surface mentions the studio at all** — no "Vision", no "студия". A studio
member is visually indistinguishable from an independent master, both to herself in
the cabinet and to clients on her public profile. May be an intentional
master-centric design, but flagged: for a studio member the total absence of studio
context (esp. on the public profile, where clients can't tell she's studio-backed)
is likely a gap. · covered-by-test: no.`


## 4. Client
- **Login smoke: ✅ PASS** — `+79995000000` → `/cabinet/profile`.
  Storage-state saved (`.qa/auth/client.json`). No failed requests. Console:
  QA-001 only.

### QA-02 — Discovery → booking funnel (Playwright MCP, live browser, 2026-06-06)

**Headline: the client conversion funnel is non-functional in this env.**
Discovery (catalog) crashes, every master profile + booking page 500s, so a
real client cannot view a master or open the booking widget. The booking
*backend* (POST /api/bookings), tested directly, is sound (all data-integrity
anchors hold). Method: MCP browser as guest + logged-in Elena (fresh OTP login;
session later expired), DB snapshot at `.qa/snapshots/pre-client.dump`, plus
API probes for anchors the UI blocked.

**Subject for booking probes:** Галина Степанова (`galina-stepanova-26`,
Europe/Moscow, Mon–Sat 10–19, min 2h / max 90d, autoConfirm=false) — a clean
master with no picsum media so DB-level probing isn't masked by QA-102.

---

`QA-101 · /u/[username] + /u/[username]/booking + /api/public/providers/[id]/slots · 🔴 Blocker ·
repro: navigate to ANY master profile (e.g. /u/galina-stepanova-26) or its
booking page, or GET the public slots API · expected: page renders / slots 200 ·
actual: 500 on every master (galina, anna, darya, alyona, zhanna — 5/5; profile
+ booking + slots API all 500). Dev log: ⨯ "Jest worker encountered 2 child
process exceptions, exceeding retry limit", page:'/u/…' / '/api/public/providers/…/slots'.
Crash is image-independent (galina has 0 picsum, still 500) and auth-independent
(curl with no session 500s) and occurs DURING COMPILATION (compile:6.2s → 500) —
i.e. a module-load crash, not runtime logic. Even early-validation paths 500
(no serviceId → 500 instead of 400 SERVICE_REQUIRED). · root-cause localisation:
the crashing routes are exactly the ones that import the schedule slot engine
(`listAvailabilitySlotsPaginated` from @/lib/schedule/usecases, + the profile/
booking pages that SSR slots); routes that DON'T (`/`, `/catalog` SSR, /api/me,
/api/cities, /api/catalog/search, /api/hot-slots, POST /api/bookings) all 200.
The real child exception is masked by the dev jest-worker wrapper (not in the
stdout log; surfacing it needs a prod build — out of scope per guardrails). ·
caveat: manifests as a DEV jest-worker error — MUST be confirmed against a
production build to know if it's a genuine module-graph throw (breaks prod) or a
dev-worker/Windows/Node instability. Route-specificity (every slot-engine route
500s while everything else 200s) strongly indicates a genuine route-level defect,
not generic dev flakiness. · console: 2 errors (500 + WorkerError) per profile;
catalog client shows next-image error separately (QA-102) · screenshot:
.qa/screenshots/qa-client-catalog-crash.png (catalog), profile/booking are bare
500 pages · covered-by-test: yes (.qa/specs/client/funnel-blockers.spec.ts
QA-101, test.fail guard).`

`QA-102 · /catalog (+ any catalog search) · 🔴 Blocker · repro: open /catalog or
/catalog?q=… → one card with a picsum.photos portfolio image renders · expected:
catalog lists masters · actual: hard Runtime Error "Invalid src prop
(https://picsum.photos/seed/anna-br-02/640/640) on next/image, hostname
picsum.photos is not configured under images in next.config.js" → the route's
error boundary swallows the WHOLE page ("Что-то пошло не так"). Two layers:
(1) app-resilience — src/components/ui/focal-image.tsx:84 + catalog-card.tsx:172;
a single bad image host crashes the entire catalog route instead of degrading
per-card; (2) config/seed — next.config.ts images.remotePatterns allows only
storage.yandexcloud.net, but the seed's only picsum source is PortfolioItem.mediaUrl
(6 items, all Anna's). Anna is the showcase master + appears on default sort, so
plain /catalog dies; she also surfaces for unrelated queries because of QA-104.
Crashes on desktop immediately and on mobile once cards render (lazy images). In
prod with real S3 data the host would be configured, but the per-card-resilience
gap is a genuine production risk (any one bad/unconfigured image host = whole
catalog down). · console: 3 errors (next-image invalid-src + 2) · screenshot:
.qa/screenshots/qa-client-catalog-crash.png · covered-by-test: yes
(funnel-blockers.spec.ts QA-102, test.fail guard).`

`QA-103 · GET /api/catalog/search (public) · 🟠 High (rule-12 / pre-launch) ·
repro: GET /api/catalog/search?limit=20&page=1 · expected (CLAUDE.md rule 12):
public/catalog responses use publicUsername/publicCode, never internal CUID id ·
actual: every data.items[] entry carries BOTH "publicUsername" AND internal
"id":"cmprgov5t014nvlakz0n9vn00" (20/20 leak internal CUIDs). Pagination is
page-based (totalCount 43, totalPages 3) so no id-in-cursor; nextCursor unused.
The UI navigates by publicUsername (cards → /u/<publicUsername>), so the id is
"extra payload" not "id in URL", but rule 12 forbids returning internal id at
all on a public endpoint. · response saved .qa/snapshots/catalog-search-response.json
· covered-by-test: yes (funnel-blockers.spec.ts QA-103, test.fail guard).`

`QA-104 · home hero search + home category tiles + footer "Мастера рядом" →
/catalog · 🟠 High · repro: home hero "Какая услуга?" → "Найти мастера" navigates
to /catalog?q=маникюр · expected: catalog filters by the typed service · actual:
the catalog reads searchParams.get("serviceQuery")/"globalCategoryId"/"availableToday"
(catalog-page-client.tsx:216-226) but external deep-links use different names —
hero builds ?q= (hero-section.tsx:57), category tiles ?category=<slug>
(popular-categories-section.tsx:95), footer ?available=today. The network call is
/api/catalog/search?limit=20&page=1 with NO q → the query is dropped end-to-end;
the primary "I need a service now" entry point does nothing (Anna, who has no
haircut, still appears for ?q=стрижка). No server remapping (catalog-page.tsx).
The catalog's OWN in-UI search/filters use the correct names and work; only
home/footer deep-links are broken. Backend filter itself is correct: API with
serviceQuery=стрижка narrows 43→14 and excludes Anna (verified via curl). ·
covered-by-test: yes (funnel-blockers.spec.ts QA-104, test.fail guard).`

`QA-105 · catalog prices + price filter (bulk-seeded providers) · 🟡 Medium
(seed data) · repro: home "Топ мастеров" / catalog cards show "Окрашивание бровей
хной · от 28 ₽" · expected: realistic prices · actual: bulk-seeded Service.price
holds ruble-scale values in the kopecks field (Zhanna henna = 2794 → rendered
"28 ₽" after the correct /100 kopecks→rubles format). Nearly every catalog price
a client sees is 100× too cheap. Anna's showcase services use correct kopecks
(250000 → 2500₽), so the app formatting is right — the bulk seed generator is the
culprit. Knock-on: price filter is unusable (priceMin=3000–9000₽ → 0 results;
priceDistribution buckets 1000–24267 are nonsensical). Bad demo/QA optics; not an
app-logic defect. · covered-by-test: no.`

**✅ QA-105 — RESOLVED in FIX-02 (2026-06-14).**
- Root cause confirmed: `data/service-templates.ts` declares `priceMin/priceMax`
  in **RUB**; the bulk generator wrote them straight into `Service.price`, which
  is **kopeks** (app `UI_FMT.priceLabel` divides by 100; showcase seed already
  uses kopeks — Anna `250000` → 2500 ₽). The app formatter was correct; the bulk
  seed generator was the culprit.
- Fix: `seed-providers.ts` `ensureServices` converts to kopeks at write time
  (`rng.int(t.priceMin, t.priceMax) * 100`); comments added in both files. Bulk
  range now 1000–14000 ₽ (price filter + `priceDistribution` become sane).
  `Provider.priceFrom` + booking `priceSnapshot` inherit the corrected kopeks
  value (no double-conversion). **Showcase seed (Anna) untouched** —
  prices/timezone unchanged. Static proof + before/after in
  `.qa/diagnostics/fix-02/EVIDENCE.md`.
  - **✅ VERIFIED LIVE (QA-04, 2026-06-15):** re-seeded; profile + booking widget
    + success card show correct ÷100 prices (Galina "Стрижка мужская 2 180 ₽").
    NOTE QA-04 found the data fix exposed **QA-109** — catalog/cabinet/favorites
    surfaces use `moneyRUB` (no ÷100) → 100× inflated there. The QA-105 *data* fix
    is correct; QA-109 is a separate formatter bug.

`QA-106 · POST /api/bookings off-schedule rejection copy · 🔵 Minor · repro:
create a booking on a day-off (Sun) or off-hours (02:00 MSK) for Galina via the
create API · expected: a "outside working hours / not available" message ·
actual: rejected (good) but with SLOT_CONFLICT "Окошко уже занято. Обновите
расписание…" — implies someone took the slot when really it's outside the
schedule. Functionally safe (booking blocked); message is misleading. Real users
via the (broken) slots UI wouldn't see off-schedule slots offered. · covered-by-test: no.`

`QA-107 · Anna Sokolova timezone · 🟡 Medium (data / known T4) · Provider.timezone
for the showcase master anna-sokolova is "Asia/Almaty" while the platform default
is Europe/Moscow (schema-default drift, CONTEXT T4). A Moscow client booking Anna
would see Almaty-based slot times. Couldn't verify display (QA-101 blocks her
pages). Bookings store startAtUtc in UTC correctly (rule 8). · covered-by-test: no.`

`QA-001 (cross-cutting) confirmed on /login during this run — hydration pageerror
fires; consent checkbox/phone needed slow per-key typing (pressSequentially) to
register, matching the QA-001 note. No new instance on funnel forms (couldn't
reach them — booking UI 500s).`

#### Phase 3 booking anchors — explicit PASS / FAIL

| # | Anchor | Verdict | Evidence |
|---|--------|---------|----------|
| 1 | Offered slots reflect real schedule (no past, hours) | ⛔ BLOCKED (UI) / ✅ logic | slots API 500 (QA-101); but create API rejects past/too-soon (BOOKING_TOO_SOON) + off-hours (QA-106) → schedule logic is sound |
| 2 | Slot consumed after booking | ✅ PASS (API) | re-book a just-booked slot → 409 SLOT_CONFLICT; no duplicate row. `.qa/specs/client/booking-integrity.spec.ts` |
| 3 | Double-booking prevented | ✅ PASS (API) | same slot, diff key+phone → 409 SLOT_CONFLICT; partial overlap also 409; idempotency → 1 row for 2 same-key POSTs |
| 4 | Confirmation shows correct service/master/price/date; TZ local, stored UTC | ⛔ BLOCKED (UI) / ◑ partial | booking page 500 (QA-101); create API returns correct service id + startAtUtc stored as exact UTC (rule 8). TZ display unverifiable |
| 5 | Booking appears in client's bookings list | ⛔ BLOCKED | Elena session expired; probe bookings were guest. Cabinet bookings list not exercised (out of scope + funnel blocked upstream) |

Screenshots: `.qa/screenshots/qa-client-catalog-crash.png`,
`.qa/screenshots/qa-client-home-mobile.png`. API response capture:
`.qa/snapshots/catalog-search-response.json`.

#### Enforcement-gap probes (BACKLOG flagged "not enforced")
- **minBookingHoursAhead** → **HELD** (enforced): create <2h ahead → 400 `BOOKING_TOO_SOON`. BACKLOG's "not enforced" is stale for the create path (BOOKING-WIDGET-A's `assertBookingWindow` works).
- **maxBookingDaysAhead** → **HELD**: >90d → 400 `BOOKING_TOO_FAR`.
- **slotPrecision / lateCancelAction** → not reachable (slots UI 500; no cancel flow tested). Unverified.
- Off-schedule (day-off / night) create → blocked via SLOT_CONFLICT (QA-106).

#### What worked (positives)
- Home page renders clean (desktop + mobile, 0 console errors), search-forward
  per the product thesis.
- Backend catalog filter narrows correctly (serviceQuery 43→14, Anna excluded).
- Booking create data-integrity is robust: conflict/overlap detection,
  idempotency, min/max-hours window, off-schedule rejection — no half-bookings on
  any rejected attempt.

#### Phase 4 (rebooking / favorites) — ⛔ BLOCKED
Favorites + rebook live on the crashing catalog cards / 500 profile pages, and
Elena's session expired. Not exercised.

---

### QA-03 — Prod-build diagnostic (2026-06-13, local `npm run build` + production runtime)

Method: `npm run build` (exit 0, 79s) → ran the production bundle two ways with
DB+Redis up — (a) `node .next/standalone/server.js` for clean **server-side** route
status, (b) `next start -p 3001` (assets served, JS loads) for faithful **client-side**
hydration. Full evidence: `.qa/diagnostics/` (prod-build.log, qa-101-trace.md,
slots-prod.json, anna-profile-prod.html, prod-client-check.log, login-prod.png).
Env caveat: local lacks `MEDIA_DELIVERY_SECRET` + `NEXT_PUBLIC_APP_URL`; the launcher
(`.qa/diagnostics/prod-server.mjs`) supplies non-empty placeholders so env.ts passes
server-side — this does **not** affect any verdict below.

**QA-101 — Prod diagnosis: DEV-ONLY artifact. Slot engine is sound in prod. → downgrade from 🔴.**
- Build compiled clean; the three "crashing" routes registered as dynamic functions
  (`ƒ /u/[username]`, `ƒ /u/[username]/booking`, `ƒ /api/public/providers/[id]/slots`) —
  **no module-graph / RSC / import-boundary defect.**
- Server-side prod probes: slots API with **no serviceId → 400 SERVICE_REQUIRED** (handler
  runs → module loads; the dev "500 instead of 400" was jest-worker contamination, not an
  import crash); slots API with real serviceId+from → **200 with real slots** (Europe/Moscow,
  10:00/10:30 MSK — schedule + Redis cache + TZ all correct); galina profile → **200** (172 KB);
  galina booking → **200** (98 KB); anna (picsum master) profile → **200** (199 KB) server-side.
- **Root cause:** the dev `npm run dev` jest **render-worker** instability on this
  Next 16 + React 19 + **Node v24** + Windows stack — a worker that dies once poisons
  following requests on the same worker; the real error is swallowed by the dev wrapper
  and **does not exist in the prod build**. Prod-vs-dev verdict: **does NOT break Linux
  prod server-side.** Proposed fix (DESCRIBED, not applied): none required for prod
  correctness; for dev DX, pin/upgrade the Next 16.x patch and/or test on Node 22 LTS, or
  set `experimental.workerThreads`/lower dev render concurrency to stop worker recycling.
  Final severity: **🔵 dev-DX (downgraded from 🔴)** — but see QA-108: the funnel **is**
  still dead in prod, for a different, broader reason.

**QA-001 — Prod verdict (CORRECTED 2026-06-14 after FIX-01): reproduces in prod after all.**
- Original QA-03 read said "dev-only" because the faithful prod `/login` showed 0
  hydration-mismatch errors. **That was wrong** — QA-108 (env.ts `process.exit`) was
  crashing the page *before* React could finish hydrating, so the mismatch never got a
  chance to fire. **Once FIX-01 removed QA-108, the hydration mismatch surfaced on the
  prod `/login`:** `Minified React error #418` (hydration / text-content mismatch) — exactly
  the original QA-001. Confirmed **shared root** with QA-108: env.ts runs client-side with
  values that diverge from the server (parsed env vs raw `process.env` fallback). The page
  still renders (login form present, React recovers by regenerating the subtree), so it is
  **not a blocker (🟡)** — but it IS a genuine prod SSR/CSR divergence, not dev-only.
  galina profile had 0 pageerrors → the mismatch is `/login`-specific (matches original).
  **Out of FIX-01 scope** (FIX-01 = QA-108 only); QA-001 stays open 🟡 for a later prompt.

**QA-102 — Prod behavior: route does NOT hard-crash from the image; it degrades to broken images. → downgrade from 🔴.**
- In prod, `next/image` **accepts** the unconfigured picsum src and rewrites it to
  `/_next/image?url=…picsum…` (it does **not** throw "Invalid src prop" like dev does).
  Anna's profile SSR'd **200**, no error boundary, with 10 such optimizer URLs; the browser
  then got **5× `/_next/image` → HTTP 400** (optimizer rejects the unconfigured host) =
  **broken images per-card, NOT a dead route.**
- The dev "whole catalog route dies" hard-crash is **dev-only** (next/image host validation
  throws at render in dev, defers to the optimizer endpoint in prod). Residual **real** prod
  issues: (1) every Anna surface shows broken portfolio images; (2) per-card resilience gap
  (`focal-image.tsx` `needsUnoptimized` is now a no-op returning `false`, so nothing guards
  the host); (3) config/seed gap (`next.config.ts` allows only `storage.yandexcloud.net`;
  seed's only picsum source is Anna's 6 PortfolioItems). Final severity: **🟡 (downgraded
  from 🔴)** — broken images + resilience/config gap, not a route crash.

**◑ QA-102 — layer 2 (seed/config) RESOLVED in FIX-02 (2026-06-14); layer 1 (per-card route resilience) still open 🟡.**
- Layer 2 fix: the seed's only `picsum.photos` source (showcase master's 6
  PortfolioItems) now points at **bundled local placeholders** under
  `/public/portfolio-placeholders/<seed>.png` — same-origin (no `remotePatterns`
  entry needed), offline-safe, valid PNG rasters (optimizer-safe). Only the
  `mediaUrl` line changed in `seed-showcase-master.ts`; Anna's prices/timezone
  untouched. `next.config.ts` was **NOT** modified (preferred option chosen over
  the "add picsum host" last resort). No unconfigured external image host remains
  in the seed.
- Layer 1 STILL OPEN 🟡: `focal-image.tsx`/`catalog-card.tsx` per-card route
  resilience — `needsUnoptimized` is a no-op returning `false`, so one bad/
  unconfigured image host can still degrade a card; a route-level guard is a
  separate hardening item (not in FIX-02).
- Evidence + human re-seed/screenshot steps: `.qa/diagnostics/fix-02/EVIDENCE.md`.
- **✅ Layer 2 VERIFIED LIVE (QA-04, 2026-06-15):** Anna's 5 portfolio images
  load via `/_next/image?url=/portfolio-placeholders/anna-*.png` (optimized, no
  400, 0 console errors). Catalog renders without the dev hard-crash.
  `.qa/diagnostics/fix-02-live/anna-portfolio-images-load.png`. Layer 1 still open 🟡.

`QA-108 · ALL client pages (/login, /catalog, /u/*, booking, cabinets) · 🔴 Blocker
(PROD-ONLY, dev-invisible) · repro: build (`npm run build`) + run the prod bundle with
client JS served (`next start` or a reverse proxy over the standalone server) → open ANY
page in a browser · expected: page hydrates and is interactive · actual: SSR renders 200
with full HTML, then on hydration the WHOLE page is replaced by the root error boundary
"Что-то пошло не так / Произошла непредвиденная ошибка" — e.g. /login shows **0 phone
inputs** (login form gone). Console pageerror: `TypeError: i.exit is not a function at
app/login/page.js` (+ layout → root boundary). · root cause: `src/lib/env.ts:194-205`
runs `process.exit(1)` when the Zod parse fails while `isProdRuntime` is true. env.ts is
**bundled into client chunks** (confirmed: `.next/static/chunks/app/login/page-*.js`,
`app/(cabinet)/(user)/profile/page-*.js`, shared `731-*`/`9943-*` all contain
`console.error("❌ Invalid environment variables…"), i.exit(1)`). In the client bundle
`process.env.NODE_ENV` inlines to `"production"` → `isProdRuntime === true`, and the
client-side parse **always fails** because the 3 required fields (`DATABASE_URL`,
`AUTH_JWT_SECRET`, `OTP_HMAC_SECRET`) are server-only secrets never inlined into the browser
→ `process.exit` (absent in browsers) throws `i.exit is not a function` → React error →
root boundary. · breaks Linux prod: YES — client chunks are build artifacts identical to
any deploy; real prod serves them via reverse proxy/CDN so the browser loads them and
crashes. The local standalone server only *appeared* fine because it failed to serve
`/_next/static` at all (404'd the JS → hydration never ran). · dev-invisible: dev
`NODE_ENV=development` → `isProdRuntime` false → `console.warn` branch, no exit. Exactly
the bug class PROD-BUILD-SMOKE-SUBSET exists to catch. · proposed fix (DESCRIBED, NOT
applied): guard the exit so it never runs in a browser — e.g. wrap line 199-201 in
`if (isProdRuntime && typeof window === "undefined" && typeof process.exit === "function")`
(or gate the whole parse-failure side-effect block on a `typeof window === "undefined"`
server check; the `env` fallback assignment on line 209-211 already handles the client case
gracefully). Likely shared root with QA-001. · screenshot: .qa/diagnostics/login-prod.png ·
covered-by-test: no (prod-build-only; harness runs against dev).`

**✅ QA-108 — RESOLVED in FIX-01 (2026-06-14).**
- **Fix applied (PREFERRED, not floor):** gated the full-schema validation + fail-fast to
  the server only. `src/lib/env.ts` parse block (now ~lines 192-225): `const isServerRuntime
  = typeof window === "undefined"; const _parsed = isServerRuntime ? refinedSchema.safeParse(
  process.env) : null;` and the `console.error`/`process.exit(1)`/`console.warn` block is
  guarded `if (isServerRuntime && _parsed && !_parsed.success)`; `env` export falls back to
  `process.env` on the client (`_parsed && _parsed.success ? _parsed.data : process.env`) —
  identical to the pre-fix client value, so zero client behavior change. Single file edited.
- **Bonus:** because the guard is the literal `typeof window === "undefined"`, Next/webpack
  **dead-code-eliminated** the whole block out of the client bundle — grep of the post-fix
  `.next/static/chunks/` finds **none** of `process.exit` / `exit is not a function` /
  "Invalid environment variables". Browser-console noise gone too.
- **Server fail-fast PRESERVED:** evaluating `env.ts` in a server context (`NODE_ENV=production`,
  `AUTH_JWT_SECRET` removed) → `process.exit(1)` + "❌ Invalid environment variables:
  AUTH_JWT_SECRET". A genuinely misconfigured server still hard-fails. Evidence:
  `.qa/diagnostics/qa-108-fixed/failfast.log`.
- **Prod re-verification (`next start`, assets served, hydration runs):** `/login` → 200,
  **login form back (1 phone input)**, NO error boundary, 0 exit/env errors;
  `/u/galina-stepanova-26` → 200, profile renders, 0 errors. Evidence:
  `.qa/diagnostics/qa-108-fixed/` (verify.log, login-fixed.png, profile-fixed.png).
- **Validation:** typecheck ✅ · lint baseline 1err/3warn preserved (env.ts not flagged) ·
  encoding ✅ · mojibake ✅ · `npm run build` exit 0 (compiled 21.1s). Tests not run
  (no test surface touched).
- **Unmasked QA-001** (hydration mismatch on `/login`) — see corrected QA-001 verdict above;
  left open 🟡 (out of FIX-01 scope).

### QA-04 — Client booking conversion path, end-to-end via UI (2026-06-15, Playwright MCP, dev server)

**Headline: the client conversion funnel WORKS end-to-end via the real UI.** A
client logs in, opens a master profile (200, no QA-101 500), picks a real slot,
books, gets a correct confirmation, and it lands in the cabinet bookings list.
All 5 integrity anchors hold. **3 new defects surfaced** (QA-109 price-formatter,
QA-110 slot-grid day-mixing, QA-111 slotStepMin ignored). Server used: **dev**
(`npm run dev`) — the QA-101 dev jest-worker 500 did **not** reproduce this
session (Galina + Anna profiles + slots API all 200). MCP `browser_*` tools were
present. Subject: Галина Степанова (`galina-stepanova-26`, Europe/Moscow,
Mon–Sat 10–19, min 2h/max 90d, autoConfirm=false, slotPrecision=`exact`,
slotStepMin=15). Client: Elena (`+79995000000`). Evidence: `.qa/diagnostics/fix-02-live/`.

**FIX-02 live verification:**
- **QA-105 (prices) → ✅ verified live.** Re-seed applied. DB now stores kopeks
  (Galina services 218000–812000 = 2180–8120 ₽; all bulk 100000–1500000 = 1000–15000 ₽;
  0 sub-1000). Correct ÷100 display confirmed on the **profile** ("Стрижка мужская
  2 180 ₽", "Свадебный макияж 8 120 ₽"), the **booking widget** summary, and the
  **success card**. ⚠️ But other surfaces show it **100× inflated** — see **QA-109**
  (separate formatter bug, NOT a QA-105 regression: the data is correct kopeks).
- **QA-102 layer 2 (images) → ✅ verified live.** Catalog renders (0 console
  errors, no dev hard-crash). Anna's 5 portfolio images load via
  `/_next/image?url=/portfolio-placeholders/anna-*.png` (all `loaded:true`,
  optimized w=475, no 400, no "Invalid src prop"). Local same-origin placeholders
  optimize cleanly. **Layer 1** (per-card route resilience, `focal-image.tsx`
  `needsUnoptimized` no-op) remains open 🟡 — not exercised (no unconfigured host left to trip it).

**Five integrity anchors — explicit PASS/FAIL (via UI):**
| # | Anchor | Verdict | Evidence |
|---|--------|---------|----------|
| 1 | Slots reflect real schedule (no past, hours, day-off) | ✅ PASS | Mon 15 offers 10:00–18:00; Sunday 21 (day-off) → 0 slots; first slot 10:00 MSK > now+2h. `galina-booking-slots.png` |
| 2 | Slot consumed after booking | ✅ PASS | Booked Mon 15 14:30 → slots API + grid for the 15th exclude 14:30 (and overlapping 14:00/15:00); 14 slots remain for that day |
| 3 | Double-booking prevented via UI | ✅ PASS | The booked 15th 14:30 is no longer selectable in the grid (can't re-pick it); API 409 SLOT_CONFLICT backstop (QA-02) |
| 4 | Confirmation correct (service/master/price/date + TZ) | ✅ PASS | Success card: "пн, 15 июня · 14:30 — 15:15", Стрижка мужская, 2 180 ₽, address. DB: `startAtUtc=2026-06-15 11:30 UTC` = 14:30 MSK (rule 8 ✓), status PENDING (autoConfirm=false ✓), linked to Elena's userId. `anchor4-confirmation.png` |
| 5 | Appears in cabinet bookings list | ✅ PASS | Top of `/cabinet/bookings`: ИЮНЬ 15 14:30, "Ожидает подтверждения мастера", Стрижка мужская, Галина (price shows QA-109 inflated "218 000 ₽"). `anchor5-cabinet-bookings-qa109.png` |

Phase 5 (errors, light): clearing the required **Имя** field **disables** the
"Записаться" submit (graceful; no half-booking). The 409 "slot taken between
select and confirm" path is wired (`booking-flow-stepper` → `submitConflict` →
conflict-phase) + backed by QA-02's API 409.

Covered-by-test: ✅ `.qa/specs/client/booking-happy-path.spec.ts` (passes, 13.3s).

`QA-109 · catalog cards + catalog map + price-range slider + client cabinet
bookings list + client favorites · 🟠 High · repro: open /catalog (or a master's
card, or /cabinet/bookings) → prices render 100× too high, e.g. catalog "от 279 400 ₽",
Anna "от 200 000 ₽", cabinet booking "218 000 ₽", "Потрачено за 3 мес. 1 450 000 ₽" ·
expected: 2 794 ₽ / 2 000 ₽ / 2 180 ₽ / 14 500 ₽ · actual: these surfaces call
`moneyRUB(value)` (src/lib/format.ts:4 — does NOT divide by 100) on **kopeks**
values, while the rest of the app uses the correct `moneyRUBFromKopeks` /
`UI_FMT.priceLabel` (÷100). The profile, booking widget, and success card are
CORRECT (÷100). Sites: catalog-card.tsx:135,137 (`moneyRUB(item.primaryService.price
/ item.minPrice)`); catalog-map-sidebar.tsx:79,140 (`moneyRUB(item.priceFrom)`);
client-bookings-page.tsx:216 (`moneyRUB(spentLast90dKopeks)`),:366
(`moneyRUB(booking.service.priceSnapshot)`); client-favorites-page.tsx:309; the
price filter range/histogram-slider.tsx:18 also labels kopeks as ₽. Pre-existing
formatter bug **exposed by FIX-02** (which correctly made the data kopeks; before,
ruble-scale-in-kopeks made `moneyRUB` look plausible). Fix = swap these to
`moneyRUBFromKopeks`. Not a booking-integrity break (stored price + confirmation
correct) → 🟠, but the primary discovery surface + clients' own booking history
show 100× wrong prices. · screenshot: catalog-prices-qa109.png,
anchor5-cabinet-bookings-qa109.png · covered-by-test: no.`

**QA-109 — FULL codebase scope (grep audit, QA-05, all roles).** Price formatters:
CORRECT = `UI_FMT.priceLabel` / `moneyRUBFromKopeks` / `moneyRUBPlainFromKopeks`
(all ÷100). INFLATED = `moneyRUB` / `moneyRUBPlain` / local `formatPrice` without
÷100, called on kopeks. **Inflated surfaces to fix (the comprehensive list):**
- **Client / public discovery:** `catalog/components/catalog-card.tsx:135,137`
  (`moneyRUB(primaryService.price / minPrice)`); `catalog/components/catalog-map-sidebar.tsx:79,140`
  (`moneyRUB(priceFrom)`); `catalog` price-range `catalog/components/histogram-slider.tsx:18`
  (labels kopeks as ₽).
- **Client cabinet:** `client-cabinet/bookings/client-bookings-page.tsx:216`
  (`moneyRUB(spentLast90dKopeks)`), `:366` (`moneyRUB(priceSnapshot)`);
  `client-cabinet/favorites/client-favorites-page.tsx:309` (`moneyRUB(startingPrice)`).
- **Chat (client + master):** `chat/chat-window/system-message.tsx:104` (`moneyRUB(card.priceSnapshot)`).
- **Search-by-time (public):** `search-by-time/components/provider-result-card.tsx:20,22`
  (`moneyRUB(service.price / priceFrom)`). (NOTE: `slot-bubbles-row.tsx:30`
  `moneyRUB(slot.discountValue)` is CORRECT — FIXED discountValue is in rubles.)
- **Public studio profile:** `public-studio/sections/details-section.tsx:67` (`moneyRUB(studio.priceFrom)`).
- **Home:** `home/components/recent-masters-section.tsx:74` (local `formatPrice` = `${price} ₽`, no ÷100).
- **Legacy studio services page (deprecated):** `studio/components/studio-services-page.tsx:617`
  (`moneyRUBPlain(service.basePrice)`).
- **Verify (low-priority):** `notifications/admin-body-templates.ts:9` (`toLocaleString` —
  confirm the value is pre-divided before this).
**CLEAN (no fix needed):** entire master cabinet + studio-cabinet (all use `priceLabel`),
booking flow (success/summary/service-header), pricing plan-card, analytics + billing
(`moneyRUBFromKopeks`), public master profile portfolio/bundle, booking-detail-drawer,
public-studio booking-summary + service-step, `home/hot-slots-preview.tsx` (its local
formatPrice ÷100). Comprehensive fix = swap every INFLATED call to `moneyRUBFromKopeks`.

**✅ RESOLVED — FIX-03 (2026-06-15).** Swapped 9 callsites to the ÷100 equivalent;
verified live (baseline restored):
- `catalog-card.tsx:135,137` → `moneyRUBFromKopeks` — catalog cards now 1 000–3 801 ₽ (was 100k+).
- `catalog-map-sidebar.tsx:79,140` → `moneyRUBFromKopeks`.
- `histogram-slider.tsx` `formatRub` → display `÷100` (slider value pipeline stays kopecks — the
  catalog filter compares priceMin/priceMax raw against the kopecks `priceFrom`). Chips now "1 000 ₽" / "3 801 ₽".
- `client-bookings-page.tsx:216,366` → `moneyRUBFromKopeks`.
- `client-favorites-page.tsx:309` → `moneyRUBFromKopeks`.
- `chat/system-message.tsx:104` → `moneyRUBFromKopeks`.
- `search-by-time/provider-result-card.tsx:20,22` → `moneyRUBFromKopeks`.
- `public-studio/details-section.tsx:67` → `moneyRUBFromKopeks` — now **"от 1 300 ₽"** (was the QA-08 "от 130 000 ₽").
- `home/recent-masters-section.tsx` local `formatPrice` → `moneyRUBPlainFromKopeks` (preserves plain + ₽ style).

**False positive / left untouched (with reason):**
- `notifications/admin-body-templates.ts` `formatRubles` → **already `Math.round(kopeks / 100)`** (correct).
  QA-09 was right: admin panel is clean. Not a price-display bug.
- `studio/studio-services-page.tsx:617` (`moneyRUBPlain(basePrice)`) → **skipped**: reachable only via the
  legacy `studio-settings-page` Services tab, which the live route (`/cabinet/studio/settings/services`)
  redirects away from (unreachable in practice). Bundled into the legacy-page retirement sweep (likely a
  genuine inflation, but out of this mechanical pass's reach).
- `master/hot-slots-settings-section.tsx:279` (`moneyRUBPlain(effectivePrice)`) → **out of FIX-03 scope**
  (not in the audited list; master cabinet). Flagged below as a follow-up to verify.
- `search-by-time/slot-bubbles-row.tsx:30` (`moneyRUB(discountValue)`) → **correct** (`discountValue` is in
  rubles — `calcDiscountedPrice` multiplies it by 100 to reach kopecks). Left as-is.

**Regression test:** `src/lib/format.test.ts` — formatter-output (`moneyRUBFromKopeks`/`moneyRUBPlainFromKopeks`
÷100) + a **source guard** asserting the 9 fixed surfaces no longer call the bare `moneyRUB(`/`moneyRUBPlain(`
and carry their ÷100 marker (catches a future re-introduction).

**`moneyRUB`/`moneyRUBPlain` deprecation:** NOT removable yet. `moneyRUB` retains 1 legitimate caller
(`slot-bubbles-row`, value in rubles). `moneyRUBPlain` retains 2 (master `hot-slots-settings-section`,
legacy `studio-services-page`) — both need review (likely additional QA-109-class instances outside this
pass's scope) before either formatter can be deprecated.

`QA-110 · booking widget slot grid (time-grid.tsx) · 🟠 High · repro: open a
master profile, add a service, select a day → the time grid shows ~2 days of
slots intermixed with no day labels (e.g. selecting "Пн 15" shows 31 buttons =
14 for Mon 15 + 17 for Tue 16). After booking a slot, that day's slot is
correctly removed but the NEXT day's identical time remains → the booked time
LOOKS still available. Picking a next-day slot shows the selection/form summary
labeled with the date-strip's selected day (e.g. a Tue 16 slot summarised as
"пн 15 июня · 14:30"). · root cause: time-grid.tsx:60-72 sets `to = dateKey + 1`
but /api/public/providers/[id]/slots treats `to` **inclusive** → returns two
days; TimeGrid then renders ALL returned slots (line 126) WITHOUT filtering by
`slot.dayKey` (which it computes at line 86 but ignores). The selection/form
summary derives the date from `selectedDateKey` not the slot. The booking POST
uses `selectedSlot.startAtUtc` (correct slot time) and the success card uses
`booking.startAtUtc` (correct) — so the stored booking + final confirmation are
correct; the defect is the intermediate grid/summary mislabel. · impact: a user
can believe they're booking a different day than they are (until the success
card); confusing grid. Fix: filter slots to `slot.dayKey === dateKey` OR make
`to` exclusive. · screenshot: galina-booking-slots.png · covered-by-test: no.`

`QA-111 · slot grid granularity (schedule engine) · 🟡 Medium · repro: Galina
has slotPrecision=`exact`, slotStepMin=15, but the offered slot grid is 30-min
(10:00, 10:30, …). · expected: respect slotStepMin (15-min grid). · actual:
src/lib/schedule/slots.ts:69 hardcodes `const stepMin = 30` and never reads
`provider.slotStepMin`; `buildSlotsForDay` uses the literal 30 for rounding +
the slot loop. slotPrecision="exact" display IS honoured (exact times shown).
This confirms the BACKLOG "slotPrecision/slotStepMin not enforced" item for
slotStepMin specifically. Not a booking break (30-min slots are valid) but a
master who configured 15-min steps doesn't get them. · covered-by-test: no.`

`QA-001 (cross-cutting) during QA-04: phone input on /login stuck on the FIRST
type this session (no hydration input-wipe observed). The first OTP attempt
failed ("Code not found") only because driving the 6 boxes with individual
keyboard.press raced; pressSequentially into box 1 (the harness pattern)
succeeded. No QA-001 instance reached the booking forms.`

QA-103 (CUID leak) / QA-104 (deep-link param mismatch) / QA-107 (Anna Almaty TZ)
not re-tested here (deferred items). Anna's profile loaded fine; her Almaty-TZ
slot display still pending the QA-107 product decision.

### QA-10 deep-test (client cabinet extras — last discovery pass) — 2026-06-15

**Subject:** Елена Петрова (`+79995000000`). Live UI via MCP Playwright, dev
(localhost:3000, MSK host), desktop 1440×900 + mobile 390×844. Baseline restored
from `.qa/snapshots/post-seed.dump`. READ-ONLY (the cancel + favorite-toggle +
profile-city edits below are the in-scope mutations of this pass). No commit.

**Test data — all already seeded for Elena, no DB inserts needed:** upcoming
CONFIRMED `seed-bk-showcase-client-01` (06-17, used for cancel); FINISHED past
`client-04/05/06` (rebooking + review targets); plus PENDING/CHANGE_REQUESTED/
CANCELLED/NO_SHOW — a full status spread.

#### Phase 1 — Bookings list & detail
`/cabinet/bookings` renders cleanly (9 bookings, tabs Все/Предстоящие/Состоявшиеся/
Отменённые, KPIs, full status spread, per-booking actions), **0 console errors**.
- **QA-109 CONFIRMED here** (rolled in, not re-filed): "Потрачено 1 450 000 ₽" +
  per-booking "400 000 ₽" / "450 000 ₽" / "200 000 ₽" — 100× inflated
  (client-bookings-page.tsx).
- **QA-107 family** (rolled in): the 12:00 UTC Almaty-salon booking renders
  "15:00" (MSK browser TZ) — client surfaces use browser TZ, not salon/profile TZ.

#### Phase 2 — Cancel flow + late-cancel — **CLEAN ✅**
Cancel an upcoming CONFIRMED booking → **confirmation dialog** ("Отменить запись?
Мастер получит уведомление. Действие необратимо." · Отмена / Отменить запись).
Confirmed it; downstream integrity verified in DB:
- booking → status `REJECTED`, `cancelledBy=CLIENT` (minor enum note: the live
  client-cancel writes `REJECTED` not `CANCELLED`, but `cancelledBy` disambiguates
  and the UI buckets it under "Отменённые" — matches QA-05 normalize; not a bug);
- **master notified** — `BOOKING_CANCELLED_BY_CLIENT` Notification → +79991000000;
- **slot freed** — no active booking blocks 06-17 12:00 UTC after cancel.
- Tabs updated Предстоящие 3→2, Отменённые 3→4. **No inconsistent state** (the
  pre-launch risk does NOT reproduce).
- **Late-cancel:** this cancel was within-window. The 60-min cutoff is
  server-enforced (`ensureBookingActionWindow`, QA-05) but no near-now seed
  booking exists to exercise the close-to-appointment UI path. `lateCancelAction=
  reminder` ⇒ no penalty, only the master notification (which fired). Verdict:
  **cancel graceful + confirmed + integrity-safe; late-cancel = notification only,
  no penalty (as designed).**

#### Phase 3 — Rebooking — **IMPLEMENTED ✅ (not deferred)**
Every completed booking shows **"Повторить"** → `/u/<master>/booking?service=<id>`
(booking funnel, service pre-selected) + **"Связаться"** → `/cabinet/messages?c=<thread>`.
Quick-rebook from a past booking works. (The deferred BACKLOG item is specifically
"one-tap rebook from homepage" — separate; from a past booking it's live.) The
`service=<cuid>` in the booking-flow URL is rule-12-allowed (booking flow needs the id).

#### Phase 4 — Favorites — **WORKS ✅** (QA-04 Phase 4 unblocked)
`/cabinet/favorites` renders (1 favorite, sort options, rating/visits), 0 console
errors. Favorite toggle on `/u/anna-sokolova` (`aria-pressed`) **persists both ways**:
remove → reload = false; re-add → reload = true. Anna restored to favorited.
- **QA-109 CONFIRMED** (rolled in): "200 000 ₽" should be 2 000 ₽ (client-favorites-page.tsx:309).

#### Phase 5 — Rest of the client cabinet (all render, 0 console errors)
- **Chat/messages:** thread renders; the Phase-2 cancel produced a **system message**
  in the thread ("Клиент отменил запись … 400 000 ₽") — chat↔booking-event
  integration works. **QA-109 CONFIRMED** (rolled in): "400 000 ₽" should be 4 000 ₽
  (chat/system-message.tsx:104). Time "17 июня 15:00" = browser TZ (QA-107).
- **Reviews — integrity SOLID ✅.** 3 reviews (avg 4.7), "ЖДУТ ОТЗЫВА 0", filters,
  master replies shown. `/api/reviews/can-leave` probes: already-reviewed completed
  booking → `canLeave:false` (reviewId present → **double-review blocked**);
  cancelled booking → false; pending booking → false. Both pre-launch risks (review
  without completed booking, double-review) **prevented server-side**. The "Оставить
  отзыв" CTA is correctly absent on already-reviewed completed bookings.
- **Profile edit:** inline-edit autosave **persists** (set Город="Москва" → reload
  survived; cleared → restored). Note: the "Город" field maps to `UserProfile.address`
  (no `city` column); **Elena has no city/address set by default** — relevant to
  QA-107 (per-viewer-city TZ would have nothing to derive from for this client).
- **Notifications:** renders, 6 filter tabs, mark-all/clear, per-item read toggles.
  Uses **relative time** ("12 ч назад", TZ-agnostic); only absolute date labels
  ("1 июн.") are weakly in the QA-113 family. Elena's cancel correctly notified the
  master (Anna), not Elena.
- **FAQ:** renders (categories + Q&A accordion).

#### Phase 6 — Mobile sweep (390×844)
- **No horizontal overflow** on any surface (bookings/favorites/profile/chat). ✅
- Chat composer **not** obscured by the bottom-nav. ✅
- **NEW 🟠 QA-119 — fixed bottom-nav overlaps bottom content (client cabinet shell).**
  `main` in the client cabinet has `padding-bottom: 0` under a `position:fixed`
  52px-tall mobile bottom-nav (`nav.fixed.bottom-0 … lg:hidden`). On `/cabinet/bookings`,
  scrolling to the end leaves the **last booking card's action row — including the
  destructive "Отменить" — behind the nav, and taps are intercepted by it**
  (Playwright pointer-event interception reproduced; element resolved but nav subtree
  ate the click). Root cause is shell-wide (the master cabinet uses `pb-24` for exactly
  this clearance; client `main` is `pb-0`); impact varies by page (worst on long lists;
  on profile it overlaps only the redundant in-page nav links). Repro: 390×844 →
  `/cabinet/bookings` → scroll to bottom → tap the last card's "Отменить". Fix: add
  bottom padding to the client cabinet scroll container (e.g. `pb-24`) to clear the
  fixed nav. Evidence: `.qa/diagnostics/qa10-mobile/`. covered-by-test: no.
- **NEW 🟡 QA-120 — booking action controls below mobile tap-target guideline.**
  Чат / Перенести / В календарь / Маршрут / Отменить / Повторить / Связаться all
  render at **30px height** at 390-wide (below the 44px Apple-HIG / 48dp-Material
  guideline), several packed in one row incl. the destructive "Отменить" → mis-tap
  risk on a mobile-first surface. (Echoes the sprint's existing TAP-TARGET-AUDIT-A
  backlog item.) covered-by-test: no.

#### Verdict
Cancel + late-cancel: **graceful, integrity-safe, no penalty (as designed).**
Rebooking: **implemented** (service-prefilled deep-link). Favorites + reviews +
profile-edit + chat + notifications + FAQ: **all functional, 0 console errors.**
Discovery COMPLETE (all 5 roles + client extras). New findings: **1 🟠 (QA-119
mobile bottom-nav overlap), 1 🟡 (QA-120 tap-target size)**; everything else was a
roll-in (QA-109 ×3 surfaces, QA-107 client-TZ).

---

## 5. Site admin
- **Login smoke: ✅ PASS** — `+79994000000` → `/cabinet/profile`.
  Storage-state saved (`.qa/auth/site-admin.json`). No failed requests.
  Console: QA-001 only.
- `QA-002 · auth landing · 🔵 Minor · repro: log in as the ADMIN account
  (roles CLIENT,ADMIN) · expected (per this prompt's role brief): land on the
  admin panel `/admin` · actual: lands on the CLIENT cabinet `/cabinet/profile`
  · root cause: src/lib/auth/cabinet-redirect.ts has no ADMIN branch — only
  master/studio/client. /admin is reachable by direct navigation but is never
  the post-login landing · covered-by-test: yes.` By design today, but flagged
  so the admin deep-test prompt navigates to `/admin` explicitly rather than
  expecting an auto-redirect.
### QA-09 deep-test (site admin breadth + privilege-escalation) — 2026-06-15

**Subject:** Платформа Админ (`+79994000000`, roles {CLIENT, ADMIN}). Live UI via
MCP Playwright on dev (localhost:3000, MSK host). READ-ONLY. No commit.

#### Phase 1 — Privilege-escalation / access control (PRIORITY) — **BOUNDARY HELD ✅, no 🔴**
The admin boundary holds at every layer probed:
- **Logged-out:** admin pages (`/admin`, `/admin/users`, `/admin/billing`) →
  **307 redirect to `/login`**; admin APIs (`/api/admin/{dashboard/kpis,reviews,
  billing/kpis,cities,catalog/categories,queue}`) → all **401**.
- **Authenticated non-admin (client Elena, CLIENT):** every admin API → **403**,
  no data/action leaked. Reads (`dashboard/kpis`, `reviews`, `billing/kpis`,
  `cities`, `queue`) AND mutations both 403 — `POST /api/admin/reviews/<fake>/approve`
  and `PATCH /api/admin/users/<id>/plan` **403 before acting** (auth precedes
  lookup; the fake-id approve 403s, not 404s). `/admin` page → redirect to **`/403`**
  (panel never renders).
- **Role-based, not session-based:** authed-non-admin = **403** vs anon = **401**.
  The distinction proves the guard checks the ADMIN role, so master Anna
  (CLIENT+MASTER, also a non-admin session) is denied by the same check — not
  separately re-tested (the client probe is decisive for the boundary).
- **No privilege-escalation path found.** This was the priority check.

#### Phase 2 — Admin surfaces breadth — all 7 sections render, **0 console errors**
| Section | State |
|---|---|
| Дашборд `/admin` | KPIs (0 regs/7d · 0 bookings/day · **30 active subs** · 0 ₽ rev), 7-day reg/booking charts, LIVE event feed (5s refresh). Feed money correct rubles (−2 500 ₽, −4 500 ₽). |
| Пользователи `/admin/users` | **61 users** (61 client / 36 master / 7 studio / 1 admin), role+tariff filters, 50 rows. CUIDs shown — rule-12 allowed (admin). |
| Финансы `/admin/billing` | MRR **0 ₽** / **37 active subs** / 0 processing / 0 failures-7d. Plans (FREE 7, PRO 18 active). Payments tab: clean empty-state ("Нет платежей"). |
| Отзывы `/admin/reviews` | 0 complaints · avg **4.3** · **46 total** · 0 deleted. Tabs Жалобы/Низкие/Все. "Все" renders 46 reviews w/ per-review **Удалить** + report status + master replies. |
| Города `/admin/cities` | **8 cities** w/ master/studio counts (Москва 14/4, СПб 5/2…). "**9 провайдеров требуют geocoding**" (cityId NULL) — corroborates QA-107. |
| Каталог `/admin/catalog` | **14 categories** (12 published + **2 pending** — both Victoria's: "Перманентный макияж губ", "Татуаж бровей" — corroborates QA-08). Per-category service/provider counts + ДЕЙСТВИЯ. |
| Настройки `/admin/settings` | Logo + login-image upload, **3 system flags** (online-pay / visual-search / legal-draft), SEO fields, task queue (0/0), reindex + media-cleanup buttons. |

#### Phase 3 — Destructive-action mechanics — enumerated, **NOT executed**
All admin-gated, all present: review **Удалить** (soft-delete), category
approve/reject (2 pending), `PATCH /api/admin/users/<id>/plan` (plan grant),
subscription cancel, 3 global system-flag toggles, queue retry/delete, media
cleanup, visual-search reindex. None triggered (not cleanly reversible without
prior-state capture). Mechanics + render confirmed only.

#### Phase 4 — QA-109 / QA-113 rolled in
- **QA-109 (money) — admin panel CLEAN.** Admin has its own kopeks helpers, all
  correct: `dashboard/server/shared.ts` `formatRublesFromKopeks`/`formatRublesShort`
  and `billing/lib/kopeks.ts` `formatRublesFromKopeks`/`formatRublesPrecise`/
  `parseRublesToKopeks`/`formatRublesShort` — **all ÷100**. No `moneyRUB`/
  `moneyRUBPlain` (the QA-109 non-÷100 culprits) anywhere in `admin-cabinet`.
  Live-feed amounts rendered as correct rubles. **QA-109 confirmed confined to the
  public surfaces** (`details-section.tsx` etc), not admin.
- **QA-113 (TZ labels) — admin dashboard is another instance of the family.** The
  LIVE feed timestamps (12:00, 11:00…) and 7-day chart date labels are
  server-formatted → shift on a UTC host like all QA-113 surfaces. No booking
  integrity involved → stays **🟠 cosmetic** (severity already settled by QA-07).

#### New observation (minor, dev-only — NOT a defect)
- `QA-117 · admin/reviews "Все" tab · 🔵 Minor · repro: open /admin/reviews?tab=all
  in dev and read within ~1.5s · observed: list area shows only "Загрузить ещё"
  (no cards); clicking it advanced the cursor to an empty "Нет отзывов" state ·
  actual root cause: dev slow-first-compile of the reviews data route — a 3.5s
  wait renders all 46 reviews correctly and the API `/api/admin/reviews?tab=all`
  returns 200 with data.reviews[] · severity: dev-only latency artifact, no prod
  impact expected (compiled routes), no fix needed · covered-by-test: no.`

#### Verdict
Admin panel passes breadth + the privilege-escalation priority. **No 🔴, no new 🟠.**
Only corroborations of existing items (QA-107 geocoding, QA-108→QA-08 Victoria
categories, QA-109 public-only, QA-113 family) + one dev-latency 🔵 (QA-117).

---

## Harness notes (for the deep-test prompts that follow)
- **Playwright MCP server is NOT connected in this session** — the `browser_*`
  MCP tools do not exist here. All browser work runs through the `@playwright/test`
  harness (`.qa/`, `playwright.config.ts`), which is also the deterministic,
  CI-reusable path this prompt specified. If a later prompt needs ad-hoc MCP
  exploration, the MCP server must be added to the session first.
- **Type, never `.fill()`, into the phone field.** The controlled React
  `<Input>` only updates state from real input events; `.fill()` sets the DOM
  value without firing `onChange`, so validation never runs and the consent
  checkbox never appears. The harness uses `pressSequentially` + an
  `expect.toPass` retry (to survive QA-001's tree regeneration).
- **Reuse saved sessions.** `.qa/auth/<role>.json` storage-states are ready;
  load with `browser.newContext({ storageState: '.qa/auth/<role>.json' })` to
  start a deep-test already-authenticated (no re-login needed).
- **`EMAIL_AUTH_ENABLED` is true in this dev env** — the login form shows
  Phone/Email tabs. The harness targets the phone textbox by role+name, which
  is unambiguous (the tabs are buttons).
- **Rate limit:** OTP requests are capped 5/60s per IP. The smoke clears the
  Redis rate-limit keys before running and uses a single worker. A deep-test
  that re-logs-in repeatedly should reuse storage-state instead.
- **Dev DB pollution:** deep-test passes that create bookings/reviews/messages
  mutate the shared dev DB. Consider `npm run seed:test:reset && npm run
  seed:test` between heavy passes (see BACKLOG watch-item).

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

**✅ QA-001 — RESOLVED (2026-06-16). Root cause + narrow fix + prod-verified.**
- **Phase 1 — diverging node (dev detailed warning):** `TelegramLoginButton` inside
  the social-login row. Server rendered `<div className="pointer-events-none absolute
  opacity-0" aria-hidden>` (the "bot configured" container branch); client rendered
  `<button disabled aria-label="Войти через Telegram">` (the "!botUsername" branch).
- **Phase 2 — root cause (NOT env-divergence-as-FIX-01-assumed, but env-VIA-ALIAS):**
  the buttons read `env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` / `env.NEXT_PUBLIC_VK_ENABLED`.
  `.env` has these set, so the **server** value is correct, but on the **client**
  `@/lib/env` is `process.env as AppEnv` and the aliased property access defeats Next's
  static `process.env.NEXT_PUBLIC_*` inlining → **`undefined` on the client**. Server
  renders the configured branch, client the not-configured branch → #418. (VkLoginButton
  is the same class but renders `null` when off, so React reported Telegram first.)
  This also meant the Telegram button was non-functional post-hydration (regenerated to
  the disabled state). The ENV-DISCIPLINE sweep (`process.env.X` → `env.X`) introduced it.
- **Phase 3 — fix (narrow, deterministic-value strategy):** `/login` `page.tsx` (server)
  reads the two NEXT_PUBLIC values and passes them as props → `LoginClient` → the buttons,
  which prefer the prop (defined on both SSR + CSR via the RSC payload) over the env alias.
  Buttons gained optional `botUsername?` / `enabled?` props (other callers keep the legacy
  env fallback). The two buttons are used **only** by `login-client.tsx`, so the change is
  fully contained — no env.ts touch, no app-wide ripple. Files: `src/app/login/page.tsx`,
  `src/app/login/login-client.tsx`, `src/components/auth/telegram-login-button.tsx`,
  `src/components/auth/vk-login-button.tsx`.
- **Phase 4 — PROD verification (`next start`, real static + hydration — the standalone
  launcher 404s `_next/static` so it can't hydrate; used `prod-next-start.mjs`):**
  #418 **gone** in light AND dark (console clean), **input-wipe gone** (fast type
  "9991002030" sticks — no per-key retry needed), login works E2E (smoke 4/5 →
  correct landings; the 5th = site-admin failed on per-IP OTP rate-limit, **not** the fix —
  isolated re-run after clearing rate-limit logged admin in → /admin). Screenshots
  `.qa/diagnostics/qa-001/`.
- **Proposed follow-up (root fix, deliberately NOT applied here — ripples app-wide):**
  fix `src/lib/env.ts` client branch to build the env object from **literal**
  `process.env.NEXT_PUBLIC_X` references (one per var) so webpack inlines each → every
  client `env.NEXT_PUBLIC_*` consumer gets the real value. Same latent bug currently
  affects `push-manager` / `catalog-map` / `telegram-connect-modal` (env-via-alias →
  undefined on client). Own prompt + full-surface verification recommended.
- **Unrelated observation (new, pre-existing, prod-only, non-blocking):** `/login` emits a
  CSP `unsafe-eval` pageerror (`'unsafe-eval' not allowed` under strict-dynamic) — a
  string is eval'd somewhere (likely a dep). It did **not** block login (E2E completed).
  Separate from QA-001 (not a hydration error). Filed for a future CSP/eval pass.

**✅ FIX-23 (2026-06-17) — /login CSP `unsafe-eval` ELIMINATED (eval removed, CSP unchanged).**
- **Eval source (confirmed from source, not guessed):** the embedded Telegram Login widget
  (`telegram-widget.js`) compiles the `data-onauth="onTelegramAuth(user)"` string via its
  `__parseFunction` → `new Function`/`eval` **at widget-init** (fires just by loading /login with
  the bot configured — matches the non-blocking pageerror). `script-src` has no `unsafe-eval`, so
  strict-dynamic blocks it. Only our `data-onauth` triggered the eval branch; nothing of ours.
- **Fix (preference #1 — eliminate, not weaken CSP):** switched the widget to **`data-auth-url`
  (redirect mode)** — the eval-free branch (`__parseFunction` is never called). Added a GET callback
  at `/api/auth/telegram/login` that verifies the **same HMAC hash** (`authenticateTelegramLogin`)
  from the query params and issues the session (auth_date freshness + HMAC = identical guarantees to
  the POST path). On failure → `/login?error=telegram` (surfaced on mount). Dead `onTelegramAuth`
  callback + `loading/errorText` state removed from the button. Files: `telegram-login-button.tsx`,
  `api/auth/telegram/login/route.ts`, `login/page` `login-client.tsx`. **CSP untouched** (still
  `script-src 'self' 'nonce-…' 'strict-dynamic' https:`, no unsafe-eval).
- **Prod-verified (`next start` via `.qa/diagnostics/prod-next-start.mjs`, :3001):** built /login
  chunk now ships `data-auth-url`; live /login console (scoped to navigation) = **0 unsafe-eval
  violations** + **0 hydration #418** (QA-001 stays green); all auth buttons render; **login works
  E2E** (phone OTP → /cabinet/profile). Captures `.qa/diagnostics/fix-23/csp/`.
- **Other prod-only CSP violations found (NOT fixed — last-pass candidates):** (1) inline theme
  no-flash IIFE in the root layout lacks the nonce → blocked **app-wide** (`/login:31`); (2) framing
  `oauth.telegram.org` blocked by `default-src` (no `frame-src`) → the telegram widget iframe button
  can't render → telegram login non-functional in prod (independent of this fix); (3) VK start
  prefetch to `id.vk.ru` CORS-blocked + stale `beautyhub.art` redirect_uri; (4) **2nd surface:**
  `telegram-connect-modal` (cabinet profile) still uses `data-onauth` → same latent `unsafe-eval` on
  the profile page.

**✅ FIX-24 (2026-06-18) — prod CSP + social-auth cluster CLOSED (the 4 items above). Verified on a
real prod build (`next start` :3001). CSP kept strict — only `frame-src` scoped to the telegram host
added; no wildcard, no `unsafe-eval`.**
- **Item 1 — theme no-flash nonce (app-wide 🔴):** the unnonced inline script was **next-themes'**
  injected no-flash script (not the SW-reset, which already had the nonce). Pass the per-request nonce
  to `<ThemeProvider nonce={nonce}>` → next-themes (0.4.6 supports `nonce`) stamps it. **Prod-verified:**
  /login + / + /cabinet/profile → **0 unnonced executable inline scripts** (was 1); set theme=dark →
  reload → `html.dark` + body bg applied before paint (**no white FOUC**), 0 console errors, both themes.
  Files: `components/theme-provider.tsx`, `app/layout.tsx`.
- **Item 2a — frame-src (🔴):** added `frame-src 'self' https://oauth.telegram.org` to the CSP
  (`src/proxy.ts`) — scoped to the exact host, keeps `'self'`, no wildcard. Telegram widget iframe now
  renders on /login **and** in the connect-modal (`oauth.telegram.org/embed/…`). VK uses a top-level
  redirect (no frame) → needs nothing here.
- **Item 2b — connect-modal eval (🔴):** switched `telegram-connect-modal` `data-onauth` →
  `data-auth-url` → **new GET handler on `/api/auth/telegram/link`** that links to the **existing**
  session (NOT the login path) + redirects to `/cabinet/profile?telegram=<result>`; the profile page
  surfaces a toast. **Prod-verified:** opening the modal = **0 console errors** (was the `unsafe-eval`
  violation). Round-trips proven E2E with a crafted valid HMAC: LOGIN → 307 `/cabinet/profile` +
  `bh_session`+`bh_refresh`; CONNECT → 307 `/cabinet/profile?telegram=connected`. Login also works E2E
  via the UI (phone OTP). Files: `telegram-connect-modal.tsx`, `api/auth/telegram/link/route.ts`,
  `client-profile-page.tsx`.
- **Item 3 — VK (🔴) + stale domain:** the CORS error was a **next/link RSC prefetch** of the
  `/api/auth/vk/start` API route → switched the VK button to a plain `<a>` (no prefetch; top-level nav
  follows the external 302). `/login` now 0 console errors. **redirect_uri is read VERBATIM from env**
  (`VK_ID_REDIRECT_URI`/`VK_REDIRECT_URI` via `vk/config.ts`) — the stale `https://beautyhub.art/...`
  lives **only** in `.env`/`.env.local` (gitignored); **ZERO `beautyhub.art` in tracked code/config**
  (full-repo grep). Code has no fix to make → **🚩 deploy-checklist: set `VK_ID_REDIRECT_URI` +
  `APP_PUBLIC_URL` to the current domain (`мастеррядом.online`)**; live VK round-trip needs registered
  creds (deploy QA). Verified with a local env override → `redirect_uri=http://localhost:3001/...` (correct
  shape, no CORS). Files: `components/auth/vk-login-button.tsx`. Captures `.qa/diagnostics/fix-24/`.

**✅ FIX-20 (2026-06-18) — day-grouping-by-tz (QA-123 + isToday residual) + reset.ts cleanup. Verified on
a real prod build + DB reset/reseed.** Two display-tz items (same FIX-11-sibling class) + one dev-tooling.
- **Item 1 — QA-123 `toIsoDateKey` host-tz day-grouping (master self-view).** `getMasterScheduleWeek`
  grouped bookings/time-blocks into day columns + computed "today" via host-tz `toIsoDateKey`
  (`getFullYear/Month/Date`) → wrong column on a UTC prod host for an east-of-UTC master. **Consumer
  audit (per spec Phase A):** all `toIsoDateKey` consumers are in `master/schedule.service.ts`
  (booking grouping / time-block grouping / "today" — **entity-own-tz, fixed**) + UI week-nav (calendar
  dates, tz-independent — unchanged). **Studio schedule = FLAGGED, not changed:** it uses a *different*
  helper `toDateKey` = **UTC-based** (`getUTCFullYear/Month/Date`) — host-**independent** (deterministic,
  NOT the host-tz bug); aligning it to studio-tz is a larger rework of its UTC-day boundary/query model →
  separate follow-up (`STUDIO-SCHEDULE-UTC-DAY-GROUPING` 🔵). **Fix:** booking/time-block grouping +
  "today" now use `toLocalDateKey(date, master.timezone)`; `getWeekDays` gained a `todayIsoOverride` so
  the `isToday` column highlight uses master-tz. Engine range (`toKeyExclusive`) left as a calendar-date
  boundary → **slot generation untouched** (the change is purely display grouping; ScheduleEngine context
  unchanged). **Verified (`.qa/diagnostics/fix-20/`):** synthetic near-Almaty-midnight instant UTC
  `2026-06-17T21:00Z` (= Almaty 06-18 02:00) → NEW master-tz key = **`2026-06-18` under both TZ=UTC (host
  offset 0) AND TZ=Europe/Moscow (offset −180)** (host-independent + salon-correct); OLD host-tz key =
  `2026-06-17` on UTC vs `2026-06-18` on MSK (the host-dependent bug). Seed bookings (no near-midnight)
  group identically NEW==OLD → no regression for the common case.
- **Item 2 — `isToday` / «Ближайшая» tile host-tz residual (FIX-22/24 flag).** `ClientBookingDTO.isToday`
  used host-tz `setHours`, and the «Ближайшая» KPI tile formatted in the browser/viewer tz, so a
  cross-zone booking showed e.g. «Сегодня, 15:00» (viewer) instead of the salon 17:00. **Fix:** `isToday`
  now compares salon-tz date keys (`toLocalDateKey(start, salonTz)` vs now); the KPI `upcomingNext` carries
  the salon `timeZone`; `formatRelativeDateTime(iso, timeZone)` computes BOTH the time and the
  «Сегодня»/«Завтра» relative day in the salon tz. **Verified (prod, viewer Europe/Moscow browser, salon
  Asia/Almaty):** «Ближайшая» tile = **«21 июн., 17:00»** (salon) — matches the list row's **17:00** +
  «Время салона (Алматы, GMT+5)», NOT the Moscow-viewer 15:00. One number per booking. Both themes.
  Captures `.qa/diagnostics/fix-20/item2/`.
- **Item 3 — reset.ts cleanup gap (dev tooling).** Root cause: `Provider.ownerUserId` (+ `Studio`) is
  `onDelete: SetNull`, so deleting seed users **orphaned** their providers instead of deleting them — the
  reset's comment claiming a Provider cascade was wrong → `WeeklyScheduleConfig`/`WeeklyScheduleDay` (+
  services/bookings) survived a reseed (the stale weekday-0 that masked QA-116). **Fix:** `reset.ts` now
  deletes seed-owned providers explicitly (clearing their bookings first for the `Booking.serviceId`
  Restrict), cascading schedule config / services / studios / memberships. **Verified:** reset → 0
  providers / 0 config / 0 weekday rows (was 43/43/301 surviving); reseed → 43 providers ↔ 43 config (1:1),
  0 orphans, **WeeklyScheduleDay weekday only 1–7 (no weekday-0), 43 each** (FIX-08 ISO invariant holds).
  **Regenerated clean baseline** `.qa/snapshots/post-seed.dump` (old → `post-seed.pre-fix20.dump`;
  restore-verified). **🚩 the new dump is the harness baseline going forward; older dumps superseded.**
- Files: `master/schedule-utils.ts`, `master/schedule.service.ts`, `client-cabinet/bookings.service.ts`,
  `client-bookings-page.tsx`, `prisma/seeds/test-data/reset.ts`. typecheck/lint(1-3 baseline)/encoding/
  mojibake/**722 tests**/build ✅.

**✅ FIX-25 (2026-06-18) — FINAL last-pass (campaign closure). Copy fix + 2 dev-only docs + proven-safe
legacy sweep. Full suite green; verified on the current prod build.**
- **Item 1 — QA-106 🔵 off-schedule rejection copy (UI_TEXT only, no logic, Booking untouched).** Audit:
  the SLOT_CONFLICT (409) is special-cased by BOTH booking widgets, so real users never see the raw server
  string — the **studio** flow maps it to `bookingWidget.errors.slotTaken` (`BookingError`), the **master**
  flow to a `ConflictPhase` (`publicProfile.bookingWidget.conflictHeading`/`Body`). Both widgets only offer
  valid slots, so SLOT_CONFLICT there is a genuine race ("кто-то записался первым" — accurate). The
  **misleading off-schedule copy is the server message** (`booking-core.ts` `hasSlot=false` throw), shown
  only to **direct-API** callers. **Fix:** reworded the generic studio `bookingWidget.errors.slotTaken`
  «Это время только что заняли…» → **«Это время недоступно для записи. Выберите другое свободное окно.»** —
  accurate for both off-schedule AND taken. Confirmed in the built client chunk; `BookingError` maps
  SLOT_CONFLICT→this key; `check:ui-text` ✅. The master `ConflictPhase` copy left as-is (accurate for its
  only reachable case — genuine race). **Residual (documented, NOT fixed — guardrail "Booking untouched"):**
  the server `booking-core.ts` off-schedule message still reads «Окошко уже занято…» for **direct-API**
  consumers; rewording it is a server-string change scoped out of "UI_TEXT only". File: `lib/ui/text.ts`.
- **Item 2 — dev-only findings DOCUMENTED (no code change).**
  - **QA-101 (was 🔴 Blocker) → ✅ dev-only, NOT a prod issue.** The slot-engine routes (`/u/[username]`,
    `/u/[username]/booking`, `/api/public/providers/[id]/slots`) 500'd in DEV with a **jest-worker** wrapper
    error — the finding itself required prod confirmation. **Re-confirmed on the current prod build (`next
    start` :3001): all three return 200** (`/u/polina-orlova-4` 200, its `/booking` 200, slots API 200 with
    real `{timezone, slots[]}` data). Definitively a dev-worker/Windows/Node artifact, not a module-graph
    throw. No code change.
  - **QA-117 (🔵) → ✅ dev-only, NOT a defect.** `/admin/reviews?tab=all` slow-first-render in dev is a
    dev compile-latency artifact (a 3.5s wait renders all reviews; the API returns 200). Compiled prod
    routes don't exhibit it. No code change.
- **Item 3 — legacy-page sweep (PROVEN-SAFE; 3 deletions, the named candidates flagged).** Per-file
  zero-import proof (`grep` of exact import paths + dynamic/barrel/test/seed checks):
  - **DELETED (zero importers — proven):** `src/features/studio/components/studio-clients-page.tsx`,
    `studio-reviews-page.tsx`, `studio-profile-page.tsx` (the OLD studio cabinet, superseded by
    `studio-cabinet/`). Zero imports of their exact paths, no dynamic/barrel/test/seed refs, they import
    nothing from `studio/components` (no cascade), and the studio-cabinet helpers they used remain imported
    by the live `studio-settings-page`. typecheck + **build + 722 tests** green after deletion = safety net.
  - **FLAGGED / KEPT (still imported — left per the rule):**
    - Legacy `studio/components/studio-services-page.tsx` — imported by `studio-settings-page.tsx` (which is
      LIVE via 3 sub-routes: `/cabinet/studio/settings/{general,portfolio,profile}`). → not zero-import → kept.
    - `studio/components/master-card-drawer.tsx` — imported by the legacy `studio-services-page.tsx`. → kept.
    - `studio/components/studio-settings-page.tsx` (837 LOC) — 3 live sub-route importers. → kept (Phase-7
      retire after portfolio+profile sub-routes get the studio-cabinet redesign).
    - `moneyRUBPlain` (`lib/format.ts`) — its only caller is the legacy `studio-services-page.tsx`; since that
      page stays → **caller remains → both left** (per "if any caller remains → leave both").
    - `@deprecated` files — only 2 carry the tag: `FeatureGate.tsx` (16 importers; `@deprecated` is a
      prop-level marker on a live component) + `focal-image.tsx` (58 importers; migration note). Neither is
      a zero-import file → kept.
- **Item 4 — full-suite validation: typecheck ✅ · lint ✅ (1 error / 3 warnings, pre-existing baseline) ·
  encoding ✅ · mojibake ✅ · check:ui-text ✅ · `npm run test` ✅ 722/722 · `npm run build` ✅ · prisma not
  touched.** Files: `lib/ui/text.ts` (+3 deletions).

---

## 🏁 CAMPAIGN-CLOSURE LEDGER (2026-06-18) — pre-launch self-QA complete

**Every finding's disposition:**
- **Fixed (shipped this campaign):** QA-001 login hydration (FIX-01/09), QA-105/109 kopecks pricing,
  QA-108 prod-exit guard, QA-112/116 seed weekday ISO (FIX-08), QA-113/QA-123 host-tz grid + day-grouping
  (FIX-11 + FIX-20), QA-119 mobile bottom-nav (FIX-07), RULE-12 schedule/billing id leaks (FIX-19),
  IMG resilience (FIX-21), QA-107 salon-tz display + label (FIX-22), `isToday`/«Ближайшая» salon-tz (FIX-20),
  CSP `unsafe-eval` /login (FIX-23), prod CSP theme-nonce + Telegram frame-src/connect + VK CORS (FIX-24),
  reset.ts cleanup + clean baseline dump (FIX-20), QA-106 off-schedule UI copy (FIX-25).
- **Documented dev-only (no code change):** QA-101 (jest-worker; prod 200 confirmed), QA-117 (dev compile latency), QA-101-adjacent dev console noise.
- **Flagged residuals (🔵, not launch-blocking):** `STUDIO-SCHEDULE-UTC-DAY-GROUPING` (studio day-grouping is
  UTC-based — host-independent, not the host-tz bug, but not studio-tz-aligned), `FOOTER-VK-HANDLE-FIX`
  (footer `vk.com/beautyhub` community handle), QA-106 server-string off-schedule message (direct-API only),
  legacy `studio-settings-page`/`studio-services-page`/`moneyRUBPlain` (kept — still imported by live legacy
  sub-routes; retire when studio-settings portfolio/profile get the redesign).
- **Deploy-checklist / env items (outside the codebase):** VK `VK_ID_REDIRECT_URI` + `APP_PUBLIC_URL` →
  set to `мастеррядом.online` (stale `beautyhub.art` lives only in `.env`/`.env.local`, gitignored; 0 in
  tracked code); live Telegram + VK round-trip = registered-creds deploy QA; SMS gateway live creds; the
  4 DevOps infra decisions (Postgres hosting / TLS / backups / rollback).
- **Deliberate non-actions (accepted):** RULE-12-BOOKING-CONTRACT-OPTIONAL (booking flow legitimately needs
  internal ids client-side per invariant #12 exceptions); the new `post-seed.dump` is the canonical baseline
  (older dumps superseded).

**Launch-ready:** booking / schedule / auth / payments logic verified across passes; prod build green;
722 tests; CSP strict (no wildcard / no `unsafe-eval`); salon-tz display consistent; clean seed baseline.
**Remaining before launch is operational, not code:** the deploy-env items + live-creds social-auth QA +
DevOps infra decisions above.

**✅ FIX-09 (2026-06-16) — env.ts client `NEXT_PUBLIC_*` inlining root fix (the QA-001 root, app-wide).**
- **Bug:** the client branch was `env = process.env as AppEnv`; reading `env.NEXT_PUBLIC_X` via that
  alias defeats Next/webpack's static `process.env.NEXT_PUBLIC_X` inlining → **every** client consumer
  got `undefined`. (Introduced by the ENV-DISCIPLINE `process.env.X`→`env.X` sweep.)
- **Fix:** client branch now builds an explicit object from **literal** `process.env.NEXT_PUBLIC_X`
  references — full set enumerated from the schema: `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_VK_ENABLED`, `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` — **plus `NODE_ENV`** (needed so
  `isProduction` is correct client-side; `push-manager` early-returns on `!isProduction`). Server branch
  + fail-fast untouched. File: `src/lib/env.ts` (client branch only).
- **Verified (prod `next start`):**
  - **Static inlining:** `master_ryadom_ru_bot` now in **4 client chunks** (incl. the profile page); was 0.
  - **telegram-connect-modal** (reads `env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` **directly**, no prop):
    modal opens to the real connect widget — **no "Подключение Telegram недоступно"** (was broken/undefined
    on client for all users pre-fix). The headline proof the root fix works beyond login.
  - **/login** #418 gone in light AND dark (QA-001 stays green, 3/3); input-wipe gone.
  - **Login smoke 5/5** on prod (master/studio/master-in-studio/client + site-admin → /admin).
  - **push-manager:** both former blockers fixed — `isProduction` now true client-side (NODE_ENV inlined)
    + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` inlined (set in env). install/update-prompt (`isProduction`) benefit too.
  - **No new hydration mismatch** (values inlined identically server+client).
  - Computed flags recompute from real values (`isVkNotificationsEnabled` string-coerce intact; server-only
    flags like `isPushEnabled`/`isVkAuthEnabled` stay correct — they gate on server-only secrets absent on client).
  - Login buttons left on the QA-001 props (defensive; the env fallback now also works, but props keep QA-001
    green independent of env.ts). Evidence: `.qa/diagnostics/fix-09/`.
- **Observations (pre-existing, NOT FIX-09):**
  - `booking-happy-path.spec.ts` fails at "pick a time slot" — the date strip offers **today** as the first
    enabled day, but at the run time (00:54 MSK) today's 10–19 slots are all past the booking cutoff →
    "В этот день мастер занят" → 0 slots; the test picks the first enabled day and gets the exhausted one.
    The booking widget itself works (renders **34 slots** on a day with availability; reads no env, relative
    same-origin fetch → FIX-09-independent). Date-grid marks today enabled even when exhausted — a date-grid/
    time-grid TZ-edge (QA-113/QA-107 family). **Fix: make the test pick the first day WITH slots** (or the
    date-grid disable an exhausted today).
  - `.env` has a **trailing-space typo** in `NEXT_PUBLIC_YANDEX_MAPS_API_KEY ` → the key never matches
    `process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY` → empty on BOTH server and client (catalog-map key unset
    regardless of FIX-09). Pre-existing env typo — fix the `.env` line.

**✅ FIX-10 (2026-06-16) — three quick wins + a FIX-09 regression catch.**
- **Item 1 — maps-key "typo": FALSE ALARM (no real bug).** dotenv parses `KEY = value` correctly
  (`KEY = b9f5…` → key `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, no trailing space) and the value was already
  inlined into 4 client chunks (FIX-09). **Runtime-verified:** /catalog map view fires
  `api-maps.yandex.ru/2.1/?…&apikey=b9f5c172…` — the key reaches the Yandex loader. Tracked templates
  (`.env.example`, `.env.production.example`) already use the correct `KEY=` format → **no tracked-file fix
  needed.** Normalized the local (gitignored) `.env` line `KEY = value`→`KEY=value` for tidiness. (Tile
  rendering still depends on the key being a valid Yandex key — ops, not code.)
- **Item 2 — booking-happy-path determinism:** the spec now iterates enabled days and picks the **first
  day with selectable slots** (skips an exhausted today) instead of the first enabled day → passes at any
  time of day. Verified PASS at ~01:30 MSK (the exact hour that broke it in FIX-09). File:
  `.qa/specs/client/booking-happy-path.spec.ts`.
- **Item 3 — QA-122 (🟡) date-grid exhausted-today empty state.** Chose the **clear empty-state** option
  (Option B): disabling in the date-grid (Option A) wasn't cleanly feasible in scope — date-grid has no
  `serviceId`/slot data and day-enablement comes from the out-of-scope `/booking-days` endpoint. time-grid
  now shows an accurate message: `emptyDay` "Свободных окон в этот день нет" (was the misleading "В этот
  день мастер занят") + `emptyDayToday` "На сегодня свободных окон не осталось" when the selected day is
  today (provider tz). **Verified both themes** — exhausted ПН 15 → 0 slots, no "мастер занят", accurate
  copy; Вс disabled (Sunday-off); a slots day still renders + booking completes (booking-happy-path).
  Files: `time-grid.tsx` + 2 `UI_TEXT` keys. Screenshots `.qa/diagnostics/fix-10/`.
- **🔧 FIX-09 regression caught by FIX-10's `npm test` (28 auth/token failures).** FIX-09's parse-fail
  fallback returned `clientEnv` (only NODE_ENV + 6 NEXT_PUBLIC) for **all** runtimes — so in the
  test/server runtime where the full Zod parse fails (no DATABASE_URL), `env.AUTH_JWT_SECRET`/
  `OTP_HMAC_SECRET` vanished → jwt/otp/client-key-token/master-view-token tests failed. Fixed: the
  parse-fail fallback now branches on `isServerRuntime` — **server** → full `process.env` (secrets intact),
  **client** → `clientEnv` (literal-inlined NEXT_PUBLIC). 698/698 green. (FIX-09 ran build but not
  `npm test`, per its own validation list — FIX-10's test run surfaced it.) File: `src/lib/env.ts`.


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

**✅ QA-112 — RESOLVED in FIX-08 (2026-06-15).**
- **Capacity "0ч"** — root cause in `dashboard.service.ts resolveTodayWorkingWindow`:
  it queried `WeeklyScheduleDay` with `now.getUTCDay()` (JS 0=Sun…6=Sat, server UTC
  day), but the rows use ISO 1–7 (Sunday=7, no weekday-0 row) → Sunday always missed →
  "0ч", and it ignored the provider tz. Fixed to `getDayOfWeek(now, provider.timezone)`
  mapped to ISO (`jsDay === 0 ? 7 : jsDay`). Verified live: Anna (Asia/Almaty, Tuesday
  there) now shows **"3 из 10ч"** (was "из 0ч"). Aligns with the QA-116 seed convention.
- **"vs прошлая суббота"** — a hardcoded sublabel claiming a comparison that is never
  computed (KPI tiles carry no trend deltas, by design). Replaced with the honest
  descriptive `todayRevenueSub: "По записям на сегодня"`. ("vs прошлая неделя" on the
  week tile left as-is — generic, not flagged.) Both themes screenshotted →
  `.qa/diagnostics/fix-08/qa112-dashboard-{light,dark}.png`. Files: `dashboard.service.ts`,
  `src/lib/ui/text.ts`.

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

**✅ RESOLVED — FIX-04 (2026-06-15): entity-own-tz for the self-view display sites.**
Each QA-113 offender classified (fix self-view / leave engine-internal / defer to QA-107):

| Site | Classification | What changed |
|---|---|---|
| `bookings.service.ts:83 formatWhenLabel` | **FIX** (master self-view) | Now formats in the master's provider `timezone` via `getLocalTimeParts`/`getDayOfWeek`/`toLocalDateKey`. Provider tz loaded once in `getMasterBookingsForKanban`. Format/locale unchanged. |
| `notifications.service.ts isToday` + day grouping | **FIX** (master self-view) | "today" + `groupNotificationsByDay` now use the master's tz (loaded from `masterId`). |
| `studio-cabinet/.../notifications-data.service.ts isToday` + grouping | **FIX** (studio self-view) | Same, using the studio's provider tz; `loadStudioNotificationsData` now takes `studioProviderId` (page passes `resolveCurrentStudioAccess().providerId`). |
| `group-by-day.ts` (shared by master+studio, **no client caller**) | **FIX** (plumbing) | `groupNotificationsByDay` + `describeDay` gained an optional `timeZone`; TZ-aware "today/yesterday/dated" when supplied, legacy process-TZ fallback otherwise. |
| `master-dashboard-page.tsx isWeekend` | **FIX** (master self-view) | `getDayOfWeek(now, data.master.timezone)` instead of `now.getDay()`. |
| `schedule.service.ts:103 minuteOfDay` (+ grid hour-range) | **✅ FIXED — FIX-11 (QA-113 residual, 2026-06-16)** | **Classified GRID-ONLY, not engine-coupled.** Grep proved `minuteOfDay` is a private helper in `schedule.service.ts`, consumed only within that file (booking/timeblock grid offsets + `freeSlotsToday`/`loadPct` KPIs) and surfaced only via `getMasterScheduleWeek` → `master-schedule-page.tsx`. The availability engine (`src/lib/schedule/*`) has zero `getHours`/`minuteOfDay` usage — its working intervals arrive as entity-local HH:MM strings (`hhmmToMinutes`). Fix: `minuteOfDay(date, timeZone)` now uses `getLocalTimeParts(date, master.timezone)` so grid card offsets are stable & correct regardless of host tz. Engine untouched (proved: TZ=UTC slots byte-identical to MSK, same SHA256). UTC grid screenshots now match MSK (diff <0.18%, only top-nav chrome). `.qa/diagnostics/fix-11/`. |
| `schedule-utils.ts` date keys/week math | **LEAVE — engine internal** | TZ-safe per QA-07; do-not-touch. |
| `model-offers-stats.ts formatOfferDate` | **LEAVE — false positive** | Operates on a `dateLocal` string via `new Date(y,m-1,d)` read back in the same process TZ → TZ-stable (no UTC instant). Comment confirms intent. |
| `model-offers-view.service.ts:661 formatDateKey` | **LEAVE — internal key** | Grouping key, not a display label (per "only if display"). |
| `reviews-stats.ts startOfMonth/startOfPrevMonth` | **DEFER (low-pri)** | Month-trend **aggregation** bucketing, not a clock label; only a near-month-boundary review (e.g. 23:00 UTC on the 31st) could misbucket the trend %. Not the "master misreads their schedule" harm. Needs provider tz plumbed into `computeReviewStats`; refinement, not pre-launch. |

**No-regression proof (the 🔴-risk check) — availability under TZ=UTC == MSK baseline:**
Re-ran the dev server under `TZ=UTC` (verified host TZ). Galina (`Europe/Moscow`) public slots:
Tue 2026-06-16 → **17 slots, first `07:00:00Z` (=10:00 MSK), last `15:00:00Z` (=18:00)**; Sunday 2026-06-21 (day-off) → **0 slots** — **identical** to the MSK baseline. The TZ-safe engine is untouched. `.qa/diagnostics/fix-04/` (+ dev log).

**Fix proof — master labels are entity-local under TZ=UTC (not UTC):**
Logged in as Anna (`Asia/Almaty`, UTC+5) on the UTC host; her kanban labels = UTC+5, NOT raw UTC:
06-16 `10:00Z`→**15:00**, `11:00Z`→**16:00**, `15:00Z`→**20:00**; 06-17 `12:00Z`→**17:00**, `14:00Z`→**19:00**; 06-18 `12:00Z`→**17:00**; 06-19 `10:00Z`→**15:00**; 06-21 `15:00Z`→**20:00**. (Old code on a UTC host showed the raw UTC clock.) Screenshot `anna-kanban-utc-almaty-local.png`. `booking-happy-path.spec.ts` also passes under UTC.

**Client-facing groupings (group-by-month etc.) remain DEFERRED to the QA-107 per-viewer track** — `group-by-day`'s optional `timeZone` is only passed by the master+studio (self-view) callers; client surfaces are untouched here.

**✅ QA-107 — RESOLVED (FIX-22, 2026-06-17). Model: salon-tz + explicit «(город, GMT+N)»
label, uniform.** The product decision pivoted from the "per-viewer-city TZ" assumption below to
showing every client-facing time in the **salon's (entity) timezone** with an explicit zone label
(emphasized only when the viewer's zone differs). Centralized in
[`src/lib/ui/zone-label.ts`](src/lib/ui/zone-label.ts) (DST-aware, 12 vitest). Fixed a real bug —
«Мои записи» `DateBadge` + `group-by-month` had rendered in the **viewer's host/browser tz** (the
exact symptom recorded below); now salon-tz via `provider.timezone` threaded into `ClientBookingDTO`.
Label added to slot picker / confirmation / server reminders. **🔴 engine-safety proven** — public
slots over 14 days under `TZ=UTC` vs `TZ=Europe/Moscow` are byte-identical (same SHA256) → render-only,
slot engine untouched. **Live cross-zone** (`.qa/diagnostics/fix-22/`, both themes): viewer=Moscow +
salon=Yekaterinburg → slot times stay salon-local (10:00–18:00, NOT Moscow 08:00) with «(Екатеринбург,
GMT+5)»; same-zone → label omitted. Full detail in BACKLOG QA-107. Original observations preserved
below for history:

**✅ QA-107 residual manual-QA — CONFIRMED LIVE (FIX-23 pass, 2026-06-17, prod build).** Closes the
FIX-22 residual gap ("a logged-in screenshot of «Мои записи» + a sent reminder are residual manual-QA").
Cross-zone: viewer **Москва (GMT+3)**, salon **Asia/Almaty (GMT+5)**, logged-in client Елена Петрова,
booking `seed-bk-showcase-client-01` (12:00 UTC). **«Мои записи» list row** → `18 ИЮНЬ · 17:00` +
«Время салона (Алматы, GMT+5)» (salon time, NOT the viewer 15:00) — matches the picker. **Live reminder**
(`notifyBookingReminder2h`) → "Через 2 часа: … 18.06, **17:00 (Алматы, GMT+5)**" (salon-tz + label). Both
✅. Captures `.qa/diagnostics/fix-23/qa107-residual/`. **Residual still open (→ FIX-20):** the «Ближайшая»
KPI tile + day-group header render host/viewer-tz («Сегодня, 15:00») — the documented
`ClientBookingDTO.isToday` host-tz residual, NOT a list/reminder bug.

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

**✅ QA-116 — RESOLVED in FIX-08 (2026-06-15).**
- **Reader audit first (no 0–6 consumer found):** the engine (`engine-context.ts` JS-Sun→7),
  `analytics/domain/kpi.ts:199` (`weekday === 7 ? 0`), and the slots routes
  (`dayIndexFromDateKey(dateKey) + 1`) all read this field as **ISO 1–7**. Proceeded.
  (`studio-cabinet/analytics/lib/types.ts` "0=Sun..6=Sat" is a heatmap **output** DTO from
  `getDayOfWeek`, not a reader of `WeeklyScheduleDay.weekday`.)
- **Two offenders fixed** (seed only): `seed-providers.ts` (bulk masters) + `seed-showcase-studio.ts`
  (studio masters) — loops changed `for 0..6 / Sun=0 off` → `for 1..7 / Sun=7 off`.
  `seed-showcase-master.ts` (Anna) was already 1–7 — untouched. `buildVisionSchedulePayload`
  (a ScheduleChangeRequest **editor-snapshot** `dayOfWeek`, separate convention) — out of scope.
- **Verified:** wiped schedule tables + re-seeded → `WeeklyScheduleDay` distinct weekday =
  **only 1–7** (no weekday-0). Correct-day render via public slots API (galina, Europe/Moscow):
  **Sunday 2026-06-21 → 0 slots (day-off)**, Tuesday/Saturday → slots present (10:00 first). No
  off-by-one. NOTE: `reset.ts` doesn't clear `WeeklyScheduleConfig` (Provider survives the
  user-cascade via `ownerUserId` SetNull) → a reseed-over-existing leaves stale weekday-0 rows;
  a fresh DB / table wipe produces clean 1–7. Files: both seed generators.
  **✅ reset.ts gap CLOSED — FIX-20 Item 3 (2026-06-18):** `reset.ts` now deletes seed-owned providers
  explicitly (cascading schedule config) + a clean `post-seed.dump` baseline regenerated. See FIX-20 above.

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

**✅ QA-114 — RESOLVED in FIX-06 (2026-06-15): approval feedback in the schedule editor.**
New client island `studio-approval-banner.tsx` consumes the shared auto-save status
(`useSaveStatus`) inside the existing `SaveStatusProvider`. `schedule-settings-page.tsx`
(server) detects a studio master via `Provider.studioId`, loads the studio name (from
the studio's provider row) + whether a `ScheduleChangeRequest` is already PENDING, and
passes `studioApproval={ studioName, pending }` to `ScheduleSettingsBody`. The banner:
(a) shows a persistent info line "Вы в команде студии «{studio}». Изменения расписания
отправляются на одобрение…" + a **«Ожидает одобрения»** badge when a request is already
pending at load; (b) on a successful save flips to "Изменения отправлены на одобрение
студии «{studio}»…" and shows the pending badge. **Independent masters (`studioId`
NULL) → `studioApproval` is `null` → no banner (no regression).** Approval mechanics +
schedule engine UNTOUCHED — only the already-returned state is surfaced. Strings:
`UI_TEXT.cabinetMaster.scheduleSettings.studioApproval.{infoTemplate,sentTemplate,pendingBadge}`.

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

**✅ QA-115 — RESOLVED in FIX-06 (2026-06-15): affiliation on public profile + cabinet.**
- **Data layer** (`public-profile-view.service.ts`): `MasterPublicProfileView` gains
  `studio: { name; publicUsername | null } | null` via the `Provider.studio` relation
  (`select { name, publicUsername, isPublished }`). `publicUsername` is exposed **only
  when the studio is `isPublished`** (else `null`) — rule 12: never an internal CUID;
  unpublished studios show the name without a link. `null` for independent masters.
- **Public profile** (`hero-block.tsx`): renders a "Часть студии «{name}»" pill under
  the tagline. Links to **`/u/{publicUsername}`** (studio's public profile) when
  linkable; plain chip otherwise. String: `UI_TEXT.publicProfile.hero.studioAffiliationTemplate`.
  **No internal id in the link** (verify: inspect href — `/u/<publicUsername>`).
- **Cabinet** (`master-dashboard-page.tsx` + `dashboard.service.ts`): the dashboard
  service now returns `master.studio: { name } | null` (via the same relation); the
  dashboard renders a "Студия «{name}»" chip above the greeting for studio masters.
  String: `UI_TEXT.cabinetMaster.dashboard.studioChipTemplate`. Independent masters →
  nothing shown. Public profile + booking flow otherwise unchanged.
- **Validation:** typecheck ✅ · lint baseline preserved (1 error / 3 warnings — all
  pre-existing in email-verify-modal/client-profile-page/use-active-role; FIX-06 added
  zero new lint problems) · encoding ✅ · mojibake ✅.

**✅ FIX-06-VERIFY (2026-06-15, dev server, Playwright `chromium` + storageState) — 12/12 PASS.**
Phase 0: docker up, `/api/health` green, `post-seed.dump` restored (SCR `seed-vision-scr-01`
PENDING), Marina/Anna sessions refreshed via `smoke.spec.ts` (the stored states had expired →
cabinet redirected to /login; **not a FIX-06 defect**). Script: `.qa/diagnostics/fix-06/verify-fix-06.mjs`.
- **QA-114 PASS** — Marina: info banner «Вы в команде студии «Vision Beauty Studio»…» + **«Ожидает
  одобрения»** badge at load; editing slot-step (30→60) in the Hours tab flipped the banner to
  «Изменения отправлены на одобрение студии…». **Live schedule UNCHANGED** (DB: `Provider.slotStepMin`
  stayed **30**, WeeklyScheduleDay untouched) while the edit routed into the pending SCR (`updatedAt`
  advanced 06-14 21:56 → 06-15, status still PENDING) — master cannot bypass approval. **Anna** (independent):
  no banner (no regression). Banner renders + stacks correctly at mobile 390×844.
- **QA-115 PASS** — Marina public profile shows the «Часть студии «Vision Beauty Studio»» pill; link
  href = **`/u/vision-studio`** (studio's publicUsername — **no internal CUID**, rule 12 ✅) and navigates
  to the studio's public page (renders «Vision Beauty Studio»). Marina dashboard shows the «Студия «…»»
  chip. **Anna**: profile + cabinet clean (nothing studio-related). Both themes (light/dark) + mobile —
  no contrast/overflow issues on banner/badge/chip.
- Screenshots → `.qa/diagnostics/fix-06/` (qa114-marina-settings-{light,dark,mobile}, qa114-marina-edit-sent,
  qa114-anna-settings-light, qa115-marina-profile-{light,dark,mobile}, qa115-marina-dashboard-{light,dark},
  qa115-anna-profile-light). No FIX-06 source changed during verification.


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

**✅ QA-101 — DOCUMENTED dev-only, NOT a prod issue (FIX-25, 2026-06-18). No code change.** Re-confirmed on
the current prod build (`next start` :3001): `/u/polina-orlova-4` → 200, `/u/polina-orlova-4/booking` → 200,
`/api/public/providers/<id>/slots` → 200 with real `{timezone, slots[]}` data. The DEV 500 is the
jest-worker dev-wrapper artifact (not a module-graph throw). Original (DEV-observed) finding ⤵

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

**✅ QA-103 RESOLVED — FIX-13 (2026-06-16).** Removed internal `id` from the
public `CatalogProviderItem` DTO (`catalog.service.ts` type + mapping). The
pagination cursor was already opaque base64url (`encodeCursor`) — unchanged.
All consumers repointed to `publicUsername`: catalog-card (profile link =
`providerPublicUrl` → `/u/<username>`; hue placeholder = `hueFromId(publicUsername)`;
favorite POST sends `providerUsername`), catalog-page-client (local item type +
React keys + `favoriteSet` membership + map-point key), top-masters-section,
catalog-page (`getFavoriteProviderUsernames`). Favorites endpoint now accepts
`providerId` **or** `providerUsername` (`favoriteToggleSchema` union →
`toggleProviderFavorite` resolves username→id; authed cabinet / public-profile
hero keep using `providerId`). **No booking-flow dependency on the raw id** —
booking starts from `/u/<username>/booking`. **Verified** (`.qa/diagnostics/fix-13/`):
`/api/catalog/search` → 20 items, **0 `id` keys**, 0 CUIDs in JSON, 20
`publicUsername`; cursor round-trips to page 2 (no id leak); catalog cards link
`/u/<username>` (0 `/providers/<id>` links); favorites toggle POSTs
`providerUsername` and returns 200.

**✅ QA-104 RESOLVED — FIX-13 (2026-06-16).** New shared builder
`src/features/catalog/lib/catalog-url.ts` (`buildCatalogUrl`) emits the names the
catalog reader is canonical for — `serviceQuery`, `globalCategoryId` (a real
GlobalCategory **id**, resolved via `findUnique({where:{id}})`, not a slug),
`availableToday=true`, `hot=true`, `sort`. Repointed all builders: hero search
(`q` → `serviceQuery`), category tiles (`category=<slug>` → `globalCategoryId=<id>`),
footer "Мастера рядом" (`available=today` → `availableToday=true`); hot-slots +
footer "popular" routed through the builder too (drift-proofing). Reader applies
all three (`catalog-page-client.tsx:344-353`) → schema accepts → service filters.
**Verified** (Playwright, desktop + mobile, `.qa/diagnostics/fix-13/`): footer href
= `availableToday=true`; category href = `globalCategoryId=`; hero search lands
`/catalog?serviceQuery=…` (no `q=`); available-today deep-link lands with the
"Свободно сегодня" toggle ON (filter applied) + reload preserves the param.

**✅ RULE-12-SWEEP RESOLVED — FIX-14 (2026-06-16).** Two more public CUID leaks
(found by FIX-13's audit), each fixed with the QA-103 pattern:
- **Surface 1 — search-by-time `AvailabilityProviderItem.providerId`:** stripped from
  the public response (`service.ts` keeps it internal-only for smart-count ranking,
  omits it from output). Consumers → `publicUsername` (profile link, slot-bubble
  provider, map-point key; `toMapPoint` discriminant `"providerId" in item` →
  `"slots" in item`; card key). `service.id` kept = documented booking-flow exception
  (slot deep-link `/u/<username>?serviceId=` preselects the service). Verified:
  `/api/search/availability` JSON has **0 `providerId`**, the only CUID is `service.id`,
  `publicUsername` present, slots correct. (search-by-time cards have no favorite button
  — the "favorite 200" check is N/A for this surface.)
- **Surface 2 — `/models/[code]` `public.service.ts`:** `service.id` / `category.id` /
  `master.id` were **unnecessary leaks** (no public consumer; apply/booking is
  `publicCode`-addressed and resolves master+service server-side — `applyModelOfferSchema`
  = `{consentToShoot, note?, mediaIds}`). Stripped all three. Verified: rendered page has
  **0** of the offer's master/service/category CUIDs; master links `/u/<username>`;
  **booking completes end-to-end** (Playwright apply → 2xx + "Заявка отправлена!", body
  carries no serviceId/masterId).
- **Thoroughness note — rule-12 is NOT yet fully clean.** The sweep grep found **two
  further** surfaces (filed `🟡 RULE-12-REMAINDER` in BACKLOG): portfolio-feed item id
  (`feed/portfolio.service.ts`, used in `/api/home/portfolio/[id]` + `/api/portfolio/[id]/favorite`)
  and stories item id (`feed/stories.service.ts`, client-side view-tracking). Accepted
  patterns (not leaks): `GlobalCategory.id` as the category-filter param (app-wide,
  catalog + models), `serviceId`-in-URL booking-flow exception, provider id in
  `/api/public/providers/[id]/*` path (booking-flow exception).

**✅ RULE-12-REMAINDER RESOLVED — FIX-15 (2026-06-16).** Portfolio feed + stories ids
now opaque (shared `src/lib/public-id.ts` `encodePublicId`/`decodePublicId` — base64url
+ `e_` prefix, reversible, backward-compatible).
- **Portfolio** — `id`/similarItems.id opaque-encoded; 3 routes decode server-side;
  pagination cursor decodes on input; `masterId` stripped (link via `masterPublicUsername`),
  unused `serviceIds` stripped; `serviceOptions[].serviceId` kept (booking-flow exception).
  Verified: feed/detail JSON 0 raw CUIDs (only serviceId), detail decodes (200; bad token→404),
  favorite toggles via token (200, idempotent).
- **Stories** — `id` + `masterId` opaque-encoded (client-side keys/dedup/localStorage view-
  tracking; no server route); `/providers/<masterId>` fallback link dropped (→ `/u/<username>`).
  Verified: feed JSON 0 raw CUIDs; view-tracking stores the opaque token (no CUID in localStorage).
- **Rule-12 status (honest):**
  - ✅ **CLEAN (fixed):** `/api/catalog/search` (FIX-13), `/api/search/availability` (FIX-14),
    `/models/[code]` (FIX-14), `/api/feed/portfolio` + `/api/portfolio/[id]*` (FIX-15),
    `/api/feed/stories` (FIX-15).
  - ✅ **ACCEPTED EXCEPTIONS:** `serviceId`-in-URL (booking-flow preselect — catalog/search/
    models/portfolio-detail); `GlobalCategory.id` as the taxonomy filter param (catalog + models);
    pagination cursors (`encodeCursor` / `encodePublicId`).
  - 🟡 **REMAINING (filed `RULE-12-PROVIDERS`):** studio public profile leaks master provider
    CUIDs via `/api/providers/[studioId]/masters` → `studio-masters-carousel` (fetches
    `/api/providers/<id>` + portfolio by id); `/api/providers/[id]` read-by-CUID;
    `public-profile-view` ServicePackage/bundle ids (latent, unused). So FIX-15 is **not** the
    last rule-12 entry — the `/api/providers/*` provider-id family is the next sweep.

**✅ RULE-12-PROVIDERS RESOLVED — FIX-16 (2026-06-16). Comprehensive provider/studio/service
id pass.** Enumerated the whole `/api/providers/*` + provider-id family; classified each surface.
| Surface | internal id | fix |
|---|---|---|
| `/api/catalog/search`, `/api/feed/portfolio`, `/api/feed/stories` | — | **clean** (FIX-13/15), closing grep = 0 CUIDs |
| `public-profile-view` `PublicBundleView.id` | package CUID (React key only) | **stripped** |
| `public-profile-view` `servicePackage.findMany` raw row | id/masterId/createdAt/updatedAt | **`include`→`select`** (row no longer carries them; verified seed pkg CUID gone from `/u/<master>`) |
| `ProviderProfileDto.id` + `ProviderServiceDto.id` | provider/service CUID | **booking-flow exception** — slots (`/api/public/providers/<id>/slots`) + `createBooking({providerId})` + favorite all keyed by these (rule 12 exempts); documented in `dto.ts` |
| `ProviderProfileDto.studioId` | studio CUID | **booking-flow exception** — master-in-studio "book at studio" link |
| `/api/providers/[id]`, `/api/providers/[studioId]/masters` (masters[].id) | provider CUID | **booking-flow / browse→book exception** (carousel fetches each master's profile/portfolio to book) |
| `/api/feed/portfolio?masterId=<providerId>` | provider CUID (query) | **profile-fetch exception** (profile fetching its own portfolio) |
- **Fixed (genuine):** bundle.id + raw ServicePackage row fields. **Documented (booking-flow
  exception, rule 12 explicit):** provider/service/studio ids on the conversion path. Encoding
  these = a booking-endpoint CONTRACT change → flagged (`RULE-12-BOOKING-CONTRACT-OPTIONAL`),
  NOT done unilaterally (per FIX-14's principle).
- **Closing grep:** `/api/catalog/search`, `/api/feed/portfolio`, `/api/feed/stories` → **0 raw
  CUIDs**. `/api/providers/[id]` → only provider.id + service.ids (documented exception). Feature
  preserved: studio profile + masters carousel + provider read all 200.
- **🟡 NEW residual found (filed `RULE-12-OWNERUSERID-RSC`):** `getMasterPublicProfileView`'s
  internal `Promise.all([ownerRow, packages])` is RSC-flight-serialized on `/u/<master>` even
  though the function's RETURN is clean — leaking `ownerRow.ownerUserId` (owner UserProfile CUID).
  FIX-16 cleaned the packages half; the ownerUserId half persists (mechanism needs a runtime
  flight/`cache()` trace — no client prop carries it statically). Not guess-fixed.
- **Rule-12 status (honest):** every public response body is **clean** OR a **documented
  accepted exception** (booking-flow provider/service/studio ids; serviceId-in-URL; GlobalCategory
  taxonomy filter; pagination cursors). **NOT 100% encode-closed:** the booking-flow id family is
  kept-and-documented (encoding it = flagged contract change), and one RSC-serialization residual
  (`ownerUserId`) remains flagged. No *undocumented/unnecessary* leaks remain.

**✅ RULE-12-OWNERUSERID-RSC RESOLVED — FIX-17 (2026-06-16). Fixed at source.**
`getMasterPublicProfileView`'s internal `Promise.all([ownerRow, packages])` flight-serialized
`ownerRow.ownerUserId` (owner UserProfile CUID) into `/u/<master>` despite a clean return. Fix:
tightened the first query's `select` to drop `ownerUserId` (now `ownerMeta` = createdAt/slotStepMin/studio
only) and fetched the owner id separately into a **transient primitive** (`string | null`) used solely
as the `getCurrentPlan` arg — never on a row/tuple that reaches flight.
- **Verified:** flight payload capture of `/u/anna-sokolova`, owner CUID `cmqfmyf2n00w1vlfkgquc0nhq`
  occurrences **1 → 0** (`.qa/diagnostics/fix-17/{before,after}.html`). Page renders both themes
  (`render-light.png` / `render-dark.png`). `getCurrentPlan` / PREMIUM ring intact.
- **⚠️ Phase A "any OTHER internal user/profile CUID riding along?" → YES, a NEW cluster found.**
  The `/u/<master>` flight ALSO carries reviews-section CUIDs — but these come from a **different
  surface**: the reviews are fetched **client-side** via `GET /api/reviews?targetType=provider&targetId=…`
  (`reviews-section.tsx:17,81`), NOT through `getMasterPublicProfileView`. The leaking fields are in
  `listReviews` (`src/lib/reviews/service.ts`) DTO:
  - `review.authorId` (review author **UserProfile CUID**, 6× from showcase-client-05/06 reviews) —
    **pre-existing** (before=after=1, untouched by FIX-17). Used client-side for the own-review guard
    `currentUserId !== review.authorId` (`reviews-preview.tsx:43,60`).
  - `review.id` (Review CUID) — **pre-existing**. Used client-side for the report mutation
    `onReport(review.id)` → `POST /api/reviews/[id]/report`.
  - one request-variable id (`cmprfcdn7000x…`, before=0/after=1) — review-associated (varies per
    request; not in Provider/UserProfile/Review/Service tables checked), folded into the same item.
- **Why flagged, not fixed here:** `/api/reviews` is shared by master/client/studio cabinets + the
  public profile + the report route. `authorId`→server-computed `isOwnReview` boolean and
  `review.id`→opaque-encode (+ decode in `/api/reviews/[id]/report`) is a reviews-subsystem + report
  **mutation-contract** change across all consumers — exactly the class FIX-14/15/16 flag rather than
  expand inside a fix named "ownerUserId". Filed `🟡 RULE-12-REVIEWS` in BACKLOG.
- **Rule-12 line — HONEST status: NOT fully closed.** RULE-12-OWNERUSERID-RSC is the last leak on
  the `getMasterPublicProfileView` aggregator and it is **fixed**. But the diligent full-flight audit
  the prompt requested surfaced a genuine pre-existing reviews-author/review-id leak on the
  `/api/reviews` surface → rule-12 **cannot** be declared 100% closed. Accepted-exception list stands
  (booking-flow provider/service/studio ids; serviceId-in-URL; taxonomy filter; cursors). Deliberate
  non-action stands (`RULE-12-BOOKING-CONTRACT-OPTIONAL`). New flagged remainder: `RULE-12-REVIEWS`.

**✅ RULE-12-REVIEWS RESOLVED — FIX-18 (2026-06-17). + exhaustive whole-app rule-12 audit.**
`/api/reviews` (public; consumed by `/u/<master>` + `/u/<studio>` client-side) leaked
`review.authorId` (author UserProfile CUID), `review.id` (Review CUID), and `review.bookingId`
(Booking CUID). Fixed at source in the **shared** `toReviewDto` (`src/lib/reviews/types.ts`):
  - `authorId` → **dropped**; replaced by `isOwnReview: boolean` computed per-viewer server-side
    (`options.currentUserId === review.authorId`; anon → false). `listReviews` + `createReview`
    pass `currentUserId`. Public guard now `!review.isOwnReview` (`reviews-preview.tsx`).
  - `review.id` → **opaque-encoded** via `encodePublicId`. All `/api/reviews/[id]/{report,reply
    (POST+PATCH),suggest-reply,route(PATCH/DELETE)}` decode with `decodePublicId` (backward-compat:
    raw cabinet cuids pass through unchanged).
  - `bookingId` → made optional + **gated on `includePrivateTags`** (master/admin only); public/anon omit it.
  - Master cabinet shares the DTO: avatar seed `authorId`→`authorName`; reply/edit use the encoded
    id (routes decode). Studio/admin/client cabinets use their OWN mappers (raw cuids — exempt) → untouched.
- **Verified (`.qa/diagnostics/fix-18/`):** public `/api/reviews` payload keys = id(`e_…`)/isOwnReview/
  authorName/targetType/targetId/rating/text/publicTags/replyText/repliedAt/reportedAt/createdAt —
  **no authorId, no bookingId**. `/u/anna-sokolova` flight: **0** `"authorId"`, **0** author CUIDs,
  **0** raw review CUIDs (14 `e_` tokens only). Authed report via the **encoded** token → **200**
  (decode→write); legacy raw id → 401-not-400 (passthrough). Report row created → **baseline restored**
  (0 reported). Own-review guard works (anon=false asserted; creator=true via createReview). Both
  themes render with reviews + replies. Gates: typecheck/lint(1err/3warn)/encoding/mojibake/test(703)/build ✅.

**📋 Phase A — EXHAUSTIVE rule-12 inventory (definitive; ends incremental discovery).**
Cross-surface raw-CUID sweep of `/`, `/catalog`, `/u/<master>`, `/u/<studio>` flight + public APIs:

| id family / surface | internal id | classification |
|---|---|---|
| Provider id (`/api/providers`, profile, catalog) | provider CUID | **booking-flow exception** (rule 12 explicit) |
| Service id (services menu, `"isActive"`) | service CUID | **booking-flow exception** |
| `ProviderProfileDto.studioId` (master-in-studio) | studio CUID | **booking-flow exception** |
| Review `targetId` (= the viewed provider/studio) | provider/studio CUID | **booking-flow exception** (same id the viewer already has) |
| `publicTags[].id`, GlobalCategory.id | taxonomy CUID | **taxonomy exception** (parallels category filter) |
| pagination cursors (feed/portfolio/stories) | base64url | **accepted** |
| `/api/catalog/search`, `/api/feed/{portfolio,stories}`, search-by-time, `/models/[code]` | — | **clean** (FIX-13/14/15) |
| review `id` / `authorId` / `bookingId` | Review/User/Booking CUID | **✅ FIXED FIX-18** (encoded / isOwnReview / gated) |
| `getMasterPublicProfileView` `ownerUserId` + package row | User/package CUID | **✅ FIXED FIX-16/17** |
| **`WeeklyScheduleConfig` id + `days[].templateId`/day ids on `/u/<master>`** | schedule CUID | **🟡 NEW genuine leak → `RULE-12-SCHEDULE`** |

- **NEW: `RULE-12-SCHEDULE` (🟡 LOW).** `/u/<master>` flight carries a `WeeklyScheduleConfig` id
  (+ day/template ids), e.g. `{"id":"cmqfn1l4z…","days":[{"weekday":1,"templateId":…}]}`. Source:
  `computeAvailabilityHint` (`src/lib/master/public-profile-view.service.ts`) → `createScheduleContext`
  (`src/lib/schedule/engine-context.ts:191`); the rich context object is flight-serialized (same RSC
  mechanism FIX-17 fixed for `ownerUserId`) though the function returns only a clean `AvailabilityHint`.
  Severity **low** (internal scheduling-structure ids, not user/booking/review/payment; no public
  endpoint resolves them). **Not mechanical** — `engine-context` is shared engine infra (slots/booking);
  a safe fix needs an audit of downstream id usage before select-tightening / FIX-17-style transient
  handling. **Flagged** (user decision 2026-06-17), filed `🟡 RULE-12-SCHEDULE` in BACKLOG — NOT
  expanded into FIX-18 (flag-don't-expand discipline, FIX-14/15/16/17).
- **🔚 FINAL rule-12 statement (honest, complete — no more "and one more surfaced"):** the reviews
  surface is **closed**. Every other public egress is **clean** OR a **documented accepted exception**
  (booking-flow provider/service/studio ids — kept-and-documented, encoding = flagged
  `RULE-12-BOOKING-CONTRACT-OPTIONAL`; taxonomy ids; pagination cursors). **One** new low-severity
  undocumented leak remains: **`RULE-12-SCHEDULE`**. Rule-12 is therefore **not 100% closed**, but the
  **complete remaining list is now known in one shot** (RULE-12-SCHEDULE + the booking-contract decision)
  — the per-leak incremental discovery is over. *(Closed FIX-19 — see below.)*

**✅ RULE-12-SCHEDULE RESOLVED — FIX-19 (2026-06-17). Boundary fix; engine math untouched (TZ-proof). 🎉 rule-12 FULLY CLOSED.**
`/u/<master>` flight carried a `WeeklyScheduleConfig` id + `days[].templateId`/`templates[].id` CUIDs.
Root vector: `createScheduleContext` (`src/lib/schedule/engine-context.ts`) used `prisma.$transaction([...])`
whose **raw row results** were RSC-flight-serialized (same mechanism FIX-17 saw for `ownerUserId`),
even though the returned `ScheduleContext` is transformed (no ids) and `getMasterPublicProfileView`
returns only a clean `AvailabilityHint`.
- **Engine-consumption verdict:** `weeklyConfig.id` = **UNUSED** (only `.days` read) → dropped from select.
  `templates[].id`/`templateId` = **engine-load-bearing** (`templatesById` Map consumed by
  `engine.ts:34`, `resolve.ts:52`, `rule-adapters.ts:160` for override→template resolution) → kept in select.
- **Boundary fix (no engine math change):** converted the two read-only `$transaction([...])` calls inside
  `createScheduleContext` (weeklyConfig+templates; overrides+breaks) to **sequential awaits** — identical
  data, identical `ctx` the engine reads, but the combined-tuple promise React was serializing is gone.
  Dropped the unused `WeeklyScheduleConfig.id` (defense-at-source).
- **Bonus (same mechanism, same file):** the residual `cmprfcdn7000x…` (unidentified across FIX-17/18) was a
  **BillingPlan `planId`** (`{"planId":…,"planCode":"MASTER_PRO","tier":…}`) leaking via
  `getMasterPublicProfileView`'s `Promise.all([planInfo, availability])` (the same FIX-17 tuple; FIX-17
  cleaned `ownerMeta`, not `planInfo`). `getCurrentPlan` returns rich `CurrentPlanInfo` but only `.tier`
  is used → sequentialized + extracted the `tier` primitive; the rich object (with `planId`) no longer
  reaches flight.
- **Verified (`.qa/diagnostics/fix-19/`):** `/u/anna-sokolova` flight — `weeklyConfig.id` **1→0**,
  `templateId`/`weekday` schedule shape **→0**, `planId` **→0**. **FULL residual raw-CUID sweep:
  ONLY provider+service ids remain** (booking-flow exception) — **zero undocumented CUIDs**. Other public
  surfaces (`/u/<studio>`, `/catalog`, `/`) — 0 schedule/plan CUIDs. Availability hint ("Сегодня свободно")
  + PREMIUM/PRO ring still render, both themes.
- **🔴 ENGINE-SAFETY PROOF (mandatory, FIX-11 style) — PASSED:** public slots for the showcase master over
  a 14-day range, captured under **TZ=UTC** and **TZ=Europe/Moscow** (separate server processes), are
  **byte-identical** (SHA256 `8458b2352aed…`, 35 slots each). The engine is TZ-invariant (reads entity tz
  Asia/Almaty, not process tz) — proves the boundary fix did not disturb slot generation. Gates:
  typecheck/lint(1err/3warn)/encoding/mojibake/test(703)/build ✅.
- **🎉 FINAL rule-12 closure (true final state):** **rule-12 is FULLY CLOSED.** Every public response body
  + every public-page RSC flight is **clean** OR a **documented accepted exception**:
  (1) booking-flow provider/service/studio ids — kept-and-documented; encoding them = `RULE-12-BOOKING-CONTRACT-OPTIONAL`
  (deliberate non-action: a conversion-path contract change, not a leak); (2) taxonomy ids (GlobalCategory,
  review tags, BillingPlan catalog `planCode`); (3) base64url pagination cursors. **No undocumented/unnecessary
  internal CUID is emitted on any public surface.** The incremental per-leak discovery (FIX-13→19) is over.

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

**✅ QA-106 — Выполнено (FIX-25, 2026-06-18).** User-facing studio SLOT_CONFLICT copy reworded in UI_TEXT
(`bookingWidget.errors.slotTaken` → «Это время недоступно для записи. Выберите другое свободное окно.» —
accurate for off-schedule + taken). Both widgets special-case 409 so real users see UI_TEXT, not the raw
server string. Residual: the `booking-core.ts` off-schedule message «Окошко уже занято…» still shows to
direct-API callers (server-string change scoped out by "Booking untouched / UI_TEXT only"). Original ⤵

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

**✅ QA-102-L1 (per-card resilience) RESOLVED — FIX-12 (2026-06-16).**
- **Root cause path:** the shared focal/portfolio renderer `FocalImage`
  (39 consumers — catalog card, master profile hero, studio carousel/gallery/
  details, …) wrapped `next/image` with **no host-guard and no `onError`**.
  Three in-scope surfaces bypassed it entirely with raw `next/image`:
  `catalog/photo-carousel.tsx` (search-by-time result cards), `public-profile/
  master/portfolio-strip.tsx` (grid + lightbox), `public-studio/sections/
  photos-section.tsx`. An unconfigured-host URL → `next/image` throws at render
  (dev: whole route; SSR profile: error boundary risk); a 404 on an allowed host
  → broken-image icon, no fallback.
- **Fix:** `FocalImage` is now a resilient **client** component handling BOTH
  failure modes: (1) server-side sanitization — `isOptimizableImageSrc(src)`
  (new client-safe `src/components/ui/image-host.ts`, mirrors `next.config`
  `remotePatterns`) routes any unsafe host to a local placeholder **before** it
  reaches `next/image`, so the throw can never happen (SSR or client);
  (2) `onError` → placeholder for dead/404 URLs on an allowed host. Placeholder
  = `/portfolio-placeholders/placeholder.svg` (new neutral asset) rendered as a
  CSS background on a same-dimension box → no layout shift, no raw `<img>`,
  theme-neutral. The 3 bypass surfaces were migrated onto `FocalImage`. Rule 13
  honored — `FocalImage` + `image-host.ts` carry no server-only imports.
- **Verified (`.qa/diagnostics/fix-12/`, both themes):**
  - **Sub-case A — unconfigured host** (`evil.example.com`): `/u/anna-sokolova`
    SSR **200**, **6 placeholder divs** rendered server-side, `evil` host appears
    only in JSON-LD / OG meta / RSC data payload — **zero** in any rendered `src=`
    / `background-image`; server log clean of "Invalid src". `/catalog` **200**,
    Anna's card shows the placeholder while all **43** other cards render.
  - **Sub-case B — 404 on allowed host** (`storage.yandexcloud.net/…missing`):
    profile SSR **200** (host allowed → SSR emits `_next/image`), client `onError`
    swaps every failed image to the placeholder; page intact.
  - Playwright spec asserts **0** next/image "Invalid src" throws in console for
    both surfaces. Baseline restored from `post-seed.dump` after (0 injected URLs
    remain). 698/698 vitest + build green.
- **🚨 Out-of-scope bypass surfaces (flagged for BACKLOG):** other public image
  surfaces still render user-supplied URLs via raw `next/image` and should route
  through `FocalImage` so this class can't recur — `home/{feed-card,portfolio-
  card,stories-rail,stories-viewer-overlay,top-masters-section,recent-masters-
  section}`, `chat/{window-header,conversation-row}` avatars, `models/[code]`,
  `studio-booking-flow`, `crm/client-card-drawer`, `media/portfolio-editor`
  (admin), `notifications/studio-invite-cards`.

**✅ IMG-RESILIENCE-SWEEP CLOSED — FIX-21 (2026-06-17).** The flagged bypass
  surfaces above are now routed through the resilient `FocalImage` (15 files), so the
  unconfigured/dead-host class can no longer recur on any **remote-URL** image surface.
  Audit-first, NOT a blind swap: `FocalImage` gained 3 backward-compatible props
  (`onLoad`, `unoptimized`, `fit` cover|contain default cover for the placeholder);
  each surface keeps its EXACT treatment (crop/fit/aspect/rounding/size) — only the
  failure-path placeholder is added. **Two surfaces deliberately NOT migrated** because
  they are NOT the remote-host class and a swap would regress them: (a) the
  `studio-booking-flow` reference preview (+ `crop-picker`, chat `composer`, portfolio
  `upload-modal`, `visual-search-modal` query img) are `blob:`/`data:` **local previews** —
  `isOptimizableImageSrc` rejects them, so `FocalImage` would force the placeholder and the
  user's just-selected photo would vanish; (b) `chat/message-bubble` attachment is
  **intentionally raw** (cookie-auth token URL `next/image` would strip) and already has its
  own `onError`/`onLoad` fallback. New `image-host.test.ts` (7 tests) locks the host-guard
  contract — incl. that blob/data previews resolve `false` by design. **Verified** (deterministic
  green: typecheck/lint-baseline/encoding/mojibake/710-vitest/build-238-pages; live
  `.qa/diagnostics/fix-21/` both themes: catalog real-image render + 0 spurious placeholders,
  `onError`→placeholder swap with route alive, `/models/[code]` SERVER component renders).
  Cover/fixed migrations are pixel-equivalent **by construction** (same `<Image>`, only `onError`
  added).

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
- `master/hot-slots-settings-section.tsx:279` (`moneyRUBPlain(effectivePrice)`) → **✅ CLOSED by FIX-04 Phase 0**:
  `effectivePrice` confirmed kopecks (`priceOverride ?? basePrice ?? price`) → swapped to `moneyRUBPlainFromKopeks`.
  QA-109 now fully closed across master + public surfaces.
- `search-by-time/slot-bubbles-row.tsx:30` (`moneyRUB(discountValue)`) → **correct** (`discountValue` is in
  rubles — `calcDiscountedPrice` multiplies it by 100 to reach kopecks). Left as-is.

**Regression test:** `src/lib/format.test.ts` — formatter-output (`moneyRUBFromKopeks`/`moneyRUBPlainFromKopeks`
÷100) + a **source guard** asserting the 9 fixed surfaces no longer call the bare `moneyRUB(`/`moneyRUBPlain(`
and carry their ÷100 marker (catches a future re-introduction).

**`moneyRUB`/`moneyRUBPlain` deprecation:** NOT removable yet. `moneyRUB` retains 1 legitimate caller
(`slot-bubbles-row`, value in rubles). After FIX-04 Phase 0 closed hot-slots-settings-section,
`moneyRUBPlain` retains **1** caller — legacy `studio-services-page.tsx:617` (reachable only via the
redirect-shadowed legacy settings tab; bundle into the legacy-page retirement before deprecating).

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

**✅ RESOLVED — FIX-05 (2026-06-15). Day-handling choice: SINGLE-DAY** (reference-aligned —
`time-grid.tsx` JSDoc is "3-column time grid for a single chosen day"; the widget has a
separate `DateGrid` day selector). Fix in `time-grid.tsx`: request `to = dateKey` (the API
treats `to` inclusive, so `from===to` returns exactly that day — dropped the `to = dateKey + 1`
bleed) **plus** a defensive `.filter(slot => slot.dayKey === dateKey)`. The summary already
labels the day from `selectedDateKey` (not the slot), so with single-day slots the mislabel is
structurally gone (you can no longer pick a different day's slot). **Proven live:** the widget's
network request is now `from=2026-06-16&to=2026-06-16`, and the grid renders only that day's
slots (no next-day bleed). Screenshot `fix-05/galina-grid-single-day-15min.png`.

`QA-111 · slot grid granularity (schedule engine) · 🟡 Medium · repro: Galina
has slotPrecision=`exact`, slotStepMin=15, but the offered slot grid is 30-min
(10:00, 10:30, …). · expected: respect slotStepMin (15-min grid). · actual:
src/lib/schedule/slots.ts:69 hardcodes `const stepMin = 30` and never reads
`provider.slotStepMin`; `buildSlotsForDay` uses the literal 30 for rounding +
the slot loop. slotPrecision="exact" display IS honoured (exact times shown).
This confirms the BACKLOG "slotPrecision/slotStepMin not enforced" item for
slotStepMin specifically. Not a booking break (30-min slots are valid) but a
master who configured 15-min steps doesn't get them. · covered-by-test: no.`

**✅ RESOLVED — FIX-05 (2026-06-15).** `slots.ts buildSlotsForDay` now reads `slotStepMin`
(new optional input, fallback 30 only when a caller omits it) instead of the hardcoded 30.
Plumbed `normalizeSlotStepMin(provider.slotStepMin)` through all 3 production callers:
`usecases.ts` (×2 — the slots API + paginated grid) + `public-profile-view.service.ts`
(next-availability hint). **Proven live (Galina):** slotStepMin **15 → 34 slots, 15-min grid**
(10:00, 10:15, 10:30…); **30 → 17 slots, 30-min grid** (10:00, 10:30…) — honoured + reactive
(cache busts on the provider `updatedAt` bump). **Booking integrity re-verified at the 15-min
step:** booked 14:00–14:45 → slot consumed; overlapping 15-min slots (13:45/14:15/14:30) all
blocked; first non-overlap (14:45) offered; double-book backstop (`ensureNoConflicts`, unchanged)
holds; success-card time correct; `booking-happy-path.spec.ts` passes. Regression test added to
`slots.test.ts` (15-min/60-min/omitted-fallback). covered-by-test: **yes**.

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
  **✅ RESOLVED — FIX-07 (2026-06-15).** **Root cause refined by a behaviour-level
  re-audit:** the QA-10 "client `main` is `pb-0`" was a mis-measurement — `querySelector('main')`
  returned the *outer* app-shell `<main>` (`flex-1 w-full`, pb-0); the inner cabinet `<main>`
  already had `pb-24 lg:pb-0`. The genuine, consistent gap: **`CabinetBottomNav` was the only one
  of the 4 bottom-navs missing the `<div className="h-16 lg:hidden" aria-hidden />` clearance
  spacer** that `bottom-nav.tsx` / `master-bottom-nav.tsx` / `studio-bottom-nav.tsx` all render
  (completing the master pattern = main `pb-24` + nav `h-16` spacer). Fix: added that spacer to
  `CabinetBottomNav`. Verified live (390×844): spacer present; the upcoming-booking action row
  (incl. destructive "Отменить") sits at viewport y≈400, well clear of navTop 792; desktop 1440
  unaffected (spacer + pb both `lg:hidden`/`lg:pb-0` → 0px, no dead space). **Separate finding noted
  (NOT fixed — out of scope):** two mobile bottom-navs co-render on cabinet pages (`CabinetBottomNav`
  + the global `bottom-nav.tsx`) — see new BACKLOG item `QA-121`.
- **NEW 🟡 QA-120 — booking action controls below mobile tap-target guideline.**
  Чат / Перенести / В календарь / Маршрут / Отменить / Повторить / Связаться all
  render at **30px height** at 390-wide (below the 44px Apple-HIG / 48dp-Material
  guideline), several packed in one row incl. the destructive "Отменить" → mis-tap
  risk on a mobile-first surface. (Echoes the sprint's existing TAP-TARGET-AUDIT-A
  backlog item.) covered-by-test: no.
  **✅ RESOLVED — FIX-07 (2026-06-15)** for this instance. `ActionButton` + `ActionLink`
  (client bookings) now `min-h-[44px]` + `px-3 py-2` (was `px-2.5 py-1.5 text-xs` ≈30px) → verified
  **44px** live (light + dark); action row gap bumped `gap-1.5`→`gap-2` so the destructive "Отменить"
  is clearly separated when the row wraps on mobile. Text size kept `text-xs` (compact toolbar chips,
  not CTAs). **The broader app-wide `TAP-TARGET-AUDIT-A` remains open** — this fix is the QA-120
  booking-controls instance only. Evidence `.qa/diagnostics/fix-07/`.

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
  **✅ RESOLVED — FIX-08 (2026-06-15).** Added an ADMIN/SUPERADMIN branch to
  `resolveCabinetRedirect` (before the client fallback; master/studio branches
  unchanged) → admin lands on `/admin`. Verified: 5-role login smoke all PASS —
  site-admin `/admin`, master `/cabinet/master/dashboard`, studio `/cabinet/studio`,
  master-in-studio `/cabinet/master/dashboard`, client `/cabinet/profile` (no
  regression). Files: `src/lib/auth/cabinet-redirect.ts` (+ `.qa/roles.ts` expected-landing).
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
- **✅ QA-117 — DOCUMENTED dev-only, NOT a defect (FIX-25, 2026-06-18). No code change.** Dev compile-latency
  artifact; a 3.5s wait renders all reviews + the API returns 200. Compiled prod routes don't exhibit it.
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

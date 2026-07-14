# QA-FINDINGS-FULL-PASS.md — pre-deploy Playwright pass (findings-only)

> **Run:** 2026-07-14, branch `predeploy`, dev stack (Next dev :3000 + Postgres `masterryadom-db` + Redis `beautyhub-redis-1` + worker). Findings-only — **no fixes applied**. Fix prompts built from this after Artem reviews.
> **Method:** MCP Playwright (public/unauth surfaces + probes) + committed `.qa` harness (`loginAs`) for authenticated multi-role route/TZ sweeps. Evidence in `.qa/diagnostics/full-pass/` (gitignored): `full-pass.spec.ts` (4-role sweep), `console-detail.spec.ts`, screenshots, `/tmp/{sweep,client,detail}.log`.
> **Stack note:** the **worker was down at start** for a separate reason (WORKER-BOOT-SERVER-ONLY-01, fixed in the prior task) and the **dev server was not running** — I started `npm run dev` myself to unblock the pass (called out; not a product finding).

---

## Severity legend
🔴 blocker (data loss, wrong booking time, auth bypass, payment error, core-flow crash) · 🟠 high (core flow degraded / wrong info) · 🟡 medium (UX/edge) · 🔵 low (polish / testid).

---

## Findings

### [🟡] `/cabinet/settings` throws a `pageerror: Invalid or unexpected token`
- Route / surface: `/cabinet/settings` (client cabinet, notification/account settings)
- Persona: Елена (client, `+79995000000`)
- Steps: 1. login as client → 2. navigate `/cabinet/settings` → 3. observe browser console.
- Expected: no uncaught JS errors.
- Actual: one `pageerror: Invalid or unexpected token` (a JS SyntaxError surfaced to `window.onerror`). Page HTTP 200; no visible crash observed, but an uncaught SyntaxError can break interactivity of whatever script threw.
- Evidence: `/tmp/client.log` — `/cabinet/settings -> http=200 consoleErr=1 … pageerror: Invalid or unexpected token`. Reproduced in the isolated client run.
- Dedupe: **new**.
- Suspected area: **NOT** the Telegram login widget — `/cabinet/settings` imports `TelegramNotificationsSection` (gated on `isTelegramEnabled`, killswitch OFF → inert); the eval-using `telegram-widget.js` (`TelegramLoginButton`) is only on `/login`. Source line **not captured** (the `loginAs` post-login race, below, blocked live re-capture with `msg.location()`). Could be a dev-only webpack/HMR chunk parse artifact **or** a genuine malformed inline script. **Fix round must first capture the console source location** (`msg.location().url:line`) before deciding — do not assume dev-noise.

### [🟡] setState-in-render React warning fires on a client-cabinet route
- Route / surface: observed on `/cabinet/faq`, but source is a **shared cabinet component**, not the FAQ page.
- Persona: Елена (client)
- Steps: 1. login as client → 2. navigate `/cabinet/faq` → 3. console.
- Expected: no React warnings.
- Actual: `console.error: "Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component. Move this work to useEffect instead."` (React 19 setState-during-render warning).
- Evidence: `/tmp/client.log` — `/cabinet/faq … consoleErr=1 … Move this work to useEffect instead.`
- Dedupe: **new** (same *class* as LINT-BASELINE-SETSTATE-IN-EFFECT which QA-PREP-02 fixed for other files, but a different site).
- Suspected area: `ClientFaqPage` (`src/features/client-cabinet/faq/client-faq-page.tsx`) is **clean** (verified — `useState`/`useMemo`, setState only in handlers). The warning therefore comes from a component shared across cabinet routes (candidates: notifications bell / SSE stream hook / `useActiveRole` / push-manager / save-status provider). **Fix round: capture the component stack from the warning to pinpoint.** In prod React this warning is stripped but the underlying render-phase side-effect remains.

### [🔵] `booking-row` testid resolves to 0 on the client bookings list (despite bookings rendering)
- Route / surface: `/cabinet/bookings` (client "Мои записи")
- Persona: Елена (has seeded Vision bookings)
- Steps: 1. login as client → 2. `/cabinet/bookings` → 3. `getByTestId('booking-row').count()`.
- Expected: one `booking-row` per rendered booking (per `.qa/TESTIDS.md`).
- Actual: `rows=0`, **yet** the `bookings-list` container innerText contains real appointment times and the `Екатеринбург, GMT+5` label — so bookings **do** render; the `booking-row` testid just isn't on them (or is only on the "upcoming" group while Елена's Vision bookings sit in "history/finished").
- Evidence: `/tmp/client.log` — `### TZ/client bookings: rows=0 tzLabelsFound=[Екатеринбург, GMT+5] timesShown=[18:00, 14:00, 15:00, …]`.
- Dedupe: feeds **QA-TESTID-COVERAGE** (BACKLOG, incremental breadth). Not a functional bug.
- Suspected area: `booking-row` likely applied to the upcoming-list `<li>` only, not the finished/history group rows.

### [🔵/info] `/cabinet/master/{clients,reviews}` and several client `(user)` routes returned `http=0` (null nav response)
- Route / surface: `/cabinet/master/clients`, `/cabinet/master/reviews`; client `/cabinet/{favorites,messages,notifications,reviews,model-applications,roles}`.
- Persona: master (Anna) / client (Елена)
- Actual: `page.goto()` returned a **null** main response (recorded as `http=0`) — with **0 console errors and 0 failed requests**. The pages most likely rendered (no error signal); the null response is a measurement artifact of `page.goto` racing a client-side redirect / SSE-holding shell.
- Evidence: `/tmp/{sweep,client}.log`.
- Dedupe: **not a filed bug** — measurement limitation. Flagged so the fix round re-verifies these render with a content assertion (couldn't confirm content here).

### [info] `/cabinet/billing` redirects a pure client to `/cabinet/profile`
- Persona: Елена (client, no provider role)
- Actual: `/cabinet/billing -> http=200 (landed /cabinet/profile)`. Plausibly **correct** (subscription billing is a provider surface; a pure client has no subscription). Recorded for confirmation, not filed as a bug.

---

## Timezone checks (the priority class) — all PASS on exercised surfaces ✅

Anchor persona = Vision @ **Екатеринбург, GMT+5** (deliberate non-Moscow).

| Surface | Result | Evidence |
|---|---|---|
| Studio calendar (Виктория) | ✅ `Екатеринбург, GMT+5` label, times `09:00–20:00` salon-local | `/tmp/sweep.log` `### TZ/studio calendar` |
| Client "Мои записи" (Елена, Vision bookings) | ✅ `Екатеринбург, GMT+5` label with times `18:00/14:00/15:00…` | `/tmp/client.log` `### TZ/client bookings` |
| Vision master public profile (Марина) | ✅ correct Yekaterinburg address «ул. Вайнера, 16»; **no Moscow tz leak** in body (the "Москва" seen is only the viewer's navbar city chip); earliest-slot chip `14:30` | MCP evaluate |

**Not fully exercised:** the public booking-funnel **slot-picker** explicit tz label — the collapsed widget showed only the earliest-slot chip (`14:30`) and I could not reliably auto-open the full picker (studio-master `/booking` sub-route redirects to the inline profile widget; the service-row click heuristic didn't match). Signals are positive (address correct, no Moscow leak) but the explicit `GMT+5` label on the open picker was **not** visually confirmed — worth a targeted check in a follow-up.

---

## Auth (§6)

- **Phone OTP login** — ✅ works for all 5 seeded roles (each landed on its expected cabinet; `loginConsoleErrors=0`). Elena/master/studio-admin/site-admin all verified.
- **VK button** present on `/login`; **Yandex / Telegram buttons absent** — ✅ matches env (`NEXT_PUBLIC_VK_ENABLED=true`, Yandex unset, Telegram `false`).
- **Kill-switch (server-side):** `/api/auth/yandex/start` → **503** ✅ (disabled). `/api/auth/vk/start` → **503** — because **server VK creds (`VK_CLIENT_ID`) are unset in dev** while the public flag is on (client shows the button, route refuses). This is the kill-switch behaving correctly for a not-configured provider; the live VK round-trip is already a DEPLOY/OPS item. **Not filed** (dev-config; verify live with real creds at deploy).
- Email OTP / role-switching (dual-role) — **not exercised** (budget).

---

## §7 — the `/support` dynamic-server-usage class: **result = it is NOT a class (single route)**

- The error (`Dynamic server usage: Route /support couldn't be rendered statically because it used cookies`) fires because the page reads `cookies()` (via `getSessionUser()`) **inside a try/catch that logs** (`support/page.tsx:24-42`), swallowing Next's dynamic-render bailout and turning it into a `logError` → ops alert.
- **Static sweep of all 87 page routes:** only **`src/app/support/page.tsx`** matches the alert pattern (a `getSessionUser()`/`getServerCity()` call wrapped in a `try{…}` + `logError`). The other ~37 pages that call `getSessionUser()` do so **bare** — Next's `DynamicServerError` propagates normally (correct dynamic bailout, no alert). `getServerCity()`'s only page caller is `/models`, also bare.
- Zero `page.tsx`/`layout.tsx` read `cookies()`/`headers()` directly — all cookie reads go through `getSessionUser`/`getServerCity`/`csp/nonce`/model-offers helpers; only API route handlers read them directly (always dynamic — not the class).
- **Verdict:** `/support` (BACKLOG `SUPPORT-PAGE-DYNAMIC-SERVER-USAGE`) is the **lone** instance. No sibling routes need fixing. (`next build` completed clean with `/support` marked `ƒ` Dynamic.)

---

## Coverage summary

**Exercised:**
- Discovery: home (renders clean, 0 console errors; stories-rail intentionally `null` on empty seed — not a bug), catalog (20 cards / "43 специалиста" on clean load; API `/api/catalog/search` = 200/20 items), login page.
- Auth: phone-OTP login (all 5 roles), VK/Yandex/Telegram button presence, server-side kill-switch (503s).
- **Authenticated route render/console sweep across all 4 cabinet roles** (~40 routes): **every route HTTP 200, 0 console errors** except the two client findings above. No 500s, no hydration crashes on cabinet/admin.
- Timezone: studio calendar, client bookings, provider profile (all correct GMT+5 / no Moscow leak).
- §7 `/support` class analysis (static, decisive).

**Skipped / NOT exercised (why):**
- **Booking lifecycle driving** (create → reschedule → cancel), **reviews** (leave + rating update), **master schedule slot-computation** (break blocks slot / day-off empties), **studio team-cap enforcement** (FREE=2/PRO=6/PREMIUM=20), **category request→approve→catalog-filter round-trip**, **plan-gating** (FREE/PRO/PREMIUM + grace-period access), **chat**. Reason: these need reliable interactive login-driving; MCP login is timing-sensitive (OTP TTL) and the `loginAs` harness has a **post-login race under slow dev load** (below) that made deep multi-step driving unreliable within this session's budget. The render/TZ sweeps confirm the surfaces load and show correct data, but the *mutating* flows were not driven end-to-end. **Recommend a focused follow-up pass for these** (ideally as `.qa` specs with a hardened login).
- **Both themes:** only light captured systematically (dark not swept).
- **Visual search:** `VISUAL_SEARCH_ENABLED=true` in dev, but functionality (portfolio index + search) not exercised — and note the vector(256) migration/backfill is an un-applied DEPLOY/OPS step, so results may be empty regardless.
- **Public marketing pages** beyond home/catalog/login/pricing.

## Missing test-ids encountered (feeds QA-TESTID-COVERAGE)
- `booking-row` not resolving on the client bookings list (rows render; testid absent or only on upcoming group).
- Studio calendar day-grid rows (no row testid — TZ probe read text via `page-main`).
- Booking-widget **service rows** on the public profile (no stable hook — my service-click heuristic failed).
- Catalog time-search `ProviderResultCard` (known-open in TESTIDS.md).

## QA-harness notes (not product bugs, but they cost time — worth fixing for future passes)
- `clearOtpRateLimit` / `recoverOtp` default the Redis container to **`beautyhub-redis`**, but the running container is **`beautyhub-redis-1`** → every `docker exec` for rate-limit clearing failed (`Container … is not running`). Set `QA_REDIS_CONTAINER=beautyhub-redis-1` or update the default in `.qa/otp.ts`.
- `loginAs` (`.qa/login.ts:102-105`) has a **post-login race under slow dev**: when the OTP auto-submit navigation takes >15 s the first `waitForURL` times out and the fallback clicks a "Вход" button that no longer exists (login already succeeded → 20 s timeout → false test failure). Seen once in the 4-role sweep (client) and once in `console-detail.spec.ts` (login *did* land `/cabinet/profile`, helper still failed). Consider treating "already left `/login`" as success before the fallback click.

## Non-findings explicitly ruled out (so they don't get re-filed)
- **Catalog "0 специалистов рядом"** — a **concurrent-load artifact**: while the 4-role sweep saturated the single-threaded dev server, the catalog client fetch/hydration raced and rendered the empty state. On a clean reload it shows 20 cards / "43 специалиста". **Not a bug.**
- **Home stories-rail absent** — intentional `return null` on empty/error (`stories-rail.tsx:151`, "do not show empty state"); seed has no published stories. **Not a bug.**
- **Navbar rendered mid-page in the full-page home screenshot** — known Playwright full-page-screenshot artifact of a sticky header. **Not a bug.**
- Footer ИНН placeholder / VK icon absent — expected until prod env (per dedupe list).

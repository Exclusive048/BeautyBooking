# QA-FINDINGS-PASS-02.md — harness hardened + mutating flows driven

> **Run:** 2026-07-14, branch `predeploy`. Companion to `QA-FINDINGS-FULL-PASS.md` (PASS-01). PASS-01 drove **no** mutating flows because the login harness was flaky; PASS-02 **fixed the harness (Phase A)** then **drove the mutating flows (Phase B)**. Findings-only — no product fixes. The only committed-worthy code is the Phase-A harness (`.qa/login.ts`, `.qa/otp.ts`) for Artem's review; the Phase-B specs live in gitignored `.qa/diagnostics/full-pass/`.
> **Stack:** dev server + Postgres + Redis + **worker** (booted clean with the WORKER-BOOT-SERVER-ONLY-01 fix; processed the availableToday sweep). I restarted the dev server + worker at the start (they weren't up).

---

## Phase A — harness hardening (the thing that broke PASS-01)

| Fix | File | What |
|---|---|---|
| Redis container drift | `.qa/otp.ts` | `clearOtpRateLimit`/`recoverOtp` now **discover** the container by name-pattern (`docker ps` filter) with a corrected fallback (`beautyhub-redis-1`, was `beautyhub-redis`). The running container is `beautyhub-redis-1` → every rate-limit clear silently failed in PASS-01. |
| Post-login race | `.qa/login.ts` | `loginAs` no longer clicks a fallback «Вход» button after login already succeeded — it checks "already left `/login`" first, and waits are 30 s for cold compiles. |
| Consent hydration race | `.qa/login.ts` | The type→consent-appears→check→assert-checked sequence is now one retry unit (40 s) so the QA-003 hydration wipe just retries instead of failing. |
| **`loginResilient`** | `.qa/login.ts` | New wrapper: retries the whole login on a fresh context (3 attempts). The `/login` hydration flake is a **dev-mode page artifact** (~20% single-attempt), recoverable and never a false success; retry makes flow-driving reliable. |

**Verification (the gate):** all 5 seeded personas logged in **twice** — **0 failures / 10 logins** (1 needed a 2nd attempt, absorbed by `loginResilient`). Login is stable for flow-driving. *(Raw single-attempt `loginAs` still flakes ~20% under cold compile — that is the underlying `/login` hydration mismatch, a product-side dev artifact, not fixed here.)*

---

## Phase B — findings

### [🟠] «Стать партнёром» CTA is invisible — burgundy text on a burgundy gradient (BOTH themes) — CONFIRMED
- Route / surface: home `/` (and any surface using the partner banner «Вы мастер красоты?»)
- Persona: any (public)
- Steps: 1. open `/` → 2. scroll to the «Вы мастер красоты?» partner banner → 3. inspect the «Стать партнёром» button.
- Expected: readable CTA (≥ 4.5:1 contrast).
- Actual: text color `rgb(114,8,8)` sits on the button's own brand gradient whose **start color is also `rgb(114,8,8)`** → **contrast 1.0:1 in light, 1.11:1 in dark** (computed). Effectively invisible. The adjacent «Узнать больше» is white-on-gradient at **21:1** (fine).
- Evidence: MCP computed-style measurement (light: text `rgb(114,8,8)` == gradient-start `rgb(114,8,8)`; dark: text `rgb(114,8,8)` vs gradient-start `rgb(122,16,44)` → 1.11:1).
- Dedupe: **the finding Artem flagged** — confirmed, with numbers, in both themes.
- Suspected area: the CTA is intended as a `bg-white text-primary` inverted button (one of the FIX-DARK-ACCENT-TEXT-SPLIT "fixed-light-fill exceptions", `become-master-banner`), but it renders with the **gradient** background instead of white, so `text-primary` (burgundy) lands on burgundy. Fix = white text (like «Узнать больше») or a genuine white fill.

### [downgrade → dev-transient] PASS-01 `/cabinet/settings` SyntaxError + `/cabinet/faq` setState-in-render
- On a clean isolated PASS-02 run (logged-in client, `msg.location()` + full stack capture armed), **both routes produced 0 console errors** — neither reproduced.
- Verdict: the PASS-01 single-occurrence errors were **dev-transient** (HMR/chunk under multi-route sweep load), **not reproducible defects**. The diagnostics the prompt asked for (source location / component stack) could not be captured **because there was nothing to capture**. Fix round should not chase these unless they resurface under a clean load.

### Booking integrity + timezone — driven end-to-end, all correct ✅ (positive)
The historically-dangerous classes. Елена → Vision master Марина (Екатеринбург **GMT+5**), via the real slots + bookings API as the logged-in client:

| Check | Result |
|---|---|
| **B1 instant fidelity** | picked slot `2026-07-17T05:00:00Z` == stored `startAtUtc` **SAME ✓** |
| **B1 client tz display** | `/cabinet/bookings` shows the new booking at **10:00** with **`Екатеринбург, GMT+5`** label (05:00Z +5h = 10:00 EKB) ✓ |
| **slots API tz** | `/slots` returns `timezone: "Asia/Yekaterinburg"` and labels each slot in salon-tz (`05:00Z → "10:00"`) ✓ |
| **B3 book removes slot** | after booking, the slot disappears from availability (count 68 → 65) ✓ |
| **B3 cancel returns slot** | after cancel (→ REJECTED), the freed slot returns (count 65 → 68) ✓ |

No wrong-hour rendering, no instant drift. (Test booking created + cancelled; DB clean.)

### [🟡/info] cancel + can-leave routes are slow on first dev-compile (~17–20 s)
`POST /api/bookings/[id]/cancel` and `GET /api/reviews/can-leave` each exceeded a 20 s client timeout on their **first** hit, then completed in ~17 s on retry. This is dev on-demand compilation, **not a product hang** (prod is pre-built) — noted only because it cost harness time; not filed as a product bug.

### B2 reviews — eligibility guard correct; happy-path blocked by stale seed
- `can-leave` = **false** and `POST /api/reviews` = **403 REVIEW_NOT_ALLOWED** for Елена's FINISHED Vision booking.
- **Not a bug:** `REVIEW_WINDOW_DAYS = 3` — reviews are only allowed within 3 days of finish; the seed booking (`seed-vision-elena-review`) is **2026-06-29, 15 days old** → correctly outside the window. The self-review guard (invariant #33) + 3-day window are properly enforced server-side.
- **Could not exercise** the happy path (leave → appears → rating recomputes) — **no seed booking finished within the last 3 days** (seed-freshness gap).

### B4 team cap — ACTIVE-only counting verified; block-at-cap not driven
- Vision: **8 `StudioMember` ACTIVE rows but only 7 count as seats** (ACTIVE predicate = `ownerUserId != null && isPublished`) → the BC-CAP "ACTIVE-only" rule is observable in the data (a member whose Provider isn't published/owned does **not** consume a seat). Cap = 20 (owner is STUDIO_PREMIUM).
- **Not driven:** actually exceeding the cap (would require inviting/activating 13+ more masters to reach 20). The counting rule is verified; the enforcement block at N+1 was not exercised.

### B5 category round-trip (master proposes → admin approves → global) — FULL PASS ✅ (positive)
Drove the whole loop across two roles via API:
- **Propose** (master Anna): `POST /api/categories/propose {name}` → **201**, category created `PENDING`.
- **Approve** (admin): `POST /api/admin/catalog/categories/[id]/approve` → **200**, status → `APPROVED`.
- **Global visibility:** the category then appears in the public `GET /api/catalog/global-categories?status=APPROVED` list (**true**) — i.e. visible to other providers and catalog filter.
- **Invariant #23 lockstep verified in DB:** the approved row is `status=APPROVED` **AND** `visibleToAll=true` (approve keeps `visibleToAll` in sync — the write-path lockstep holds).
- Cleaned up (test category deleted).

---

## Coverage table

| Flow | Status | Notes |
|---|---|---|
| B1 create + tz (client → Vision master) | ✅ exercised | instant fidelity + salon-tz display correct |
| B1 confirm | ⚠️ partial | create → PENDING verified; provider-side confirm not driven (would need studio-side UI/API step) |
| B1 reschedule accept/decline (calendar cell + journal row) | ⛔ skipped | seed reschedule bookings are 2–3 wks past; proposing a future time on a past booking is an edge the seed can't cleanly support — needs fresh-dated seed |
| B1 move (MoveBookingDialog, master-picker serviceId gating) | ⛔ skipped | UI-heavy; budget |
| B1 cancel + slot returns | ✅ exercised | REJECTED + slot returns (65→68) |
| B2 reviews | ⚠️ partial | eligibility guard (3-day window + self-review) verified; happy-path blocked by stale seed |
| B3 slot computation (book/cancel) | ✅ exercised | book removes, cancel returns |
| B3 break blocks / day-off empties / duration drives length | ⛔ skipped | would mutate a master's schedule via editor; budget |
| B4 team cap | ⚠️ partial | ACTIVE-only counting verified; block-at-cap not driven |
| B5 category round-trip | see above | driven via API |
| B6 plan-gating + grace access | ⛔ skipped | no FREE-tier provider and no PAST_DUE+grace subscription in seed to compare against; would need DB state setup |
| B7 partner CTA contrast | ✅ exercised | 🟠 confirmed both themes |
| B7 full dark-theme sweep | ⚠️ partial | partner CTA measured in both themes; broad dark sweep of all surfaces not done |
| B7 chat | ⛔ skipped | budget |
| B7 visual search | ⛔ skipped | flag on, but the vector(256) migration/backfill is an un-applied DEPLOY/OPS step → index empty; nothing to exercise |

---

## Seed-freshness gap (recurring blocker — worth fixing before the next pass)
The showcase seed's booking dates are anchored to ~2026-06-23 (when it was built). Today is 2026-07-14, so **every seed booking is 2–3 weeks in the past**. This blocks any flow gated on "recent" or "future": the **review 3-day window** (B2), **reschedule-to-a-future-time** on the E2E bookings (`seed-vision-elena-accept/decline`), and the "freed slot reappears today" availability checks. Recommend the seed compute booking dates **relative to now** (e.g. `now + N days`) so these flows stay drivable over time.

## Missing test-ids encountered (feeds QA-TESTID-COVERAGE)
- Studio calendar day-grid rows (used `page-main` text). Booking-widget service rows (no stable hook). Team-page master rows / seat counter. Admin category table rows. (Plus the PASS-01 `booking-row`-on-client-bookings gap.)

## Test artifacts created (dev DB)
- 1 booking created + cancelled (REJECTED) — net clean.
- B5: 1 category proposed + approved (see below) — **cleaned up after verification**.
- No reviews created (all correctly 403'd).

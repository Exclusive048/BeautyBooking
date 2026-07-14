# QA-FINDINGS-PASS-03.md — the previously-blocked flows (final pre-deploy pass)

> **Run:** 2026-07-14, branch `predeploy`. Closes the flows PASS-02 skipped (plan-gating, grace/expired, reschedule accept/decline, review happy-path) — now unblocked by SEED-FRESHNESS-01. Findings-only; the only non-product change is Phase-A `.qa/roles.ts` wiring.
> **Stack:** dev + Postgres + Redis + **worker** all up (worker processing `availableToday.recompute`, `changed:8` observed). DB fresh (billing fixtures present, relative dates).

---

## Phase A — personas wired ✅
Added the 4 SEED-FRESHNESS-01 billing fixtures to `.qa/roles.ts` (`billing-free` / `billing-premium` / `billing-grace` / `billing-expired`). **All 4 log in cleanly** (landed `/cabinet/master/dashboard`, 0 console errors, 0 problems).

---

## Findings

### [🟠] Every `bg-white text-primary` inverted CTA is INVISIBLE in dark theme (1.1:1) — incl. the one "fixed" in FIX-ROUND-01
- Surface: marketing CTAs — partner banner «Стать партнёром» (`become-master-banner.tsx`), pricing «Оформить подписку» (`plan-card.tsx`), «Стать мастером» (`cta-block.tsx` / `FooterCTA.tsx`).
- Persona: any, **dark theme** (`next-themes` = dark).
- Steps: 1. set dark theme → 2. reload `/` (and `/pricing`) → 3. inspect the white-pill CTAs.
- Expected: readable CTA (≥ 4.5:1) in both themes.
- Actual: **1.1:1** — text `rgb(253,242,240)` (near-white) on `rgb(255,255,255)` (white). The «Узнать больше» outline button beside it (white-on-gradient) is 21:1 and fine.
- Evidence: computed styles (all four at 1.1) + screenshot `.qa/diagnostics/full-pass/footer-cta-dark.png` (ghost text on a white pill).
- Dedupe: **partially new / re-opens a "fixed" item.** FIX-ROUND-01 fixed the *light* theme (16.97:1) but **left dark broken** — its dark check used a synthetic `document.documentElement.classList.add('dark')` toggle **without a reload**, which didn't recascade the theme tokens, giving a false pass. Proper next-themes dark (localStorage + reload) shows all four at 1.1:1.
- **Root cause:** these CTAs are `<Button variant="secondary" className="bg-white text-primary">`. The secondary variant's base `text-text-main` **overrides** the className `text-primary` (plain-join `cn`, not tailwind-merge). `text-text-main` is dark in light theme (safe) but **near-white in dark theme**; `bg-white` is a fixed white in both. So in dark: near-white text on white fill → invisible. (This is the same `cn`-can't-override root the FIX-ROUND-01 report flagged — but it bites the *text* color across the theme flip, which the light-only verification missed.)
- Severity: 🟠 — the primary conversion CTAs of the partner/pricing funnels are unreadable for every dark-theme visitor. Not data-loss, but a real funnel regression; the design system mandates both themes (ui-ux-pro-max §3). **A fix must verify computed contrast in *reloaded* dark, not a synthetic class toggle, for all four CTAs.**

### Booking-integrity / money flows — all driven, all correct ✅ (positive)

| Flow | Result |
|---|---|
| **B1 reschedule accept** | client proposes → CHANGE_REQUESTED + `actionRequiredBy=MASTER`; studio `/confirm` → booking **moved to the proposed instant** `2026-07-19 09:00Z = 14:00 EKB` (**no tz drift**), proposal cleared ✅ |
| **B1 reschedule decline** | client proposes → CHANGE_REQUESTED; studio `/decline-reschedule` → **reverted** to original `2026-07-18 10:00Z = 15:00 EKB`, proposal cleared ✅ |
| **B5 plan-gating** | FREE→FREE features, PRO(Anna)→+revenue/hotSlots, PREMIUM→+cohorts/forecast — features escalate correctly per tier ✅ |
| **B5 grace access** (HARDENING-03) | `billing-grace` (PAST_DUE + graceUntil>now) resolves **effective PRO** with PRO features → **grace KEEPS access** ✅ |
| **B5 expired** | `billing-expired` (EXPIRED) resolves **effective FREE** (no PRO features) → **access LOST** ✅ |
| **B6 review happy-path** | Елена → recent Vision booking: `can-leave: true` → review **201** (targetType studio) → double **409 REVIEW_ALREADY_EXISTS** → self-review by owner **can-leave: false** (inv #33) ✅ |

### [info / R2-05-F] Studio rating dropped 4.8/15 → 5.0/1 after one review — seed-drift, NOT a bug
The 15 pre-existing Vision reviews target individual **masters** (`targetType=provider`); only 1 targets the **studio** (the one just left). The studio's stored `ratingCount=15` was a **seeded hardcoded value** (R2-05-F class); the first real review triggered a recompute that corrected it to the actual studio-direct count (1, avg 5.0). **The recompute mechanism works** (it computed the accurate value). *Open product question (pre-existing, not a bug): a studio's headline rating aggregates studio-direct reviews only, not its team's — worth a product decision, tracked with R2-05-F.*

---

## Coverage table

| Flow | Status | Notes |
|---|---|---|
| **B1** reschedule accept/decline | ✅ exercised | driven via `/reschedule` + `/confirm` + `/decline-reschedule` (the endpoints backing BOTH calendar-cell + journal-row per inv #32); moved/reverted instants + salon-tz verified in DB. **Not** click-driven per-surface; `?focus=` deep-link not driven (UI). |
| **B2** move + serviceId gating | ⚠️ partial | data verified: each Vision service is performed by a **subset** (1/7 masters) → the picker's serviceId filter (SERVICEID-01, unit-tested) is meaningful. The MoveBookingDialog UI + datetime-local salon-local were **not** click-driven. |
| **B3** slot computation | ⚠️ partial | core (book removes slot / cancel returns) driven in PASS-02 ✅; break-blocks-window / day-off-empties / hours-change / availableToday-flip **not** driven this pass (schedule-mutation heavy). The worker's `availableToday.recompute` path is confirmed live (`changed:8` in the worker log). |
| **B4** team cap block at N+1 | ⚠️ partial | counting (ACTIVE-only, 8→7 seats) verified PASS-02 ✅; the block-at-N+1 is **unit-tested** (`team-limits.test.ts` 14) + enforced at `/api/studio/masters`, `/studios/[id]/invites`, `/studios/[id]/masters`. **Not** driven end-to-end (needs a studio parked at its cap; Vision @ PREMIUM cap 20 with 7 ACTIVE, and temporarily downgrading Vision risked polluting other checks). |
| **B5** plan-gating + grace/expired | ✅ exercised | all tiers + grace + expired verified via `/api/me/plan` features. |
| **B6** review happy-path + guards | ✅ exercised | leave / no-double / self-review-guard all correct; rating recompute functions (R2-05-F seed-drift noted). |
| **B7** dark-theme sweep | ⚠️ partial → **🟠 finding** | home + pricing dark scanned → the inverted-CTA finding above. Cabinets-in-dark not swept (login-heavy). |
| **B8** visual search | ⛔ skipped | `VISUAL_SEARCH_ENABLED=true` but the `vector(256)` migration + backfill are un-applied DEPLOY/OPS steps → index empty. Not a bug; nothing to exercise. |

---

## Missing test-ids
Studio calendar day-grid cells / journal rows (B1/B2 driven via API, not UI, partly because these lack row testids), MoveBookingDialog master-picker options, team-page seat counter, plan-card CTA. (Feeds QA-TESTID-COVERAGE.)

---

## Verdict — is anything left that should block deploy?

- **No 🔴 hard blockers.** Booking integrity, timezone (salon-tz across reschedule/booking/review), two-sided reschedule, plan-gating, grace/expired access, and the review guards are all **verified correct**.
- **One 🟠 to fix before (or immediately after) deploy:** the **dark-theme inverted CTAs** (partner / pricing / become-master) are invisible — a conversion-funnel regression in a supported theme. It's a small, local fix (make the text stay dark on the white fill in both themes) but it re-opens a FIX-ROUND-01 item, so the fix must be verified in **reloaded** dark for all four CTAs.
- **Partials (B2/B3/B4) are lower-risk:** their cores are verified (PASS-02) or unit-tested; the un-driven parts are UI-surface confirmations, not unknown behavior. Worth a short follow-up but not deploy-blocking.
- Deploy remains gated by **deploy-ops** (visual-search enable chain, prod env/creds, migrations) per the backlog — not by product correctness.

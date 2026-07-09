# `data-testid` convention — МастерРядом QA hooks

> Seeded by **QA-PREP-01** (2026-07-09) ahead of the end-to-end Playwright pass.
> Before this, `src/` had **zero** `data-testid` — the documented root cause of
> «empty selector» / dual-`<main>` strict-mode failures in prior live-QA runs
> (see `.claude/skills/playwright-qa` §2 & §4).
>
> This is **not** "testids everywhere". It seeds a convention + the highest-value
> pain points (the two structural blockers + the list surfaces the pass asserts
> on). Breadth grows incrementally — see `QA-TESTID-COVERAGE` in `BACKLOG.md`.

## Convention

- **kebab-case**, shape `{surface}-{element}` — e.g. `booking-row`, `booking-submit`, `catalog-card`.
- Put `data-testid` **only** on: (a) list containers + their rows, (b) interactive
  action targets the pass drives. **Never** on decorative markup.
- **Additive only.** `data-testid` changes zero styling / behaviour / a11y. Shared
  `<Button>` (`src/components/ui/button.tsx`) spreads `...props` to the DOM and its
  type extends `ButtonHTMLAttributes`, so `data-testid` on a `<Button>` is forwarded
  and type-safe.
- Prefer these testids over ambiguous role/text locators. `getByTestId('…')` is
  stable across copy changes; localized-text / bare-`main` locators are not.

## Seeded ids (registry)

### Structural — dual-`<main>` (kills strict-mode `resolved to 2 elements`)

| testid | Where | Notes |
|---|---|---|
| `app-main` | `src/components/layout/app-shell.tsx` | The single **outer** app-shell `<main>`, present on every route. `getByTestId('app-main')` → exactly one, always. |
| `page-main` | `cabinet-layout.tsx`, `admin-shell.tsx`, `master-cabinet-shell.tsx`, `app/(cabinet)/cabinet/studio/layout.tsx` | The **inner** page-content `<main>` of each workspace shell. One per route → `getByTestId('page-main')` resolves to exactly one on cabinet/admin pages. |

> ⚠️ `/cabinet/master/profile` has a **third**, nested `<main>` (`master-profile-page.tsx`
> — a grid column). It was deliberately **not** given a testid, so `page-main` there
> still resolves to one. The nested `<main>`-inside-`<main>` is a genuine a11y bug
> (invalid landmark nesting) tracked separately in `BACKLOG.md` — not fixed here.

### List surfaces (containers + rows)

| testid | Where |
|---|---|
| `bookings-list` | client bookings container — `features/client-cabinet/bookings/client-bookings-page.tsx` |
| `booking-row` | each booking row/card — client `client-bookings-page.tsx` (`<li>`), master kanban `bookings/booking-card.tsx`, master dashboard `dashboard/booking-row.tsx` |
| `bookings-column-{id}` | each master-kanban column — `bookings/kanban-column.tsx` (id ∈ `pending`/`confirmed`/`today`/`done`/`cancelled`) |
| `reviews-list` | master reviews container — `master/components/reviews/reviews-feed.tsx` |
| `review-row` | each review card — `master/components/reviews/review-card.tsx` |
| `catalog-list` | catalog results grid — `features/catalog/pages/catalog-page-client.tsx` (default list view) |
| `catalog-card` | each provider card — `features/catalog/components/catalog-card.tsx` |

### Key CTAs

| testid | Where | Action |
|---|---|---|
| `login-send-code` | `app/login/login-client.tsx` | request OTP (phone/email step) |
| `login-verify` | `app/login/login-client.tsx` | submit OTP → log in |
| `booking-submit` | `booking/components/booking-flow/phases/form-phase.tsx` | public booking widget — final «Записаться» |
| `booking-confirm` | `master/components/bookings/booking-card-actions.tsx` | master accepts a pending / change-requested booking (the reschedule-accept side) |
| `booking-decline` | `master/components/bookings/booking-card-actions.tsx` | master declines a pending / change-requested booking |
| `reschedule-submit` | `client-cabinet/bookings/client-reschedule-modal.tsx` | client proposes a new time |

> Login still exposes the 6 OTP boxes via `getByLabel("Цифра N из 6")`; `.qa/login.ts`
> `loginAs` remains the canonical login path and does not depend on these testids —
> they are additional stable hooks for asserting the login surface directly.

## Not covered yet (incremental breadth — `QA-TESTID-COVERAGE`)

Studio calendar/day-grid rows, chat surfaces, schedule-settings, admin tables,
marketing-page `<main>`s, and the catalog time-search card (`ProviderResultCard`)
still lack testids. Add them **when a pass actually needs them**, following this
convention — don't brute-force the whole app in one sweep.

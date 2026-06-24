# COMMIT-GROUPING-PLAN — testloop working tree (2026-06-24)

> **Planning artifact only. DO NOT auto-commit — Artem reviews + commits group-by-group himself.**
> Map of the uncommitted working tree → thematic, individually-reviewable commits, ordered
> foundational/shared → leaf. No schema changes in the tree → **no `prisma validate` in any group.**

## Phase A — what's in the tree (vs already committed)

**Already committed (NOT in tree)** — earlier R1/R2 work landed in `b10280b` / `e3da02e` / `0711899` /
`4adf67d` / `0094196`: FIX-01…25, FIX-26/27/28 (plan-gating), R2-01/02/04/05, BILLING-CYCLE (BC), tz
(FIX-R2-02-A/04-BA), R2-06-quick (C/D/E/G), and the **initial** DOCS-CLEANUP docs (commit `0094196 "Update docs"`).

**Uncommitted (this map)** — 5 code fixes + re-modified trackers + 2 exclusions:
| Fix | Files |
|---|---|
| **PII-LOGGING-FIX-A** | `src/lib/email/sender.ts`, `src/lib/sms/index.ts`, `src/app/api/cabinet/user/profile/email/verify/route.ts` |
| **R2-06-B** (`?focus=` reader) | **NEW** `src/hooks/use-focus-highlight.ts`, `src/components/cabinet/focus-highlighter.tsx`; `src/app/globals.css`; emitters `src/lib/notifications/booking-notifications.ts`, `src/lib/notifications/center.ts`, `src/lib/chat/conversation-aggregator.ts`, `src/app/api/bookings/[id]/chat/messages/route.ts`, **`presentation.ts` (booking-href hunk only)**; anchors/mounts `src/features/master/components/bookings/{booking-card,master-bookings-page}.tsx`, `.../dashboard/{booking-row,task-row,attention-section}.tsx`, `.../master-dashboard-page.tsx`, `.../reviews/{review-card,master-reviews-page}.tsx`, `src/features/client-cabinet/bookings/client-bookings-page.tsx` |
| **R2-06-H** (review-gate parity) | `src/lib/reviews/can-leave.ts`, `src/lib/client-cabinet/{bookings.service,reviews.service,sidebar-counts}.ts` |
| **R2-06-A** (studio reschedule parity) | **NEW** `src/lib/bookings/decline-reschedule.ts`, `src/app/api/bookings/[id]/decline-reschedule/route.ts`; `src/lib/studio/bookings.service.ts`; `src/features/studio-cabinet/notifications/components/notification-actions.tsx`; `src/lib/ui/text.ts` |
| **R2-06-FI** (billing CTA + self-review) | `src/lib/billing/notifications.ts`, **`presentation.ts` (import + BILLING hunk)**, `src/lib/notifications/admin-initiated.ts`, `src/lib/reviews/service.ts` |
| **DOCS / trackers** | `MASTERRYADOM_AI_CONTEXT.md`, `BACKLOG.md`, `BACKLOG-DONE.md`, `QA-FINDINGS.md` (re-modified with R2-06 entries since `0094196`) |

**Cross-cutting / special handling:**
- ⚠ **`src/lib/notifications/presentation.ts` spans TWO fixes** (separable `@@` hunks):
  - hunk `@@ -1` (`import billingUpgradeHref`) + hunk `@@ -98..` (`BILLING_HREF_TYPES` + BILLING branch) → **R2-06-FI**
  - hunk `@@ -106..` (booking `?bookingId=`→`?focus=`) → **R2-06-B**
  - → fine-grained: `git add -p src/lib/notifications/presentation.ts` and stage hunks per group. Coarse: fold the whole file into one notifications commit (no split needed).
- **4 tracker `.md`** carry entries from every fix → put in the final **docs/trackers** commit.
- 🚫 **`.claude/settings.local.json`** — permission-allowlist noise auto-added during Bash calls, **not a fix** → `git checkout -- .claude/settings.local.json` (discard), exclude from commits.
- 🚫 **`EXPLORATORY-FINDINGS.md`** — written by the parallel exploratory session, **not ours** → exclude.

## Phase B — Grouping map

### Fine-grained (6 commits, ordered for review)
| # | Group | Files | Suggested message | Pre-commit verify |
|---|---|---|---|---|
| 1 | **security: PII log redaction** | email/sender, sms/index, cabinet email-verify route | `fix(logging): mask PII (email/phone) in logs` | typecheck · lint · check:encoding · check:mojibake · test |
| 2 | **notifications: deep-link focus** | hook+highlighter (NEW), globals.css, booking-notifications, center, conversation-aggregator, chat/messages route, presentation[booking hunk], all anchors/mounts (10 UI files) | `fix(notifications): shared ?focus= reader highlights target row across booking surfaces` | typecheck · lint · encoding · mojibake · test · **build** (UI/CSS) |
| 3 | **reviews: UI gate ⟺ server** | can-leave, client-cabinet/{bookings,reviews,sidebar-counts} | `fix(reviews): align UI review-button gate to server can-leave predicate` | typecheck · lint · encoding · mojibake · test |
| 4 | **studio: reschedule parity** | decline-reschedule.ts (NEW), decline-reschedule route (NEW), studio/bookings.service, studio notification-actions, text.ts | `feat(studio): accept/decline client-proposed reschedule (two-sided parity)` | typecheck · lint · encoding · mojibake · test |
| 5 | **notifications/reviews: billing CTA + self-review** | billing/notifications, presentation[import+BILLING hunk], admin-initiated, reviews/service | `fix(notifications): in-app billing CTA; fix(reviews): block self-review server-side` | typecheck · lint · encoding · mojibake · test |
| 6 | **docs/trackers** | CONTEXT, BACKLOG, BACKLOG-DONE, QA-FINDINGS | `docs: CONTEXT-REFRESH-R2 + BACKLOG split + QA-FINDINGS R2 ledger` | check:encoding · check:mojibake · check:context-freshness |

> Order rationale: PII (isolated security) → `?focus=` infra (shared hook/CSS many surfaces) → review-gate (shared predicate) → studio reschedule (shared decline fn) → billing/self-review (consumes presentation) → docs last (reflect everything). Only #2 + #5 share `presentation.ts` (split via `git add -p`); doing #2 before #5 keeps the split natural.

### Coarse (3 commits — best if the branch squash-merges; avoids the presentation.ts split)
| # | Group | Contents | Message |
|---|---|---|---|
| A | security | PII redaction (group 1) | `fix(logging): mask PII (email/phone) in logs` |
| B | **R2-06 sweep** | groups 2+3+4+5 (presentation.ts whole — no split) | `fix: R2-06 — ?focus= deep-links, review-gate parity, billing CTA, self-review block; feat(studio): reschedule parity` |
| C | docs | group 6 | `docs: CONTEXT-REFRESH-R2 + trackers` |

(A 4-commit middle option also works: PII / notifications [2+5, presentation whole] / reschedule+review [4+3] / docs.)

## Phase C — PR notes (not commits)

**Deploy / ops checklist → PR description (not commits):**
- env → `мастеррядом.online`: `VK_ID_REDIRECT_URI` + `APP_PUBLIC_URL` (stale `beautyhub.art` only in gitignored `.env`)
- VK redirect_uri registration + live VK round-trip QA
- live Telegram round-trip (registered creds)
- SMS gateway live creds (SMS_PROVIDER_ENABLED + login/pass + balance)
- `YANDEX_GEOCODER_API_KEY` in QA env (tz-derivation prerequisite)
- seed representative `BillingPlanPrice` rows (1/3/6/12mo) in QA/prod
- **seed studio-master bookings in QA** *(new — current baseline has 0; unblocks the R2-06-A / R2-06-I studio-actor live E2E that were code-verified-only)*
- YooKassa `payment.succeeded`/`refund` replay + idempotency in live env
- Postgres hosting / TLS / backups / deploy-rollback (DevOps)
- apply migration `20260619000000_provider_timezone_default_moscow` to prod **before** regen seed-snapshot

**Exclusions confirmed:** `.claude/settings.local.json` (discard), `EXPLORATORY-FINDINGS.md` (parallel session — separate review).

**No schema migration in this tree** → no `prisma validate` gate needed for any group. (The package-booking MVP will be the next change that needs one.)

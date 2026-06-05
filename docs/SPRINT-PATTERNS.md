# Sprint Process Patterns

> Synthesized 2026-05-23 from the 16-fix-wave + 5-audit redesign sprint.
> Audience: future Claude Code sessions, second developer, post-launch maintainers.
> Companion to [`QUALITY-GATES.md`](./QUALITY-GATES.md) — gates cover **per-commit checks**, this doc covers **how-we-work meta-lessons**.
>
> Each pattern: **Trigger** (when it applies) → **Action** (what to do) → **Evidence** (sprint sources). Patterns are evidence-grounded, not abstract — every one cites at least one concrete commit.

---

## 1. Audit-first scope-collapse

**Trigger:** About to build a feature, fix, or new infrastructure.

**Action:** Read existing code first. Grep for related infrastructure (helpers, endpoints, types, actor modes). Confirm scope against reality before writing a plan. Be ready to collapse the plan if the audit reveals existing solutions.

**Evidence:** ~17 sprint outcomes where audit revealed scope smaller than spec assumed. Examples:
- `STUDIO-SCHEDULE-SETTINGS-A Phase A` — audit found `/api/cabinet/master/schedule` already exposes `STUDIO_ADMIN` actor mode (via `?studioId&masterId`). Scope collapsed from «new endpoint + helpers + tabs» to «UI mirrors only».
- `PHASE6-HARDENING-AUDIT-A` — 4 status-flips (EMAIL-INFRA, VAPID-PUSH, YANDEX-DEPLOY, CHAT-ATTACHMENT-MIGRATE) revealed prior work already partly/fully done.
- `SMS-GATEWAY-A` — audit found per-phone rate-limit already in `otp-rate-limit.ts:3` (per-IP + per-phone via Redis). No new rate-limit needed.
- `STUDIO-MASTERS-FIX-A` — audit found `isStudioMasterActive` predicate already centralized (invariant #24). New endpoint avoided.

**Estimated savings:** 40-60% of nominal work across the sprint.

**Anti-pattern:** writing a fresh implementation without reading the existing module's exports first.

---

## 2. Trace-ALL-parallel-channels (regression-gap)

**Trigger:** Fixing a class of issue (validation, logging, policy enforcement, security check, error handling) on one surface.

**Action:** Grep for ALL surfaces of that class — booking-create + booking-reschedule, phone-OTP + email-OTP, master-cancel + studio-cancel, etc. Apply the fix to every parallel path in the same commit. Don't ship a partial fix and rely on a future audit to catch the rest.

**Evidence:** 3 occurrences in this sprint, each surfaced by a later audit:
- `STUDIO-CLIENT-WRITE-DIALOG-A` — booking-create endpoint validated, **reschedule path missed** initially; caught + closed in same commit after audit.
- `SEC-1` (in `SECURITY-AUDIT-A`) — phone-OTP `code` removed from logs by `SMS-GATEWAY-A`, **email-OTP `code` still logged** on send-failure branches. Phone fix did not propagate to the parallel channel.
- `OTP-LOG-DEV-GUARD-A` — discovered and closed the gap, applying NODE_ENV guard to all 3 OTP log surfaces (phone + 2 email).

**Checklist:** when fixing a `logInfo(...)`, search for similar `logInfo` lines across phone/email/SMS paths. When fixing a validation, search for similar mutations across create/update/move/cancel.

---

## 3. Cascade-orphan re-scan

**Trigger:** After deleting a file (especially as part of legacy cleanup or a redesign superseding old code).

**Action:** Re-run the orphan-detection scan. A removed file's exclusive imports may newly orphan — orphan-ness cascades through the dependency chain. Don't assume a single sweep catches everything.

**Evidence:**
- `LEGACY-CLEANUP-EXEC-A` Phase 1 deleted `portfolio-stories-bar.tsx` → Phase 2 audit discovered `story-viewer.tsx` was now a cascade-orphan (its sole importer just gone) → `LEGACY-CLEANUP-EXEC-C` closed it.
- The cascade went 2 hops: `portfolio-stories-bar.tsx` (Phase 1) → `story-viewer.tsx` (Phase 3 EXEC-C) → `StoryMaster`/`StoryPhoto` types (also Phase 3, partial-file edit).

**Detection:** after `git rm <file>`, grep for the file's basename across the codebase. Then grep for any module the deleted file was the *sole* importer of.

---

## 4. Quality-gate health monitoring

**Trigger:** Any quality gate (`check:ui-text`, `lint`, `typecheck`, `test`) shows a non-zero exit status.

**Action:** Distinguish between **exit-1-by-findings** (gate works; findings are actionable) and **exit-1-by-crash** (gate is broken; missing-file `statSync` throw, parser error, missing dependency). Read the actual error message. Don't treat «exit 1» as an opaque «expected failure».

**Evidence:**
- `check:ui-text` crashed for **~10 days** (since PHASE7-CLEANUP-A 2026-05-13) on stale allowlist entries pointing to deleted files. The exit-1-by-crash was misread as exit-1-by-findings → debt silently accumulated.
- `LEGACY-CLEANUP-EXEC-A` removed the stale entries → checker actually ran → surfaced 15 pre-existing hardcoded-Cyrillic findings → `UI-TEXT-HARDCODE-FIX-A` closed them and refined the comment-skip pass.

**Periodic check:** during full-gate runs (`npm run check`), inspect each gate's actual output, not just the exit code. Schedule a quarterly «gate health review».

---

## 5. Pattern-coverage-tail («known-pattern-but-incomplete-coverage»)

**Trigger:** When establishing a new pattern (helper, invariant, security rule) in one wave.

**Action:** Recognise that pattern *creation* ≠ pattern *coverage*. The wave that creates a pattern typically applies it to ~1-3 surfaces; pre-pattern code that needs migration remains. **Schedule a separate migration sweep** rather than assuming the pattern auto-applies.

**Evidence (5 of 6 audits hit this shape):**
- `CC-1` — `env.ts` helpers exist; 45 sites still read `process.env.*` directly (inline `secure: process.env.NODE_ENV === "production"`, etc).
- `CC-2` — `UI_TEXT` exists; 4 cabinet feature dirs outside `check:ui-text` ROOTS contain ~306 Cyrillic-containing lines.
- `SEC-1` — `isProduction` log-guard pattern existed in spirit (mock provider only logs in dev); email-OTP paths missed the explicit guard.
- `TEST-COVERAGE` — regression-test-per-fix discipline strong; baseline-flow integration tests lighter (no DB-test infra).
- `DR-1` — `env.ts` schema + dev `.env.example` actively maintained; `.env.production.example` drifted ~5 weeks behind (missing entire `SMS_PROVIDER_*` block + 6 other vars added in May sprint). **Same mechanic, third variant**: canonical (env.ts) + active-mirror (dev example) maintained; passive-mirror (prod example) touched only at deploy time → silently rots.
- `DR-1 secondary discovery` — when PROD-ENV-EXAMPLE-SYNC-A ran, the sync edits didn't appear in `git status`. Investigation: `.gitignore:34` `.env*` matched both templates; neither was ever committed. The gitignore re-include exception pattern was **established by ENV-DISCIPLINE-SWEEP-A for `!docs/SPRINT-PATTERNS.md`** but **never applied to env templates**. Same Pattern 5 shape at the gitignore-rule level: convention exists, exception not extended to a sibling case. Closed by adding `!.env.example` + `!.env.production.example` exceptions. **Lesson**: when establishing a re-include exception for one tracked-template class, audit ALL adjacent classes that should be tracked the same way.

**Variant taxonomy (DR-1 surfaced the 3rd):**
1. **Stale allowlists** — admin allowlist references files removed during a refactor (PHASE7-CLEANUP-A precedent).
2. **Inline reads of a centralized helper** — `process.env.*` after env.ts established (CC-1).
3. **Drifted mirror artifact** — prod env template, prod runbook, prod README, etc — out of sync with canonical source because nothing forces sync on the canonical side (DR-1).

**Remediation:**
- After a pattern wave, file a `*-SWEEP-A` backlog item with concrete file count (e.g. `ENV-DISCIPLINE-SWEEP-A` for 45 sites).
- **When env schema / config canonical changes, sync ALL templates (dev `.env.example` AND prod `.env.production.example`)** in the same commit. Treating prod-mirror as a deploy-time-only artifact is what produces DR-1-shape drift. Audit the prod template at every `*-AUDIT-A` deployment item, not at deploy time (too late).
- Pattern 5 prevention is structural: a `scripts/check-env-templates.mjs` walking env.ts → grep both `.env*.example` → fail CI on missing var would catch this class entirely. Backlog 🔵.

---

## 6. Regression-test-per-fix discipline

**Trigger:** Closing any bug or implementing a new invariant.

**Action:** Add a regression test in the same commit. The test pins the rule the bug violated (or the invariant introduced). Test count grows alongside the codebase, not behind it.

**Evidence (positive pattern, confirmed by `TEST-COVERAGE-AUDIT-A`):** sprint added 214 tests across 22 files (358 → 572). Tests cluster around files that received fixes:
- `flow.test.ts` (28 state-machine tests after `MASTER-BOOKING-UI-FIX-A`)
- `policy-enforcement.test.ts` + variants (after `STUDIO-RESCHEDULE-VALIDATION-A`)
- `chat-attachment-acl.test.ts` (after `MASTER-CHAT-ATTACHMENT-FIX-A`)
- `client-privacy.test.ts` (after `MASTER-PRIVACY-FIX-A`)
- `masking.test.ts` (after `OTP-LOG-DEV-GUARD-A`)

**Outcome:** the same bug cannot ship twice. The audit map confirms 8/8 categories in `ERROR-HANDLING-AUDIT-A` were strong, attributable largely to this discipline.

**Anti-pattern:** shipping a fix with «manual verification only» — works for the immediate change but provides no future-regression guarantee.

---

## 7. Tooling-absence vs coverage-gap distinction

**Trigger:** When categorising a gap from an audit.

**Action:** Distinguish two gap classes:
- **Coverage-tail** — pattern exists; remediation is migrating pre-pattern code (one mechanical sweep).
- **Tooling-absence** — the tool/infrastructure doesn't exist yet; remediation is building it from scratch.

Different effort, different scheduling, different risk.

**Evidence:**
- Coverage-tail examples: CC-1 (env helpers exist, sweep 45 sites), CC-2 (UI_TEXT exists, sweep cabinet dirs), SEC-1 (log-guard pattern existed, apply to email).
- Tooling-absence example: `EH-1` (no Sentry/APM at all — can't migrate to a non-existent tool; must add it first). Different remediation, different effort.

**Anti-pattern:** lumping both as «consistency debt» and underestimating tooling-absence as «just migrate».

---

## 8. Redesign-commit checklist (5-step)

**Trigger:** Redesigning a component / route / area, when the new implementation supersedes existing code.

**Action:** Apply this 5-step checklist in the same commit:
1. **Grep new component basename** — confirm name doesn't collide with existing.
2. **Confirm 0 importers** of the superseded component — verify what you're about to delete is actually dead.
3. **Trace backend dependencies** of the removed UI — routes/services/functions that existed only for that UI. They become orphans together.
4. **Re-scan for cascade-orphans** after deletion (see Pattern 3).
5. **Delete all in same commit:** UI + routes + services + cascade tail. Don't leave stories-V1-backend orphan for months.

**Evidence:**
- `LEGACY-CLEANUP-AUDIT-A` discovered 21 orphan components across cabinets — most from prior redesign waves that deleted new UI but left superseded UI on disk.
- Stories V1 cluster (LEGACY EXEC-A/B/C) became a 3-phase cleanup that should have been one commit at the original redesign.
- PHASE7-CLEANUP-A (May 13) + LEGACY-CLEANUP-AUDIT-A (May 23) collectively found ~50 orphan files (~6 200 LOC) that should have been deleted at their original redesign commits.

**Cost of skipping:** months of dead code on disk, broken quality gates (stale allowlist entries — see Pattern 4), confusion about what's live.

---

## 9. HMAC opaque tokens for privacy-sensitive URLs (rule of N=4)

**Trigger:** Building a URL that exposes a privacy-sensitive identifier (cuid, master id, client id) to the client.

**Action:** Use an HMAC-signed opaque token instead of raw `${cuid}` in the URL. The signed token encodes the id + scope + expiry + purpose claim.

**Evidence (3 applications, rule-of-N=4 for factory extraction):**
- `chat-attachment` — `src/lib/media/chat-attachment-token.ts` (MASTER-CHAT-ATTACHMENT-FIX-A)
- `client-history` — `src/lib/master/client-key-token.ts` (MASTER-CLIENTS-FIX-A)
- `studio-master-view` — `src/lib/studio/master-view-token.ts` (STUDIO-MASTERS-PRIVACY-FIX-A)

Each has a distinct `purpose` claim preventing cross-replay. Each is auth-aware (verifies the calling user's scope matches the token's payload).

**Factory-extraction trigger:** at N=4 sites, extract a shared `createHmacUrlToken({ payload, purpose, ttl })` factory. Until then, three near-identical implementations are acceptable per the project's «small repetition over premature abstraction» preference.

**Anti-pattern:** raw `/api/clients/${cuid}` in client-rendered URLs — exposes internal identifiers to log scrapers, browser history, third parties.

**Exception (design-choice, not gap):** auth-gated endpoints where the cuid is the natural REST identifier and the server-side authorization check enforces ownership (e.g. `/api/bookings/[id]/ics` — `getSessionUser()` verifies the booking belongs to the caller).

---

## 10. Visibility-over-hiding UX

**Trigger:** Building an action button whose enablement depends on state (e.g. cancel button when within deadline, reschedule when booking is confirmed).

**Action:** Render the button **disabled with a tooltip explaining why**, rather than hiding it. User learns the capability exists + understands the current blocker.

**Evidence:**
- `MASTER-BOOKING-UI-FIX-A` — action buttons (Confirm/Decline/Reschedule/Cancel) render disabled+tooltip when the action's preconditions aren't met (initiator already waiting / outside 60-min window / wrong status).
- `STUDIO-MASTERS-FIX-A` — INVITED masters render disabled+tooltip on assignment pickers instead of being filtered out, so studio admin sees the master exists but needs to accept the invite first.

**Anti-pattern:** hiding the button entirely → user thinks the action isn't available at all → support tickets.

---

## 11. Defense-layering

**Trigger:** Implementing a rule (validation, security check, policy enforcement, conflict detection).

**Action:** Apply the rule at multiple layers — UI prevents most violations (validation, disable, hide invalid options), backend enforces always (last-resort source of truth). Don't rely on a single layer.

**Evidence:**
- `STUDIO-RESCHEDULE-VALIDATION-A` — UI master picker filters at source (incompatible masters shown disabled+tooltip); backend `assertMasterPerformsService` + `assertWithinMasterWorkHours` enforces always.
- SMS upload — Sharp re-encoding + MIME allowlist + magic-byte sniff + size guard (3 layers + the upload route's per-user rate limit).
- Booking conflict — UI doesn't show conflicting slots; backend `ensureNoConflicts` enforces always (race-handles via Prisma P2002).
- Rate-limit — sensitive routes fail-closed at gate level even if client misses retry-after handling.

**Anti-pattern:** «backend validates so UI can skip» — UX suffers (users click and discover failure); or «UI filters so backend doesn't need to» — server is the only trusted boundary.

---

## 12. Two-sided pushback (constructive disagreement)

**Trigger:** User issues a directive that the agent sees as a likely-regression risk.

**Action:** Push back with the specific concern and propose a compromise that satisfies both the user's goal and the constraint the user may have missed. Don't blindly comply if you have evidence the request will break something.

**Evidence:**
- `OTP-LOG-DEV-GUARD-A` — user proposed conditionally restoring OTP `code` in logs for dev convenience. Agent confirmed the goal was sound but pushed for NODE_ENV guard pattern (rather than naive revert), AND extended scope to the 2 email surfaces that had the same class issue. Result: closes SEC-1 + serves dev convenience + maintains production security.
- `LEGACY-CLEANUP-EXEC-C` — when user asked «what's next after EXEC-B», agent flagged the cascade-orphan `story-viewer.tsx` that the strict EXEC-B scope had left + recommended closing it for clean stories-V1 removal. Compromise: stay in scope for EXEC-B + spawn EXEC-C immediately rather than backlog.

**Anti-pattern:** «user wants X, ship X exactly» when X breaks an invariant. The user values being told «here's a risk in X, here's Y that gives you the same outcome without the risk» — and explicitly invited this stance via the «if you see risk, say so» rule.

---

## 13. «Verified ready» vs «выполнено» status discipline

**Trigger:** Closing a backlog item that depends on an action you cannot perform from the agent context (production execution, external cron registration, third-party console config).

**Action:** Mark status «⚠️ verified ready for prod execution» — NOT «✅ выполнено» — until the action actually happened in production. «Done» means done-end-to-end, not «code is ready to run».

**Evidence:**
- `CLEANUP-BILLING-PROD-A` — script verified + runbook hardened, but **not run on prod** (Postgres unavailable in dev env). Marked «verified ready», stays open until execution-log row appended.
- `CHAT-ATTACHMENT-MIGRATE` — migration file committed, but `prisma migrate deploy` deferred until Phase 6 deploy window. Stays open.
- `MRR-CRON` — endpoint + worker handler + runbook ready; external cron registration deferred to YANDEX-DEPLOY-A. Stays open.

**Anti-pattern:** marking «done» based on code-ready state. Misleads future planning + creates surprises when prod state diverges from the closed backlog.

---

## 14. Explicit `assertX(...)` helpers for business invariants

**Trigger:** When implementing a rule that must hold at multiple call sites (booking-time policy, master-service compatibility, work-hours window, etc).

**Action:** Define a side-effect-free `assertX(...)` helper that throws `AppError(status, code, message)` on violation, place it in a domain-specific `policy-enforcement.ts` (or analogous module), and call from every entry point (create + reschedule + studio-move + slot-generation surfaces). The helper itself takes plain primitives (no Prisma deps) so unit tests cover the rule semantics exhaustively without DB setup.

**Evidence (BUSINESS-LOGIC-AUDIT-A 2026-05-23 — strongest audit outcome, 0 critical / 0 high findings):**
- `assertBookingWindow` (policy-enforcement.ts) — three surfaces: slot generation / `createBooking` / `rescheduleBooking`. Closed BOOKING-WIDGET-A gap (slot endpoints used to surface impossible-to-book times). Pattern 2 (trace-ALL-parallel-channels) reinforcement.
- `assertMasterPerformsService` (policy-enforcement.ts) — applied at `createBooking` + `moveStudioBooking` + `createStudioBooking` (STUDIO-RESCHEDULE-VALIDATION-A + STUDIO-BUGS-FIX-A).
- `assertWithinMasterWorkHours` (policy-enforcement.ts) — applied at studio reschedule + studio move.
- `assertAcceptsNewClient` (policy-enforcement.ts) — applied at `createBooking` when `acceptNewClients=false`.
- `ensureBookingActionWindow` + `ensureCancellationDeadline` (flow.ts) — applied at `cancelBooking` + `rescheduleBooking`.

**Outcome:** the 6 `assertX` helpers above cover the booking system's core invariants. Unit tests in `flow.test.ts` (32 tests) + `policy-enforcement.test.ts` + `reschedule-policy.test.ts` (11 tests) + `create-booking-enforcement.test.ts` (7 tests) lock the rules. **0 critical / 0 high business-logic findings across 8 categories** in BUSINESS-LOGIC-AUDIT-A is strongly correlated with this pattern's adoption.

**When NOT to use:**
- For one-shot validation at a single call site, inline the check (no need for a helper).
- For complex multi-table validation (e.g. «client's lifetime spending qualifies them for a discount»), use a domain service, not a one-line assertion.
- For typed contract validation, use Zod schemas (`parseBody`) — `assertX` is for runtime invariants AFTER parsing succeeds.

**Composition with Pattern 2:** when a new domain entry point appears (e.g. a new admin booking-mutation endpoint), audit the `assertX` family — every one that applies must be wired. Same trace-all-parallel-channels discipline that found STUDIO-CLIENT-WRITE-DIALOG-A regression-gap (createStudioBooking missed work-hours guard).

**Scale-with-adoption (Pattern 14 leverage curve):** the fan-out of a single shared-primitive fix scales with the primitive's adoption surface. Evidence:

| Primitive | Helpers / hooks | Enforcement points | Single-fix leverage |
|---|---|---|---|
| Booking `assertX` family | 6 | ~14 | medium |
| Portfolio `loadMasterServiceOverridesMap` | 1 | 4 | small |
| **`use-modal-a11y` hooks** | **3** | **55+ (50 ModalSurface + 5 Drawer)** | **largest** |

**Implication:** the earlier a pattern lands in a shared primitive, the larger the latent leverage for future fixes at any axis (security / a11y / performance / business correctness). MODAL-UNIFY-IMPL-A investment paid off at the a11y axis without per-caller work in MODAL-A11Y-BATCH-A. **Counter-example / when NOT to extract:** don't extract a primitive prematurely for 1-2 callers — wait for ≥3 to confirm the pattern. Premature extraction has the inverse cost (carry of unused abstraction).

---

## 15. Workflow-orchestrated parallel survey audit

**Trigger:** When surveying N≥3 disjoint surfaces (code areas, documentation sections, system components, audit categories) for findings, coverage gaps, or coherence updates. Surfaces are independent (no blocking dependencies between them), and you need synthesized coherent results across all surfaces.

**Action:** Decompose into N parallel Explore-type subagents via Workflow API `parallel()`. Each agent inspects one surface and returns findings via a shared JSON schema with fields: `findings` (list), `status` (categorical: ok / warning / critical), `stopGateReason` (optional string flagging user-decision points). Main context then sequentially synthesizes: read all agent outputs, apply safe structural edits, flag user-decisions, produce coherent narrative. If schema has `stopGateReason` field, treat it as an explicit gate — refuse silent changes until user confirms decision.

**Composition:** Workflow API `parallel()` + Explore agentType + structured JSON schemas with optional STOP-gate field. Composes naturally with Pattern 1 (audit-first scoping) and Pattern 5 (coverage-tail vs new-discovery classification).

**Evidence (2 instances, 2026-05-29):**
- **DOCUMENTATION-AUDIT-A** — 6 parallel Explore subagents surveying onboarding / operations / internal / process / code+schema / API surfaces. **228 tool uses, ~4 min wall-clock, 427K tokens.** Returned 31 findings (0 critical / 3 high / 13 medium / 15 low) via structured JSON. Main context synthesized into a single audit entry. Speedup: ~24 agent-minutes done in 4 min wall-clock (6× parallelism). Schema-validated returns prevent synthesis errors.
- **CONTEXT-REFRESH-V3** — 3 parallel Explore subagents surveying AI_CONTEXT sections 1-7 / 8-14 / 15-changelog. **132 tool uses, ~14 min wall-clock, 273K tokens.** Returned structured findings + cross-references + emergent invariant candidates via JSON schema with `stopGateReason`. **STOP-gate triggered correctly** — section 15 inspector flagged compaction strategy as user-decision; main-context resolved without silent change. Speedup: ~42 agent-minutes done in 14 min (3× parallelism).

**Counter-example (when NOT to use):**
1. Sequential survey where findings from surface-A must inform sampling/scope of surface-B (e.g. «audit routes first to decide which handlers to inspect»).
2. Survey of <3 surfaces (below decomposition threshold — inline in main prompt).
3. Highly interdependent work where agents need to negotiate scope (e.g. refactoring where agent-A's changes affect agent-B's scope).
4. Real-time monitoring (use `tail -f` or `inotifywait` instead).
5. Tasks requiring user interaction during survey.
6. Decision points that don't cleanly express as structured JSON.

**Cost / value:** Wall-clock reduction = (N × per-agent-time) / parallel-time. Breakeven at N=2 (parallel overhead > savings); default-parallel at N≥3. Token cost ≈ sequential (tokens flow either way), but wall-clock matters for user-perceived responsiveness. Schema-validated JSON prevents synthesis errors that plague free-text natural-language parsing. STOP-gate field surfaces decision points before silent changes.

---

## Patterns enforcement column (Шаг 2 of 3-step Structural Prevention plan)

Honest tracking added 2026-05-29 (STRUCTURAL-PREVENTION-AUDIT, Capstone Шаг 3). **Most patterns rely on manual discipline** — this is a valid and intentional design choice for a small-team / agent-collaborated codebase. Structural enforcement is reserved for high-recurrence pattern classes where automation pays off (test suites, lint rules, CI scripts).

| # | Pattern | Enforcement | Honest note |
|---|---------|-------------|---|
| 1 | Audit-first scope-collapse | manual | Meta-work pattern (pre-coding discipline); cannot be structurally enforced without agent-level hooks |
| 2 | Trace-all-parallel-channels | partial | Tests catch post-facto (Pattern 6); no pre-commit linter for «did you trace all channels?» |
| 3 | Cascade-orphan re-scan | manual | Requires file-dependency-graph tooling that doesn't exist; relies on grep + code review |
| 4 | Quality-gate health monitoring | partial | Gates exist + run in CI; crash-vs-findings distinction is manual interpretation |
| 5 | Pattern-coverage-tail | partial | `check:ui-text` covers some, `check-env-templates.mjs` backlogged not built; remediation = manual sweep |
| 6 | Regression-test-per-fix | structural | Vitest infrastructure + `npm run test` CI gate; ~8125 LOC tests across 70+ files; required to pass |
| 7 | Tooling-absence vs coverage-gap | manual | Meta-categorization for audit design; no automation |
| 8 | Redesign-commit 5-step | manual | Requires «superseded component» detection at commit time; relies on code review |
| 9 | HMAC opaque tokens (N=4 rule) | partial | 3 implementations + tests; no linter flags raw cuid-in-URL; N=4 factory deferred |
| 10 | Visibility-over-hiding UX | manual | UI primitives ease compliance; no linter for `display:none` vs disabled+tooltip |
| 11 | Defense-layering | partial | Multiple layers (UI + assertX + Prisma constraints) at domain level; no CI check enforces «UI gate ⇒ backend gate» |
| 12 | Two-sided constructive pushback | manual | Behavioral pattern for agent sessions; not a codebase artifact |
| 13 | «Verified ready» vs «выполнено» | manual | Backlog labeling discipline; no automation distinguishes code-ready from production-executed |
| 14 | Explicit `assertX(...)` helpers | structural | 6 helpers × 14+ enforcement points, all tested; BUSINESS-LOGIC-AUDIT 0 critical/high findings strongly correlated |
| 14 | Pattern 14 Scale-with-adoption | partial | Strong adoption of shared primitives (use-modal-a11y at 55+ sites); no linter forces new modals to adopt |
| 15 | Workflow-orchestrated parallel survey | structural | Workflow API + parallel() + Explore + JSON schema; tooling complete, pattern formalized 2026-05-29 |

**Aggregate (2026-05-29): 2 structural / 5 partial / 7 manual / 0 none.** Confirms organizing thesis from CONTEXT-REFRESH-V3: «strong on new code + shared primitives, gaps in legacy + structural-prevention CI scripts as deferred backlog accumulation». Pattern 7 (tooling-absence) recurs at every axis (security / perf / ui-ux / docs / process); STRUCTURAL-PREVENTION-AUDIT's prioritized enforcement plan addresses this.

---

## Audit-волна consolidated stats (post-item-5)

| Audit item | Result | New findings | Process insight captured |
|---|---|---|---|
| 1. `LEGACY-CLEANUP` | done + 3 EXEC phases (~3 700 LOC removed) | 0 | Patterns 3, 8 |
| 2. `SECURITY-AUDIT` | 6/8 clean → +1 fix ship (`OTP-LOG-DEV-GUARD-A`) | 1 🟠→fixed, 1 🟡, 1 🔵 | Patterns 2, 5 |
| 3. `CODE-CONSISTENCY` | 6/8 clean | 2 🟡 | Patterns 5, 7 |
| 4. `TEST-COVERAGE` | 0 critical, 5 minor | 3 🟡, 2 🔵 | Pattern 6 |
| 5. `ERROR-HANDLING` | 8/8 strong | 1 🟡 (tooling) | Pattern 7 |

**Repeating shapes:** «known-pattern-but-incomplete-coverage» (Pattern 5) — 4 of 5 audits hit this; the 5th (ERROR-HANDLING) revealed a new shape — «tooling-absence» (Pattern 7), the first non-coverage gap class surfaced.

**Pattern-application discipline produced highly-resilient surfaces.** The audit-волна validates that the sprint's invariant-application + regression-test-per-fix + defense-layering yields code that survives scrutiny.

---

## Framework alignment note

The user uploaded an `ai-dev-framework` codifying ~80% of these patterns externally. Decision was to **defer framework adoption post-launch** — these patterns evolved organically during the sprint and are documented here as project-internal lessons. If/when the framework is adopted post-launch, this document maps cleanly to most of its sections — no rewrite needed, just cross-reference.

---

## When to consult this doc

- **Before designing a fix:** patterns 1, 2 (audit-first; trace parallel channels).
- **Before a redesign commit:** pattern 8 (5-step checklist).
- **After deletion:** patterns 3, 4 (cascade re-scan; gate health).
- **When adding tests:** pattern 6 (regression-per-fix).
- **When closing a backlog item:** pattern 13 (verified-ready vs выполнено).
- **When user pushes a request you see risk in:** pattern 12 (constructive pushback).
- **When the audit-волна yields a gap:** patterns 5, 7 (coverage-tail vs tooling-absence).
- **When implementing a multi-site business invariant:** pattern 14 (explicit `assertX` helper).
- **When surveying N≥3 disjoint surfaces:** pattern 15 (workflow-orchestrated parallel survey audit).
- **When evaluating «what could prevent recurrence»** (post-audit, post-fix): consult Patterns enforcement column to honestly tag a candidate as manual / partial / structural / none.

For per-commit checks (typecheck, lint, encoding, tests, prisma, context updates), see [`QUALITY-GATES.md`](./QUALITY-GATES.md).

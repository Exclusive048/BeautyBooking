# МастерРядом — Runbooks Index

Operational runbooks for BeautyHub / МастерРядом. Use this index to discover the right document when something breaks, when planning a routine task, or when preparing a release.

> **First time on-call?** Read `incident-drill-checklist.md` end-to-end and run at least one drill (Redis-down recommended) before your first real incident.

---

## Quick navigation

- [Incident response](#incident-response) — page-and-fix scenarios
- [Routine operations](#routine-operations) — scheduled / maintenance tasks
- [Pre-launch & deployment](#pre-launch--deployment) — release gates
- [Drills](#drills) — readiness rehearsals
- [Technical reference](#technical-reference) — health/admin API surfaces

---

## Incident response

Page-and-fix runbooks. Open these when a surface is degraded or down. Each one documents symptoms → where to check → interpretation → mitigation → close criteria.

| Runbook | When to open | Primary signal |
|---|---|---|
| [`redis-down.md`](redis-down.md) | `/api/health` returns 503, Redis unreachable, worker/notifier degraded | `data.readiness.redis = false` |
| [`queue-backlog-worker-lag.md`](queue-backlog-worker-lag.md) | Worker stopped pinging, dead jobs growing, queue backed up | `workerAlive = false` or `overloaded = true` |
| [`yookassa-webhook-retry-storm.md`](yookassa-webhook-retry-storm.md) | YooKassa webhook failures spiking, `yookassa.webhook` dead jobs accumulating | `data.surfaces.webhook.failureCount` spike |
| [`auth-outage.md`](auth-outage.md) | Mass login/refresh failures, OTP degradation | `data.surfaces.auth.failureCount/deniedCount` spike |

**During an incident** (general flow regardless of which runbook):
1. Capture starting state: `/api/health/status` snapshot (readiness, queue stats, surfaces).
2. Open the runbook matching the primary signal.
3. Follow the interpretation section before acting — don't restart blind.
4. Note `lastOperation` / `lastCode` per affected surface — they narrow root cause fast.
5. After mitigation: confirm close criteria from the runbook, then post-check `/api/health/status` again.

---

## Routine operations

Scheduled tasks and maintenance jobs. Not incident-driven — these run on a cadence or on operator demand.

| Runbook | Cadence | Purpose |
|---|---|---|
| [`mrr-snapshot-cron.md`](mrr-snapshot-cron.md) | Daily (cron) | Writes MRR + active-subscription snapshot for `/admin/billing` delta tile |
| [`yookassa-allowlist-maintenance.md`](yookassa-allowlist-maintenance.md) | Per `reviewCadenceDays` + before each release | Keep YooKassa webhook IP allowlist current without weakening signature checks |
| [`cleanup-duplicate-billing-plans.md`](cleanup-duplicate-billing-plans.md) | One-shot (pre-launch blocker) | Collapse 12-row `BillingPlan` table to 6 canonical UPPERCASE plans |

---

## Pre-launch & deployment

Open these when shipping a release candidate to production, or when verifying production readiness.

| Runbook | When to open | Purpose |
|---|---|---|
| [`release-go-no-go-checklist.md`](release-go-no-go-checklist.md) | Before every production deploy | 12-section GO/NO-GO gate (infrastructure / migrations / secrets / health / billing / etc) |
| [`cleanup-duplicate-billing-plans.md`](cleanup-duplicate-billing-plans.md) | Once, before first production launch | Pre-launch data hygiene (also listed under Routine ops) |
| [`yookassa-allowlist-maintenance.md`](yookassa-allowlist-maintenance.md) | Before every release | Re-verify IP allowlist against YooKassa current docs |

**Deploy order invariant:** schema migrations (`prisma migrate deploy`) **before** app container rolling restart. See `release-go-no-go-checklist.md` for the full ordering.

---

## Drills

Readiness rehearsals — run these on a staging-like environment to verify on-call can navigate incidents without thrashing.

| Document | Purpose |
|---|---|
| [`incident-drill-checklist.md`](incident-drill-checklist.md) | 4 incident drills (Redis down / Queue backlog / YooKassa retry storm / Auth outage) with explicit PASS/FAIL criteria and Result template per drill |

**Recommended cadence:** run each drill at least once per quarter, or whenever on-call rotation changes. Record results in the per-drill Result template (date / operator / pass-fail / notes).

---

## Technical reference

Foundational API surfaces every runbook references. Read this section once; subsequent runbooks assume familiarity.

### Health surfaces

`GET /api/health`
- Доступ: без авторизации.
- Сигнал: `{ ok: true|false }`.
- Что покрывает: DB (`SELECT 1`) + Redis `PING`.

`GET /api/health/worker`
- Доступ: без авторизации.
- Сигналы:
  - `alive` (воркер пинговал не старше 120с).
  - `lastPingAgo`.
  - `queue.pending`, `queue.processing`, `queue.dead`.

`GET /api/health/status`
- Доступ: admin session или заголовок `x-worker-secret: <WORKER_SECRET>`.
- Формат: `{ ok: true, data: { ... } }` либо ошибка.
- Ключевые поля:
  - `data.readiness.{db,redis,worker,queueStats,notifier,ready}`.
  - `data.queueWorker.{workerAlive,workerLastPingAgoSec,stats,overloaded,thresholds}`.
  - `data.notifier.{mode,ready,reason}`.
  - `data.surfaces.{auth,bookings,webhook,media,notifications}`.

### Admin queue surfaces

`GET /api/admin/queue`
- Доступ: только admin session.
- Сигналы:
  - `stats.{pending,processing,dead}`.
  - `deadJobs[]` (есть `queueIndex` и `job`).

`PATCH /api/admin/queue/{index}`
- Доступ: только admin session.
- Действие: вернуть dead job обратно в очередь.

`DELETE /api/admin/queue/{index}`
- Доступ: только admin session.
- Действие: удалить dead job.

### Interpretation of surface snapshot

В `data.surfaces.<surface>`:
- `lastOutcome`: `success | failure | denied | degraded | null`.
- `lastOperation`: где произошёл последний сигнал.
- `lastCode`: прикладной код ошибки/причины.
- `successCount/failureCount/deniedCount/degradedCount`: накопительные счётчики (TTL 7 дней в Redis).
- `store`: `redis | memory | none` (в production ожидается `redis`).

### Baseline constraints

- Документы опираются только на существующие API и контракты.
- Без секретов: используйте placeholders (`<WORKER_SECRET>`, `<YOOKASSA_...>`).
- Runbooks рассчитаны на ручной incident response, без отдельного incident-management фреймворка.

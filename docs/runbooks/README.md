# MON-03 Runbooks Baseline

Короткий набор operational инструкций для прод-инцидентов в BeautyHub / МастерРядом.

## Базовые surfaces

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

## Интерпретация surface snapshot

В `data.surfaces.<surface>`:
- `lastOutcome`: `success | failure | denied | degraded | null`.
- `lastOperation`: где произошёл последний сигнал.
- `lastCode`: прикладной код ошибки/причины.
- `successCount/failureCount/deniedCount/degradedCount`: накопительные счётчики (TTL 7 дней в Redis).
- `store`: `redis | memory | none` (в production ожидается `redis`).

## Ограничения baseline

- Документы опираются только на существующие API и контракты.
- Без секретов: используйте placeholders (`<WORKER_SECRET>`, `<YOOKASSA_...>`).
- Runbooks рассчитаны на ручной incident response, без отдельного incident-management фреймворка.

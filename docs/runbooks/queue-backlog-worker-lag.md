# Runbook: Queue Backlog / Worker Lag / Dead Jobs Growth

## Симптомы

- `GET /api/health/worker` показывает `alive = false` или `lastPingAgo` быстро растёт.
- `GET /api/health/status` показывает `data.queueWorker.overloaded = true`.
- Queue метрики выше порогов:
- `pending > 1000`
- `processing > 50`
- `dead > 10`
- `GET /api/admin/queue` показывает рост `deadJobs`.

## Где проверять

- `GET /api/health/worker`
- `GET /api/health/status`:
- `data.queueWorker.workerAlive`
- `data.queueWorker.workerLastPingAgoSec`
- `data.queueWorker.stats`
- `data.queueWorker.thresholds`
- `GET /api/admin/queue`:
- `stats`
- `deadJobs[].job.type`

## Как интерпретировать сигнал

- `workerAlive = false` + рост `pending` -> worker не обрабатывает очередь.
- Высокий `processing` долго без снижения -> возможны stuck jobs или зависший worker.
- Рост `dead` -> повторные падения при обработке job.
- `pending/processing/dead = -1` -> сначала проверить Redis-инцидент (см. `redis-down.md`).

## Первичные действия

1. Проверить состояние worker-процесса и перезапустить worker при `workerAlive = false`.
2. Убедиться, что после рестарта `workerAlive = true` и `lastPingAgo` снова малый.
3. Проверить `GET /api/admin/queue` и определить типы jobs в dead queue.
4. Для исправленной причины выполнить точечный replay: `PATCH /api/admin/queue/{index}`.
5. Для нерелевантных/битых задач удалить элемент: `DELETE /api/admin/queue/{index}`.

## Временная mitigation

1. Временно не запускать ручные bulk-операции, которые добавляют jobs в очередь.
2. Повторный запуск dead jobs делать батчами (не всё сразу), проверяя динамику `pending/dead` после каждого батча.
3. Если упирается в Redis доступность, переключиться на runbook `redis-down.md`.

## Как понять, что инцидент устранён

- `GET /api/health/worker` -> `200`, `alive = true`.
- `GET /api/health/status` -> `data.queueWorker.overloaded = false`.
- `pending`, `processing`, `dead` устойчиво ниже порогов.
- `deadJobs` перестаёт расти.

## Что проверить после восстановления

1. Нормальную обработку webhook jobs (`type = "yookassa.webhook"`) и других критичных job-типов.
2. Что `data.readiness.worker = true` и `data.readiness.queueStats = true`.
3. Что `data.surfaces.webhook`/`data.surfaces.notifications` не продолжают накапливать `failure`.

## Пометка на будущее

- Если потребуется, добавить отдельный статус по age старейшей pending/dead job для более точного SLA по лагу.

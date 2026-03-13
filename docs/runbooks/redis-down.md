# Runbook: Redis Down / Redis Degraded

## Симптомы

- `GET /api/health` возвращает `503` и `{ ok: false }`.
- `GET /api/health/status` показывает `data.readiness.redis = false`.
- `GET /api/health/status` показывает `data.readiness.worker = false` и/или `data.readiness.notifier = false`.
- `GET /api/health/worker` возвращает `503`, `alive = false`, queue-статистика может быть `-1/-1/-1`.
- Растут проблемы в зависимых сценариях: webhook enqueue, OTP rate-limit проверки, notification stream.

## Где проверять

- `GET /api/health`
- `GET /api/health/worker`
- `GET /api/health/status`:
- `data.readiness`
- `data.queueWorker`
- `data.notifier`
- `data.surfaces`

## Как интерпретировать сигнал

- `readiness.redis = false` при `readiness.db = true` -> primary suspect: Redis.
- `notifier.mode = "unavailable"` и `notifier.reason = "redis-required"` -> в production недоступен notifier.
- `queue.stats = -1/-1/-1` -> queue stats не читаются (обычно Redis недоступен).
- `surfaces.<name>.store = "none"` в production -> monitoring surface store не пишет/не читает статус.

## Первичные действия

1. Подтвердить, что Redis доступен из runtime (приложение + worker) и `REDIS_URL` корректно задан.
2. Проверить логи приложения/воркера на `Redis connection failed` и `Redis client error`.
3. Проверить, поднят ли worker после восстановления Redis (в production worker стартует только при успешном Redis `PING`).
4. Проверить `GET /api/health/status` до получения `readiness.redis = true`.

## Временная mitigation

1. Пока Redis недоступен, не запускать ручные массовые операции, генерирующие queue jobs.
2. Если есть webhook retry pressure, сначала восстановить Redis, потом разбирать backlog.
3. Команде поддержки дать статус, что часть realtime/queue функций деградировала до восстановления Redis.

## Как понять, что инцидент устранён

- `GET /api/health` -> `200`, `{ ok: true }`.
- `GET /api/health/status` -> `data.readiness.redis = true`.
- `GET /api/health/status` -> `data.readiness.worker = true`, `data.readiness.notifier = true`, `data.readiness.queueStats = true`.
- `GET /api/health/worker` -> `200`, `alive = true`, queue stats не отрицательные.

## Что проверить после восстановления

1. Queue backlog: `pending/processing/dead` стабилизируются и идут вниз.
2. `data.surfaces.webhook.lastOutcome` и `data.surfaces.auth.lastOutcome` снова переходят в `success` в живом трафике.
3. `data.notifier.mode = "redis"`, `data.notifier.ready = true`.
4. При необходимости обработать dead jobs через `/api/admin/queue/{index}`.

## Пометка на будущее

- Если понадобится более точный триаж degraded-состояния Redis, добавить отдельный latency/timeout сигнал в status surface.

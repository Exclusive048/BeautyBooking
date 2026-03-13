# Incident Drill Checklist (MON-03)

Цель: быстро проверить, что on-call может пройти типовые инциденты без хаотичных действий.

## Общий prep

1. Открыть `docs/runbooks/README.md`.
2. Подготовить доступ к:
- `/api/health`
- `/api/health/worker`
- `/api/health/status`
- `/api/admin/queue`
3. Назначить роли: Incident Lead, Observer, Executor.
4. Зафиксировать стартовое состояние (`readiness`, `queue stats`, `surfaces`).

## Drill A: Redis down / degraded

1. Симулировать недоступность Redis в стенде (без секретов в логах/доках).
2. Проверить, что команда видит:
- `/api/health = 503`
- `readiness.redis = false`
- влияние на worker/notifier.
3. Пройти шаги из `redis-down.md`.
4. После восстановления подтвердить критерии закрытия и post-check.

## Drill B: Queue backlog / worker lag

1. Симулировать остановку/лаг worker в стенде.
2. Проверить, что команда замечает:
- `workerAlive = false` или рост `lastPingAgo`
- `pending/dead` рост и/или `overloaded = true`.
3. Пройти шаги из `queue-backlog-worker-lag.md`.
4. Сделать точечный replay dead jobs и подтвердить стабилизацию.

## Drill C: YooKassa webhook retry storm

1. Симулировать ошибку ingress (например, неверная подпись) или processor failure в стенде.
2. Проверить, что команда разделяет ingress vs processor по `lastOperation/lastCode`.
3. Пройти шаги из `yookassa-webhook-retry-storm.md`.
4. После фикса выполнить batch replay и убедиться, что `dead` не растёт.

## Drill D: Auth outage

1. Симулировать массовые refresh/login ошибки в стенде.
2. Проверить, что команда использует `surfaces.auth` вместе с `readiness.db/redis`.
3. Пройти шаги из `auth-outage.md`.
4. Подтвердить восстановление контрольным refresh flow и поверхностями.

## Завершение drill

1. Зафиксировать таймлайн: detection -> mitigation -> recovery.
2. Зафиксировать пробелы сигналов/действий (макс. 3 пункта).
3. Создать follow-up задачи только на точечные улучшения (без расширения scope MON-03).

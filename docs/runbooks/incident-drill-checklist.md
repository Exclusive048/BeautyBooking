# Incident Drill Checklist (MON-03)

Цель: быстро проверить, что on-call может пройти типовые инциденты без хаотичных действий.

**Каждый drill имеет explicit PASS / FAIL критерии + Result template.** Drill считается успешным только если ВСЕ PASS-критерии выполнены и НИ ОДИН FAIL-критерий не сработал. Результаты фиксировать в шаблоне в конце каждого drill — это формирует исторический trail для on-call rotation handoff.

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

### Drill A — PASS criteria

- [ ] Detection time ≤ 5 минут от симуляции до identification (Lead называет «Redis down» по сигналу, не по жалобе).
- [ ] Команда корректно интерпретирует `/api/health = 503` + `readiness.redis = false` как Redis-issue (не как DB или worker).
- [ ] Executor открывает `redis-down.md` ДО выполнения действий — не действует по памяти.
- [ ] После восстановления Redis: `/api/health = 200`, `readiness.redis = true`, `notifier.mode != "unavailable"` в пределах 2 минут.
- [ ] Post-check `/api/health/status` подтверждает `readiness.ready = true` и `queueWorker.workerAlive = true`.
- [ ] Таймлайн зафиксирован: detection → mitigation → recovery.

### Drill A — FAIL criteria

- [ ] Команда начинает с restart воркера или приложения до проверки Redis readiness.
- [ ] Detection time > 10 минут.
- [ ] Кто-то предлагает «временно отключить rate-limit» или другой shortcut, weakening safety.
- [ ] После «восстановления» один или более surfaces остаются degraded и это не замечено.
- [ ] Использованы реальные секреты в чате/логах drill.

### Drill A — Result

```
Дата:               YYYY-MM-DD
Operator (Lead):    @username
Observer:           @username
Executor:           @username
Duration:           total / detection / mitigation / recovery (min)
PASS criteria met:  __ / 6
FAIL triggered:     __ / 5
Verdict:            PASS | FAIL
Notes:              free-form (max 3 пробела/improvements)
Follow-up tasks:    ticket IDs или «none»
```

## Drill B: Queue backlog / worker lag

1. Симулировать остановку/лаг worker в стенде.
2. Проверить, что команда замечает:
- `workerAlive = false` или рост `lastPingAgo`
- `pending/dead` рост и/или `overloaded = true`.
3. Пройти шаги из `queue-backlog-worker-lag.md`.
4. Сделать точечный replay dead jobs и подтвердить стабилизацию.

### Drill B — PASS criteria

- [ ] Detection time ≤ 5 минут от симуляции до identification («worker не пингует» или «pending растёт»).
- [ ] Команда различает worker-stopped (`workerAlive = false`) от worker-overloaded (`overloaded = true`) — не путает причины.
- [ ] Executor открывает `queue-backlog-worker-lag.md` ДО действий.
- [ ] Dead jobs изучены через `/api/admin/queue` ДО replay — не делают blind replay всего dead-list.
- [ ] Точечный replay: выбран ≥1 dead job, возвращён через `PATCH /api/admin/queue/{index}`, подтверждён успех processing.
- [ ] Post-check: `workerAlive = true`, `lastPingAgo < 120s`, `pending` тренд снижается, `overloaded = false`.

### Drill B — FAIL criteria

- [ ] Blind bulk-replay всех dead jobs без анализа `job.type` или error reasons.
- [ ] Detection time > 10 минут.
- [ ] Команда увеличивает worker concurrency/threshold вместо устранения root cause.
- [ ] Dead jobs удалены через `DELETE` без записи в follow-up для post-mortem.
- [ ] После «восстановления» `pending` продолжает расти и это не замечено.

### Drill B — Result

```
Дата:               YYYY-MM-DD
Operator (Lead):    @username
Observer:           @username
Executor:           @username
Duration:           total / detection / mitigation / recovery (min)
PASS criteria met:  __ / 6
FAIL triggered:     __ / 5
Verdict:            PASS | FAIL
Notes:              free-form (max 3 пробела/improvements)
Follow-up tasks:    ticket IDs или «none»
```

## Drill C: YooKassa webhook retry storm

1. Симулировать ошибку ingress (например, неверная подпись) или processor failure в стенде.
2. Проверить, что команда разделяет ingress vs processor по `lastOperation/lastCode`.
3. Пройти шаги из `yookassa-webhook-retry-storm.md`.
4. После фикса выполнить batch replay и убедиться, что `dead` не растёт.

### Drill C — PASS criteria

- [ ] Detection time ≤ 5 минут (рост `data.surfaces.webhook.failureCount` или `deniedCount`).
- [ ] Команда корректно различает ingress-failure (signature/IP-allowlist deny) от processor-failure (Prisma/idempotency conflict) по `lastOperation/lastCode`.
- [ ] При ingress-issue команда проверяет `yookassa-allowlist-maintenance.md` или signature config — НЕ retries blindly.
- [ ] При processor-issue: dead jobs изучены, root cause identified ДО batch replay.
- [ ] Batch replay выполнен ПОСЛЕ фикса root cause, не до.
- [ ] Post-check: `data.surfaces.webhook.failureCount` стабилизировался, `dead` count перестал расти, `successCount` инкрементирует.

### Drill C — FAIL criteria

- [ ] Batch replay сделан до устранения root cause (приведёт к повторному failure storm).
- [ ] Команда «временно ослабляет» signature/IP проверки — нарушение invariant #5 (YooKassa HMAC + IP allowlist).
- [ ] Detection time > 10 минут.
- [ ] Idempotency-конфликты intepretation как «нормальная retry» без анализа — рискует молча дропать дубль платежа.
- [ ] Использованы реальные YooKassa секреты в drill artifacts.

### Drill C — Result

```
Дата:               YYYY-MM-DD
Operator (Lead):    @username
Observer:           @username
Executor:           @username
Duration:           total / detection / mitigation / recovery (min)
PASS criteria met:  __ / 6
FAIL triggered:     __ / 5
Verdict:            PASS | FAIL
Notes:              free-form (max 3 пробела/improvements)
Follow-up tasks:    ticket IDs или «none»
```

## Drill D: Auth outage

1. Симулировать массовые refresh/login ошибки в стенде.
2. Проверить, что команда использует `surfaces.auth` вместе с `readiness.db/redis`.
3. Пройти шаги из `auth-outage.md`.
4. Подтвердить восстановление контрольным refresh flow и поверхностями.

### Drill D — PASS criteria

- [ ] Detection time ≤ 5 минут (рост `data.surfaces.auth.failureCount` / `deniedCount`).
- [ ] Команда проверяет `readiness.db` И `readiness.redis` ДО conclusion о причине — не сваливает auth-issue на «токены».
- [ ] Если `readiness.redis = false` — команда переключается на `redis-down.md` вместо action в `auth-outage.md`.
- [ ] Если `readiness.db = false` — команда восстанавливает DB ДО проверки refresh flow.
- [ ] Контрольный `POST /api/auth/refresh` авторизованной сессией возвращает 200 после mitigation.
- [ ] Post-check: `data.surfaces.auth.successCount` инкрементирует, `failureCount` стабилизировался.

### Drill D — FAIL criteria

- [ ] Команда invalidates all refresh-токены без проверки backend readiness (massive customer impact, не fixed root cause).
- [ ] Detection time > 10 минут.
- [ ] Cookie/session env конфиг изменён в production hot-fix без version control trail.
- [ ] `SERVICE_UNAVAILABLE` от `telegram-login` интерпретируется как auth outage вместо config issue (отсутствует `TELEGRAM_BOT_TOKEN`).
- [ ] После «восстановления» surfaces показывают degraded и это не замечено.

### Drill D — Result

```
Дата:               YYYY-MM-DD
Operator (Lead):    @username
Observer:           @username
Executor:           @username
Duration:           total / detection / mitigation / recovery (min)
PASS criteria met:  __ / 6
FAIL triggered:     __ / 5
Verdict:            PASS | FAIL
Notes:              free-form (max 3 пробела/improvements)
Follow-up tasks:    ticket IDs или «none»
```

## Завершение drill

1. Зафиксировать таймлайн: detection -> mitigation -> recovery.
2. Зафиксировать пробелы сигналов/действий (макс. 3 пункта).
3. Создать follow-up задачи только на точечные улучшения (без расширения scope MON-03).
4. **Архивировать Result template** в команде / runbook history (на год минимум) — формирует evidence trail для on-call handoff и quarter reviews.

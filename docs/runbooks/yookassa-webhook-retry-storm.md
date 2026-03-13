# Runbook: YooKassa Webhook Failures / Retry Storm

## Симптомы

- Быстро растут `failureCount` и/или `deniedCount` в `data.surfaces.webhook`.
- Растут `queue.pending` и `queue.dead`.
- В `GET /api/admin/queue` много `deadJobs` с `job.type = "yookassa.webhook"`.
- `GET /api/health/status` может показывать `data.queueWorker.overloaded = true`.

## Где проверять

- `GET /api/health/status`:
- `data.surfaces.webhook.{lastOutcome,lastOperation,lastCode,failureCount,deniedCount,successCount}`
- `data.queueWorker`
- `GET /api/admin/queue`:
- `deadJobs[]` и `deadJobs[].job.type`
- `GET /api/health` и `GET /api/health/worker` (чтобы исключить общий Redis/worker outage).

## Как интерпретировать сигнал

- `lastOperation = "yookassa-ingress"` и `lastCode`:
- `INVALID_SIGNATURE` -> не проходит подпись.
- `IP_NOT_ALLOWED` -> IP не в allowlist.
- `INVALID_WEBHOOK_TOKEN` -> не совпадает bearer token.
- `QUEUE_ENQUEUE_FAILED` -> webhook принят, но не попал в очередь (обычно Redis/queue проблема).
- `lastOperation = "yookassa-worker-processor"` и `lastOutcome = "failure"` -> ошибка при обработке payload в воркере.

## Первичные действия

1. Определить фазу поломки: ingress (`yookassa-ingress`) или processor (`yookassa-worker-processor`).
2. Для ingress `denied`:
3. Проверить `YOOKASSA_SECRET_KEY` (подпись) и `YOOKASSA_WEBHOOK_TOKEN` (если используется).
4. Проверить, что прокси корректно передаёт `x-forwarded-for`/`x-real-ip` для allowlist проверки.
5. Для `QUEUE_ENQUEUE_FAILED` проверить Redis/queue по runbook `redis-down.md` и `queue-backlog-worker-lag.md`.
6. Для processor failures проверить dead jobs и логи воркера вокруг `processYookassaWebhookPayload`.

## Временная mitigation

1. До фикса причины не запускать массовый replay dead webhook jobs.
2. После фикса запускать replay батчами через `PATCH /api/admin/queue/{index}` и контролировать `pending/dead`.
3. Если storm вызван 401/403 на ingress, приоритетно исправить валидацию входящего webhook, а не воркер.

## Как понять, что инцидент устранён

- `data.surfaces.webhook.lastOutcome = "success"` и обновляется `lastSuccessAt`.
- `failureCount/deniedCount` перестают быстро расти.
- `queue.dead` не растёт, `queue.pending` снижается.
- `data.queueWorker.overloaded = false`.

## Что проверить после восстановления

1. Что replay-нутые webhook jobs корректно уходят из dead queue.
2. Что новые webhook запросы не возвращают 401/403/503.
3. Что биллинговые side effects снова проходят без накопления новых dead jobs.

## Пометка на будущее

- Для точного детекта storm полезен отдельный rate-сигнал по `yookassa-ingress` deny/failure в окне 5 минут.

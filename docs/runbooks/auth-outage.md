# Runbook: Auth Outage / Mass Login-Refresh Failures

## Симптомы

- Массовые жалобы на login/refresh.
- Рост `data.surfaces.auth.failureCount` и/или `deniedCount`.
- `POST /api/auth/refresh` часто даёт `401` или `5xx`.
- OTP-поток деградирует (например, частые rate-limit ошибки при нестабильном Redis).

## Где проверять

- `GET /api/health/status`:
- `data.surfaces.auth.{lastOutcome,lastOperation,lastCode,failureCount,deniedCount,successCount}`
- `data.readiness.{db,redis,ready}`
- `GET /api/health` (DB + Redis базовая готовность).
- `POST /api/auth/refresh` (контрольный запрос авторизованной сессией).

## Как интерпретировать сигнал

- `lastCode = "NO_REFRESH_TOKEN"` или `"INVALID_REFRESH_TOKEN"` -> чаще cookie/session проблема на клиенте или несовместимость токенов.
- `data.readiness.db = false` -> вероятная backend-причина auth outage (сессии хранятся в БД).
- `data.readiness.redis = false` -> могут деградировать OTP rate-limit проверки и связанные login-сценарии.
- `lastCode = "SERVICE_UNAVAILABLE"` в `telegram-login` -> не сконфигурирован `TELEGRAM_BOT_TOKEN`.

## Первичные действия

1. Сначала проверить `db/redis` readiness через `/api/health/status`.
2. При проблеме с DB восстановить доступность БД и повторно проверить refresh flow.
3. При проблеме с Redis оценить влияние на OTP/login и перейти к runbook `redis-down.md`.
4. Проверить единообразие auth-конфига между инстансами приложения (cookie/session env).
5. Для волны невалидных refresh-сессий использовать controlled relogin (через `/logout` и повторный login).

## Временная mitigation

1. При частичных сбоях refresh ограничить автоматические массовые retry на клиентском/edge уровне.
2. Команде поддержки дать шаблон: logout -> login как обходной путь для битых refresh-токенов.
3. Не выполнять массовые изменения auth-конфига без проверки `/api/health/status` после каждого шага.

## Как понять, что инцидент устранён

- `data.readiness.db = true` (и при необходимости `redis = true`).
- `POST /api/auth/refresh` стабильно возвращает успешный ответ для валидной сессии.
- `data.surfaces.auth.lastOutcome` обновляется как `success` (`session-issue`/`refresh-rotate`).
- Рост `failureCount/deniedCount` замедлился до штатного уровня.

## Что проверить после восстановления

1. Login path: OTP verify + refresh работают в контрольном сценарии.
2. Нет новой волны `INVALID_REFRESH_TOKEN` после стабилизации.
3. Смежные поверхности (`bookings`, `notifications`) не показывают массовые `failure` из-за auth side effects.

## Пометка на будущее

- В auth outage триаже может не хватать отдельного агрегата по OTP request/verify ответам; при необходимости добавить его в status surface.

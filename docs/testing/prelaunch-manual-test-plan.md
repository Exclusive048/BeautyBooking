# Prelaunch Manual Test Plan (Pre-Production)

## 1. Overview

Scope:
- Manual system testing before production deploy for BeautyHub / МастерРядом.
- Backend scope: Next.js API routes, worker, Redis queue, Prisma, observability surfaces.
- Only real flows/endpoints from current codebase are included.

Out of scope:
- New feature implementation.
- Schema/code changes.
- Synthetic endpoints that do not exist in repository.

Primary references in code:
- `src/app/api/auth/*`, `src/app/logout/route.ts`
- `src/app/api/bookings/*`
- `src/app/api/media/file/[id]/route.ts`, `src/lib/media/private-delivery.ts`
- `src/app/api/payments/yookassa/webhook/route.ts`, `src/lib/payments/yookassa/webhook-processor.ts`
- `src/lib/queue/queue.ts`, `src/worker.ts`, `src/app/api/admin/queue*`
- `src/app/api/notifications/stream/route.ts`, `src/lib/notifications/notifier.ts`
- `src/app/api/health*`, `src/lib/monitoring/status.ts`
- `src/lib/rate-limit/*`, `src/proxy.ts`
- `src/app/api/me/delete/route.ts`, `src/app/api/cabinet/master/delete/route.ts`, `src/app/api/cabinet/studio/delete/route.ts`

## 2. Environment preparation

- Deploy web + worker from the same release candidate commit.
- Use pre-production environment with production-like config (Redis, DB, worker, web).
- Prepare credentials:
  - Client user (phone for OTP), Master owner user, Studio owner user, Admin user.
- Prepare secrets/config:
  - `WORKER_SECRET`, `AUTH_JWT_SECRET`, `MEDIA_DELIVERY_SECRET`, `REDIS_URL`.
  - YooKassa webhook secrets (`YOOKASSA_SECRET_KEY`, optional `YOOKASSA_WEBHOOK_TOKEN`) and allowlist metadata in `src/lib/payments/yookassa/allowlist.ts`.
- Verify baseline before tests:
  - `GET /api/health` -> `200 { ok: true }`
  - `GET /api/health/worker` -> `alive=true`
  - `GET /api/health/status` (admin session or header `x-worker-secret`) -> readiness fields available
- Required tools:
  - Browser (cookies/session flows), HTTP client (curl/Postman), access to logs, and queue admin API.
  - Optional for deep queue/degradation drills: Redis CLI or platform Redis console.

## 3. Test data requirements

- Accounts:
  - Client account with valid phone for OTP.
  - Master owner account with existing cabinet/provider.
  - Studio owner account with existing studio/provider.
  - Admin account for `/api/admin/queue` and `/api/health/status`.
- Booking fixtures:
  - At least one provider/service with open slot for creation tests.
  - At least one booking that can be canceled/rescheduled/confirmed.
- Media fixtures:
  - Private media asset attached to an entity requiring access check.
  - Public media asset (`PORTFOLIO` or `AVATAR`, `MASTER|STUDIO|SITE`) for redirect check.
- Payment fixtures:
  - YooKassa test webhook payloads: valid signed, invalid signature, duplicate event.
- Queue fixtures:
  - Access to `/api/admin/queue` and `/api/admin/queue/{index}`.

## 4. Domain test scenarios

### 4.1 Auth lifecycle

#### AUTH-01 OTP request success
- Endpoint / Flow: `POST /api/auth/otp/request`
- Preconditions: Valid phone input.
- Steps:
1. Send request with valid phone.
- Expected result:
1. `200` with `{ ok: true }` contract.
2. OTP record is created.
- Failure signals:
1. `400 VALIDATION_ERROR` for valid payload.
2. `503 RATE_LIMIT_UNAVAILABLE`.

#### AUTH-02 OTP verify success
- Endpoint / Flow: `POST /api/auth/otp/verify`
- Preconditions: Fresh OTP exists for phone.
- Steps:
1. Send phone+correct OTP.
- Expected result:
1. `200` response with `redirect`.
2. Access and refresh cookies are set.
3. Auth surface success signals appear (session issue / login path).
- Failure signals:
1. `401 CODE_NOT_FOUND` for valid non-expired OTP.
2. No cookies set.

#### AUTH-03 Invalid OTP
- Endpoint / Flow: `POST /api/auth/otp/verify`
- Preconditions: Valid phone.
- Steps:
1. Submit incorrect OTP.
- Expected result:
1. `401 CODE_NOT_FOUND`.
2. After repeated failures lock may trigger.
- Failure signals:
1. Unexpected success with wrong OTP.

#### AUTH-04 Expired OTP
- Endpoint / Flow: `POST /api/auth/otp/verify`
- Preconditions: OTP older than 5 minutes.
- Steps:
1. Submit expired OTP.
- Expected result:
1. `401 CODE_NOT_FOUND`.
- Failure signals:
1. Expired code accepted.

#### AUTH-05 OTP verify lock after repeated failures
- Endpoint / Flow: `POST /api/auth/otp/verify`
- Preconditions: Same phone.
- Steps:
1. Submit wrong OTP repeatedly until lock threshold.
- Expected result:
1. `429` with `OTP_LOCKED` and `Retry-After`.
- Failure signals:
1. Unlimited retries without lock.

#### AUTH-06 Refresh rotation success
- Endpoint / Flow: `POST /api/auth/refresh`
- Preconditions: Valid refresh cookie.
- Steps:
1. Call refresh endpoint once.
- Expected result:
1. `200 { ok: true }`.
2. New access+refresh cookies issued.
- Failure signals:
1. `401 UNAUTHORIZED` with valid active refresh.

#### AUTH-07 Refresh reuse attempt
- Endpoint / Flow: `POST /api/auth/refresh`
- Preconditions: Capture old refresh token, then rotate once.
- Steps:
1. Re-send request using old refresh token value.
- Expected result:
1. `401 UNAUTHORIZED` (invalid/used token path), cookies cleared.
- Failure signals:
1. Reused refresh token still accepted.

#### AUTH-08 Logout + refresh after logout
- Endpoint / Flow: `GET /logout` (or `POST /logout`), then `POST /api/auth/refresh`
- Preconditions: Active session.
- Steps:
1. Execute logout.
2. Call refresh endpoint.
- Expected result:
1. Logout clears cookies and revokes refresh chain.
2. Refresh after logout returns `401`.
- Failure signals:
1. Refresh still succeeds after logout.

### 4.2 Booking lifecycle

#### BOOK-01 Create booking success
- Endpoint / Flow: `POST /api/bookings`
- Preconditions: Authenticated client, valid provider/service/slot.
- Steps:
1. Send valid booking payload.
- Expected result:
1. `201` with booking DTO.
2. `data.surfaces.bookings` success (`operation=create-booking`).
- Failure signals:
1. `500` or no booking created for valid request.

#### BOOK-02 Create booking validation failure
- Endpoint / Flow: `POST /api/bookings`
- Preconditions: Authenticated client.
- Steps:
1. Send invalid payload (e.g., missing `providerId`, bad dates).
- Expected result:
1. `400 VALIDATION_ERROR`.
- Failure signals:
1. Invalid payload accepted.

#### BOOK-03 Double booking prevention
- Endpoint / Flow: `POST /api/bookings` (same slot concurrently)
- Preconditions: Same service/slot available once.
- Steps:
1. Send two create requests concurrently for same slot.
- Expected result:
1. One request succeeds.
2. Second fails with `409 BOOKING_CONFLICT` (or idempotency duplicate error if same idempotency key).
- Failure signals:
1. Two active bookings for same slot.

#### BOOK-04 Cancel booking
- Endpoint / Flow: `POST /api/bookings/{id}/cancel`
- Preconditions: Booking belongs to actor with cancel access.
- Steps:
1. Cancel booking with optional reason.
- Expected result:
1. `200` with updated booking state.
- Failure signals:
1. `403 FORBIDDEN` for rightful owner.
2. Booking remains active.

#### BOOK-05 Reschedule booking
- Endpoint / Flow: `POST /api/bookings/{id}/reschedule`
- Preconditions: Booking can be rescheduled.
- Steps:
1. Submit new `startAtUtc/endAtUtc/slotLabel`.
- Expected result:
1. `200` with updated/proposed booking.
- Failure signals:
1. `409` for valid free target slot.
2. Booking unchanged without error.

#### BOOK-06 Confirm booking
- Endpoint / Flow: `POST /api/bookings/{id}/confirm`
- Preconditions: Booking in confirmable state, actor has rights.
- Steps:
1. Confirm booking.
- Expected result:
1. `200`, booking status confirmed.
- Failure signals:
1. `403 FORBIDDEN` for rightful actor.
2. Invalid transition accepted.

### 4.3 Media access

#### MEDIA-01 Valid private media token
- Endpoint / Flow: `GET /api/media/file/{id}?mt=...`
- Preconditions: Valid token generated for same asset.
- Steps:
1. Request media with valid token.
- Expected result:
1. `200`, media stream returned, `Cache-Control: private, no-store`.
- Failure signals:
1. `401` for valid token.

#### MEDIA-02 Expired token
- Endpoint / Flow: `GET /api/media/file/{id}?mt=...`
- Preconditions: Token past expiry.
- Steps:
1. Request with expired token.
- Expected result:
1. `401 UNAUTHORIZED`.
2. Media surface denied signal (`INVALID_PRIVATE_MEDIA_TOKEN`).
- Failure signals:
1. Expired token accepted.

#### MEDIA-03 Invalid signature token
- Endpoint / Flow: `GET /api/media/file/{id}?mt=...`
- Preconditions: Tampered token.
- Steps:
1. Modify token payload/signature.
- Expected result:
1. `401 UNAUTHORIZED`.
- Failure signals:
1. Tampered token accepted.

#### MEDIA-04 Access without token
- Endpoint / Flow: `GET /api/media/file/{id}`
- Preconditions: Private asset.
- Steps:
1. Call endpoint without `mt` and without session.
2. Repeat with authorized session.
- Expected result:
1. Without session: `401/403`.
2. With proper session ownership/access: `200`.
- Failure signals:
1. Unauthenticated private access succeeds.

#### MEDIA-05 Access unrelated asset by token
- Endpoint / Flow: `GET /api/media/file/{otherId}?mt=<token-for-asset-A>`
- Preconditions: Token for one asset.
- Steps:
1. Use token with different asset id.
- Expected result:
1. `401 UNAUTHORIZED`.
- Failure signals:
1. Cross-asset token reuse succeeds.

### 4.4 Payments / webhook

#### PAY-01 Valid webhook event ingress
- Endpoint / Flow: `POST /api/payments/yookassa/webhook`
- Preconditions: Correct signature, allowed source IP, valid optional bearer token.
- Steps:
1. Send valid signed test payload.
- Expected result:
1. `200 { ok: true }`.
2. Queue gets `yookassa.webhook` job.
3. `surfaces.webhook` success on ingress.
- Failure signals:
1. Valid event returns `401/403/503`.

#### PAY-02 Invalid signature rejected
- Endpoint / Flow: `POST /api/payments/yookassa/webhook`
- Preconditions: Any payload.
- Steps:
1. Send payload with bad/missing `x-api-signature-sha256`.
- Expected result:
1. `401 UNAUTHORIZED`.
2. `surfaces.webhook.lastCode = INVALID_SIGNATURE`.
- Failure signals:
1. Invalid signature accepted.

#### PAY-03 Invalid IP allowlist rejected
- Endpoint / Flow: `POST /api/payments/yookassa/webhook`
- Preconditions: Valid signature but non-allowlisted `x-forwarded-for`.
- Steps:
1. Send request from non-allowlisted IP header.
- Expected result:
1. `403 FORBIDDEN`.
2. `surfaces.webhook.lastCode = IP_NOT_ALLOWED`.
- Failure signals:
1. Non-allowlisted IP accepted.

#### PAY-04 Duplicate webhook event idempotency
- Endpoint / Flow: Same payload twice.
- Preconditions: Existing payment/internal mapping.
- Steps:
1. Send same valid event twice.
- Expected result:
1. Ingress accepts both (`200`) but processor does not create inconsistent duplicates.
2. Billing/subscription state remains consistent.
- Failure signals:
1. Double side effects (duplicate transitions/notifications beyond intended idempotent behavior).

#### PAY-05 Worker processing of webhook job
- Endpoint / Flow: ingress + worker processor
- Preconditions: Worker alive.
- Steps:
1. Send valid webhook.
2. Observe queue and status until processed.
- Expected result:
1. Pending queue drains.
2. `surfaces.webhook` includes `operation=yookassa-worker-processor` success.
- Failure signals:
1. Persistent queue growth/dead job accumulation.

### 4.5 Queue / worker

#### QUEUE-01 Normal job execution
- Endpoint / Flow: webhook enqueue + worker dequeue/process/ack
- Preconditions: Worker running, Redis healthy.
- Steps:
1. Enqueue via valid webhook.
2. Observe `/api/health/worker` queue stats.
- Expected result:
1. `pending` increases then decreases.
2. `processing/dead` remain controlled.
- Failure signals:
1. Jobs stay in `processing` or move to `dead` unexpectedly.

#### QUEUE-02 Retry path on transient failure
- Endpoint / Flow: worker retry scheduling
- Preconditions: Ability to induce temporary processor failure (e.g., brief DB outage in preprod).
- Steps:
1. Induce transient failure.
2. Send webhook.
3. Restore dependency.
- Expected result:
1. Job retries with delay and eventually succeeds.
2. No silent loss.
- Failure signals:
1. Job disappears without success/dead entry.

#### QUEUE-03 Dead-letter path
- Endpoint / Flow: worker max-attempt failure -> dead queue
- Preconditions: Persistent processor failure for same job.
- Steps:
1. Keep failing condition across retry attempts.
2. Observe `/api/admin/queue` deadJobs.
- Expected result:
1. Job appears in dead queue.
2. Can be replayed via `PATCH /api/admin/queue/{index}`.
- Failure signals:
1. Job neither succeeds nor appears in dead queue.

#### QUEUE-04 Stuck job recovery
- Endpoint / Flow: `recoverStuckJobs` in worker/queue
- Preconditions: Ability to create stale processing job (Redis CLI/platform Redis UI).
- Steps:
1. Insert/simulate job in processing with stale `_processingStartedAt`.
2. Wait recovery cycle or restart worker.
- Expected result:
1. Job is recovered to pending or moved to dead after recovery attempt cap.
- Failure signals:
1. Stuck job remains indefinitely in processing.

#### QUEUE-05 Queue backlog handling
- Endpoint / Flow: `/api/health/worker`, `/api/health/status`, `/api/admin/queue`
- Preconditions: Worker paused or high ingress load.
- Steps:
1. Pause worker or send burst of enqueue-producing events.
2. Resume worker.
- Expected result:
1. Backlog observable in stats.
2. After resume backlog drains and dead does not spike uncontrollably.
- Failure signals:
1. Backlog does not recover.

### 4.6 Notifications

#### NOTIF-01 Notification creation via business action
- Endpoint / Flow: booking/payment action -> notification delivery path
- Preconditions: User subscribed in notification domain.
- Steps:
1. Trigger action that emits notification (e.g., booking creation/reschedule/payment update).
- Expected result:
1. Notification record created and publish path executed.
- Failure signals:
1. No notification record/event for action that should notify.

#### NOTIF-02 SSE stream delivery
- Endpoint / Flow: `GET /api/notifications/stream`
- Preconditions: Authenticated user session.
- Steps:
1. Open stream.
2. Trigger notification-producing action.
- Expected result:
1. Response `text/event-stream`.
2. Event received in open stream.
- Failure signals:
1. Stream closes immediately or no event delivered.

#### NOTIF-03 Stream reconnect with replay
- Endpoint / Flow: `GET /api/notifications/stream` + `Last-Event-ID`
- Preconditions: Existing recent events.
- Steps:
1. Disconnect stream.
2. Reconnect with `Last-Event-ID`.
- Expected result:
1. Missed events replayed (within replay window/limit).
- Failure signals:
1. Recent missed events not replayed.

#### NOTIF-04 Invalid auth stream denied
- Endpoint / Flow: `GET /api/notifications/stream`
- Preconditions: No session.
- Steps:
1. Call endpoint unauthenticated.
- Expected result:
1. `401 UNAUTHORIZED`.
2. Notifications surface denied (`UNAUTHORIZED`).
- Failure signals:
1. Unauthorized stream connection succeeds.

### 4.7 Rate limiting

#### RL-01 Public API rate limit
- Endpoint / Flow: proxy `publicApi` tier (`src/proxy.ts`)
- Preconditions: Same client IP.
- Steps:
1. Send >120 requests/min to a public API path (e.g., `GET /api/health`).
- Expected result:
1. `429` with `Retry-After` once threshold exceeded.
- Failure signals:
1. Unlimited requests without throttling.

#### RL-02 Sensitive route rate limit
- Endpoint / Flow: proxy `bookingCreate` tier + route checks for booking create
- Preconditions: Authenticated client.
- Steps:
1. Send burst to `POST /api/bookings`.
- Expected result:
1. Throttling activates (`429`) at configured threshold.
- Failure signals:
1. Sensitive mutation route remains unthrottled.

#### RL-03 Destructive endpoint rate limit
- Endpoint / Flow: `DELETE /api/me/delete`, `DELETE /api/cabinet/master/delete`, `DELETE /api/cabinet/studio/delete`
- Preconditions: Authenticated user with corresponding cabinet.
- Steps:
1. Trigger first delete request (or dry-run until business guard).
2. Immediately repeat.
- Expected result:
1. Second request hits rate limit (`429 RATE_LIMITED`).
- Failure signals:
1. Destructive endpoints allow repeated rapid attempts.

#### RL-04 Redis unavailable behavior
- Endpoint / Flow: `checkRateLimit` degraded path
- Preconditions: Preprod Redis disabled/unreachable.
- Steps:
1. Call sensitive endpoint and public endpoint under outage.
- Expected result:
1. Sensitive paths fail closed (`429` with retry hint).
2. Public paths use bounded fallback, not unlimited bypass.
- Failure signals:
1. Sensitive paths become effectively unprotected.

### 4.8 Health / observability

#### OBS-01 API health readiness
- Endpoint / Flow: `GET /api/health`
- Preconditions: DB+Redis reachable.
- Steps:
1. Call endpoint.
- Expected result:
1. `200 { ok: true }`.
- Failure signals:
1. `503` with healthy DB/Redis.

#### OBS-02 Worker health
- Endpoint / Flow: `GET /api/health/worker`
- Preconditions: Worker running and pinging.
- Steps:
1. Call endpoint.
- Expected result:
1. `alive=true`, queue stats returned.
- Failure signals:
1. `alive=false` while worker is running.

#### OBS-03 Aggregated status surface
- Endpoint / Flow: `GET /api/health/status`
- Preconditions: Admin session or `x-worker-secret` header.
- Steps:
1. Call endpoint with proper auth.
- Expected result:
1. Structured payload with `readiness`, `queueWorker`, `notifier`, `surfaces`.
- Failure signals:
1. Missing/invalid structure.
2. Unauthorized with valid credentials.

#### OBS-04 Status under Redis unavailable
- Endpoint / Flow: `GET /api/health/status`
- Preconditions: Redis outage simulation.
- Steps:
1. Disable Redis.
2. Call status endpoint.
- Expected result:
1. `readiness.redis=false`.
2. Surface store may move to `none`/degraded marker behavior for production path.
- Failure signals:
1. Status falsely reports healthy Redis.

#### OBS-05 Status under queue backlog
- Endpoint / Flow: `GET /api/health/status`, `GET /api/health/worker`
- Preconditions: Queue pressure.
- Steps:
1. Create backlog.
2. Observe fields.
- Expected result:
1. Queue stats reflect backlog.
2. `overloaded` flips when thresholds exceeded.
- Failure signals:
1. Backlog not visible in status surfaces.

### 4.9 Security / destructive flows

#### SEC-01 Delete account happy path
- Endpoint / Flow: `DELETE /api/me/delete`
- Preconditions: Authenticated user, no active bookings blockers.
- Steps:
1. Delete account.
- Expected result:
1. `200 { deleted: true }`, access cookie cleared.
2. User marked deleted/personal fields anonymized.
- Failure signals:
1. Account remains active after successful response.

#### SEC-02 Delete account blocked by active bookings
- Endpoint / Flow: `DELETE /api/me/delete`
- Preconditions: User has active bookings (`NEW|PENDING|CONFIRMED|IN_PROGRESS`).
- Steps:
1. Call delete endpoint.
- Expected result:
1. `409 ACTIVE_BOOKINGS`.
- Failure signals:
1. Deletion succeeds despite active bookings.

#### SEC-03 Delete master cabinet ownership/guard
- Endpoint / Flow: `DELETE /api/cabinet/master/delete`
- Preconditions: Non-owner user and owner user test accounts.
- Steps:
1. Attempt with non-owner.
2. Attempt with owner.
- Expected result:
1. Non-owner denied (`401/403/404` depending on existence/auth).
2. Owner follows business rules (`200` or `409 ACTIVE_BOOKINGS`).
- Failure signals:
1. Unauthorized user can delete master cabinet.

#### SEC-04 Delete studio cabinet ownership/guard
- Endpoint / Flow: `DELETE /api/cabinet/studio/delete`
- Preconditions: Non-owner and owner accounts.
- Steps:
1. Attempt with non-owner.
2. Attempt with owner.
- Expected result:
1. Non-owner denied.
2. Owner path follows guards (`200` or `409 ACTIVE_BOOKINGS`).
- Failure signals:
1. Unauthorized user can delete studio cabinet.

## 5. Degradation tests

### DEG-01 Redis unavailable
- Endpoint / Flow: `/api/health`, `/api/health/worker`, `/api/health/status`, sensitive routes
- Preconditions: Controlled Redis outage in preprod.
- Steps:
1. Disable Redis.
2. Call health/status and selected sensitive/public endpoints.
- Expected result:
1. Health reflects degradation (`/api/health` -> `503`, status readiness redis false).
2. Sensitive rate-limited paths fail closed.
3. Webhook enqueue may return `503 SERVICE_UNAVAILABLE` with surface failure code.
- Failure signals:
1. Silent success with hidden degradation.

### DEG-02 Redis slow responses / command timeout
- Endpoint / Flow: Redis command timeout guard paths
- Preconditions: Ability to simulate latency (network shaping or temporary low `REDIS_COMMAND_TIMEOUT_MS` in preprod instance).
- Steps:
1. Introduce Redis latency beyond timeout.
2. Run webhook/queue/rate-limit/status requests.
- Expected result:
1. Controlled failures/timeouts, no unbounded hangs.
- Failure signals:
1. Requests/worker loop hang indefinitely.

### DEG-03 Worker restart semantics
- Endpoint / Flow: worker process lifecycle + `/api/health/worker`
- Preconditions: Worker running.
- Steps:
1. Restart worker.
2. Observe ping recovery and queue processing continuity.
- Expected result:
1. Worker returns to `alive=true`.
2. Stuck-job recovery logic runs without job loss.
- Failure signals:
1. Worker stays unhealthy post-restart.

### DEG-04 Queue backlog drill
- Endpoint / Flow: enqueue burst + worker pause/resume
- Preconditions: Ability to pause worker.
- Steps:
1. Pause worker and enqueue burst.
2. Resume worker and monitor drain.
- Expected result:
1. Backlog visible then drained.
2. Dead queue remains controlled.
- Failure signals:
1. Backlog persists without recovery.

### DEG-05 Alert cooldown degraded fallback
- Endpoint / Flow: monitoring alerts shared cooldown fallback (`src/lib/monitoring/alerts.ts`)
- Preconditions: Production-like run, Redis outage, repeated same alert key trigger.
- Steps:
1. Trigger repeated identical alert condition during Redis outage.
2. Inspect logs/alert channel frequency.
- Expected result:
1. Log includes degraded cooldown message.
2. Local protective cooldown prevents uncontrolled alert storm.
- Failure signals:
1. Alert burst/storm for same key under outage.

## 6. Final production smoke test

Run in order:
1. Auth login + refresh rotation:
- `POST /api/auth/otp/request` -> `POST /api/auth/otp/verify` -> `POST /api/auth/refresh`
2. Booking create:
- `POST /api/bookings` (valid payload)
3. Media access:
- `GET /api/media/file/{id}?mt=...` (valid token)
4. Webhook test:
- `POST /api/payments/yookassa/webhook` valid signed payload
5. Worker execution:
- Confirm queue drains and webhook processor success in status surface
6. Health endpoints:
- `GET /api/health`, `GET /api/health/worker`, `GET /api/health/status`

Smoke pass criteria:
- All six steps succeed without critical (5xx, auth bypass, data loss symptoms, dead queue growth spike).

## 7. Go/No-Go criteria

GO if all conditions are true:
- No critical auth/session failures (rotation/revoke paths pass).
- Booking lifecycle core scenarios pass (create/validation/cancel/reschedule/conflict guard).
- Private media token access control works (valid pass, invalid denied).
- YooKassa ingress checks are strict and valid path is accepted.
- Queue/worker show no job loss behavior; dead-letter/retry paths are observable and operable.
- Notifications stream works with auth and replay behavior.
- Rate limiting enforced for public/sensitive/destructive paths.
- Health/observability surfaces consistently reflect real runtime state.
- Degradation drills produce controlled, predictable behavior.

NO-GO if any of these occur:
- Auth bypass or refresh reuse vulnerability.
- Booking conflict guard failure causing double-booking.
- Private media unauthorized access.
- Webhook security checks bypassed (signature/IP/token).
- Queue silent job loss or uncontrolled dead queue growth.
- Sensitive rate-limit fail-open under Redis outage.
- Health/status surfaces misleading or unavailable in preprod run.
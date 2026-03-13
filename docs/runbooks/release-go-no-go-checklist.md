# Production Release GO / NO-GO Checklist (PRE-01)

Scope: prelaunch operations checklist for BeautyHub / МастерРядом before production deploy.

Rules:
- Do not put secrets/tokens in this document.
- Run checks against production-like environment before final production rollout.
- If any NO-GO condition is true, release is blocked until resolved.

## 1) Infrastructure readiness

Check:
- Web app and worker are deployed from the same release candidate.

How to verify:
- Verify deployment metadata/version for web and worker.

Where to verify:
- Deployment system + runtime version info used by your platform.

GO condition:
- Web and worker run the same release version.

NO-GO condition:
- Version mismatch between web and worker.

Check:
- Public app URL for worker health ping is configured.

How to verify:
- Confirm `NEXT_PUBLIC_APP_URL` or `APP_PUBLIC_URL` is set to deployed app URL.

Where to verify:
- Environment config, [src/worker.ts](/d:/BeautyBooking/beautyhub/src/worker.ts).

GO condition:
- Worker ping reaches `/api/health/worker` and `lastPingAgo` updates.

NO-GO condition:
- URL is missing/incorrect and worker pings default local URL.

## 2) Security & secrets

Check:
- Required production secrets are present.

How to verify:
- Validate production env set includes required values.

Where to verify:
- Env config, [src/lib/env.ts](/d:/BeautyBooking/beautyhub/src/lib/env.ts), [.env.example](/d:/BeautyBooking/beautyhub/.env.example).

GO condition:
- Required vars are set and app startup env validation passes.

NO-GO condition:
- Missing required vars (`DATABASE_URL`, `AUTH_JWT_SECRET`, `OTP_HMAC_SECRET`, `REDIS_URL`, `WORKER_SECRET`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_SHOP_ID`, push/yandex keys).

Check:
- Media private delivery secret exists in production.

How to verify:
- Confirm `MEDIA_DELIVERY_SECRET` is set.

Where to verify:
- Env config, [src/lib/media/private-delivery.ts](/d:/BeautyBooking/beautyhub/src/lib/media/private-delivery.ts).

GO condition:
- Private media token generation/validation works in production.

NO-GO condition:
- `MEDIA_DELIVERY_SECRET` missing in production.

## 3) Database readiness

Check:
- Prisma schema is valid.

How to verify:
- Run `npx prisma validate`.

Where to verify:
- CI/local terminal.

GO condition:
- Command exits successfully.

NO-GO condition:
- Validation errors.

Check:
- Migration state is healthy.

How to verify:
- Run `npx prisma migrate status` against production DB.

Where to verify:
- CI release job or operator terminal with production DB access.

GO condition:
- No pending/failed migration state.

NO-GO condition:
- Drift, failed migrations, or unapplied required migrations.

Check:
- DB readiness surface is green.

How to verify:
- Query `/api/health/status` (authorized) and inspect `data.readiness.db`.

Where to verify:
- [src/app/api/health/status/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/status/route.ts).

GO condition:
- `data.readiness.db = true`.

NO-GO condition:
- `data.readiness.db = false`.

## 4) Redis / queue readiness

Check:
- Redis is reachable by application.

How to verify:
- Call `/api/health`.

Where to verify:
- [src/app/api/health/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/route.ts).

GO condition:
- `200` with `{ "ok": true }`.

NO-GO condition:
- `503` or `{ "ok": false }`.

Check:
- Queue depth/dead queue is under control.

How to verify:
- Query `/api/health/worker`, `/api/health/status`, and `/api/admin/queue` (admin).

Where to verify:
- [src/app/api/health/worker/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/worker/route.ts), [src/app/api/health/status/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/status/route.ts), [src/app/api/admin/queue/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/admin/queue/route.ts).

GO condition:
- `queue.pending`, `queue.processing`, `queue.dead` are stable and not growing unexpectedly.

NO-GO condition:
- Dead queue growth trend or sustained backlog without recovery plan.

## 5) Worker readiness

Check:
- Worker heartbeat is fresh.

How to verify:
- Call `/api/health/worker`.

Where to verify:
- [src/app/api/health/worker/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/worker/route.ts).

GO condition:
- `alive = true`, `lastPingAgo` small, endpoint `200`.

NO-GO condition:
- `alive = false` or endpoint `503`.

Check:
- Worker readiness in aggregated status.

How to verify:
- Query `/api/health/status` and inspect `data.readiness.worker` and `data.queueWorker.overloaded`.

Where to verify:
- [src/app/api/health/status/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/status/route.ts).

GO condition:
- `data.readiness.worker = true` and `data.queueWorker.overloaded = false`.

NO-GO condition:
- Worker not ready or queue overloaded.

## 6) Auth system readiness

Check:
- Login flow works.

How to verify:
- Complete normal login flow (`/api/auth/otp/verify` or configured social login path).

Where to verify:
- [src/app/api/auth/otp/verify/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/auth/otp/verify/route.ts).

GO condition:
- Login succeeds and session cookie is issued.

NO-GO condition:
- Consistent login failures for valid test user flow.

Check:
- Refresh rotation works.

How to verify:
- Call `POST /api/auth/refresh` with valid session.

Where to verify:
- [src/app/api/auth/refresh/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/auth/refresh/route.ts).

GO condition:
- Successful response and no auth failure spike in `data.surfaces.auth`.

NO-GO condition:
- Frequent `NO_REFRESH_TOKEN` / `INVALID_REFRESH_TOKEN` for valid sessions.

Check:
- Logout revokes/clears session.

How to verify:
- Execute `/logout` (GET or POST), then verify protected API access is denied.

Where to verify:
- [src/app/logout/route.ts](/d:/BeautyBooking/beautyhub/src/app/logout/route.ts).

GO condition:
- Session is cleared and revoked as expected.

NO-GO condition:
- Session remains active after logout.

## 7) Payments / webhook readiness

Check:
- Webhook endpoint is reachable and validation logic behaves correctly.

How to verify:
- Send test webhook to `POST /api/payments/yookassa/webhook`.

Where to verify:
- [src/app/api/payments/yookassa/webhook/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/payments/yookassa/webhook/route.ts).

GO condition:
- Valid signed test event is accepted (`200`, `{ ok: true }`) and queued.

NO-GO condition:
- Valid test event fails (401/403/503) due to misconfiguration.

Check:
- Worker processes webhook jobs.

How to verify:
- Inspect `/api/admin/queue` and `/api/health/status` (`surfaces.webhook`, queue stats) after test event.

Where to verify:
- [src/worker.ts](/d:/BeautyBooking/beautyhub/src/worker.ts), [src/app/api/admin/queue/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/admin/queue/route.ts), [src/app/api/health/status/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/status/route.ts).

GO condition:
- No webhook dead-job growth, webhook surface moves to `success`.

NO-GO condition:
- Webhook jobs accumulate in dead queue or repeated webhook failures.

## 8) Media delivery readiness

Check:
- Protected media delivery with private token works.

How to verify:
- Obtain a tokenized media URL (contains `?mt=`) from a protected flow and request it.

Where to verify:
- [src/lib/media/private-delivery.ts](/d:/BeautyBooking/beautyhub/src/lib/media/private-delivery.ts), [src/app/api/media/file/[id]/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/media/file/[id]/route.ts), [src/app/api/master/model-offers/[offerId]/applications/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/master/model-offers/[offerId]/applications/route.ts).

GO condition:
- Valid token URL returns media (`200`) and invalid token is rejected (`401`).

NO-GO condition:
- Valid token rejected or invalid token accepted.

## 9) Notifications readiness

Check:
- Notifier runtime is ready.

How to verify:
- Query `/api/health/status` and inspect `data.notifier`.

Where to verify:
- [src/lib/notifications/notifier.ts](/d:/BeautyBooking/beautyhub/src/lib/notifications/notifier.ts), [src/app/api/health/status/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/status/route.ts).

GO condition:
- In production: `mode = "redis"`, `ready = true`.

NO-GO condition:
- `ready = false` or `mode = "unavailable"`.

Check:
- Notification stream endpoint works for authorized user.

How to verify:
- Open `GET /api/notifications/stream` with valid session.

Where to verify:
- [src/app/api/notifications/stream/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/notifications/stream/route.ts).

GO condition:
- Response is `text/event-stream` and connection stays alive.

NO-GO condition:
- Repeated `503` / `NOTIFIER_UNAVAILABLE`.

## 10) Monitoring / observability readiness

Check:
- Health surfaces are available and consistent.

How to verify:
- Query `/api/health`, `/api/health/worker`, `/api/health/status`.

Where to verify:
- [src/app/api/health/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/route.ts), [src/app/api/health/worker/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/worker/route.ts), [src/app/api/health/status/route.ts](/d:/BeautyBooking/beautyhub/src/app/api/health/status/route.ts).

GO condition:
- Readiness and queue/notifier/surface fields reflect current state and are queryable.

NO-GO condition:
- Status surfaces unavailable or contradictory to runtime state.

Check:
- Incident docs are ready for on-call.

How to verify:
- Ensure runbooks are present and reviewed.

Where to verify:
- [docs/runbooks/README.md](/d:/BeautyBooking/beautyhub/docs/runbooks/README.md), [docs/runbooks/redis-down.md](/d:/BeautyBooking/beautyhub/docs/runbooks/redis-down.md), [docs/runbooks/queue-backlog-worker-lag.md](/d:/BeautyBooking/beautyhub/docs/runbooks/queue-backlog-worker-lag.md), [docs/runbooks/yookassa-webhook-retry-storm.md](/d:/BeautyBooking/beautyhub/docs/runbooks/yookassa-webhook-retry-storm.md), [docs/runbooks/auth-outage.md](/d:/BeautyBooking/beautyhub/docs/runbooks/auth-outage.md), [docs/runbooks/incident-drill-checklist.md](/d:/BeautyBooking/beautyhub/docs/runbooks/incident-drill-checklist.md).

GO condition:
- On-call has current runbooks and drill checklist.

NO-GO condition:
- Missing or outdated runbooks.

## 11) CI / quality gates readiness

Check:
- Required local quality commands pass.

How to verify:
- Run:
- `npm run lint`
- `npm run typecheck`
- `npm run check:encoding`
- `npm run check:mojibake`
- `npx prisma validate`
- `npx prisma generate`

Where to verify:
- Local terminal / CI runner.

GO condition:
- All commands pass.

NO-GO condition:
- Any command fails.

Check:
- GitHub workflow quality gates is green for current commit.

How to verify:
- Check latest run of `quality-gates.yml`.

Where to verify:
- [.github/workflows/quality-gates.yml](/d:/BeautyBooking/beautyhub/.github/workflows/quality-gates.yml).

GO condition:
- Latest workflow run is successful.

NO-GO condition:
- Workflow failed or not executed for release commit.

## 12) Final smoke checks

Check:
- Critical user path and backend processing are verified on release candidate.

How to verify:
- Run the full smoke scenario below end-to-end.

Where to verify:
- Auth, bookings, webhook, media, queue/worker endpoints in this checklist.

GO condition:
- All smoke steps pass without critical errors.

NO-GO condition:
- Any critical smoke step fails.

## Final production smoke test

1. User login: complete login flow and confirm active session.
2. Refresh token rotation: call `POST /api/auth/refresh` and confirm success.
3. Booking create: create booking via `POST /api/bookings` as authenticated client.
4. Webhook simulation: send valid YooKassa test webhook and confirm queue processing.
5. Media access: open valid private token URL `/api/media/file/{id}?mt=...` and verify success.
6. Queue worker processing: confirm `/api/health/worker` is alive and queue/dead stats are stable.

## GO / NO-GO decision template

Release: vX.X.X  
Date:  

Infrastructure: GO / NO-GO  
Database: GO / NO-GO  
Redis: GO / NO-GO  
Worker: GO / NO-GO  
Auth: GO / NO-GO  
Payments: GO / NO-GO  
Media: GO / NO-GO  
Monitoring: GO / NO-GO  

Final decision: GO / NO-GO

# Runbook: YooKassa IP Allowlist Maintenance

Purpose:
- Keep webhook IP allowlist strict and current without weakening signature/token checks.

Source of truth in code:
- `src/lib/payments/yookassa/allowlist.ts`
- `YOOKASSA_ALLOWED_IP_RANGES`
- `YOOKASSA_ALLOWLIST_METADATA.lastReviewedAt`
- `YOOKASSA_ALLOWLIST_METADATA.reviewCadenceDays`

When to run:
- Before each production release.
- Immediately when webhook denies spike with `IP_NOT_ALLOWED`.

How to verify current state:
1. Check `GET /api/health/status` -> `data.surfaces.webhook` for denied growth.
2. Inspect webhook ingress logs for `"YooKassa webhook rejected: IP allowlist deny"` and `reason`.
3. Compare CIDR ranges in `YOOKASSA_ALLOWED_IP_RANGES` with latest YooKassa webhook IP documentation.

How to update allowlist safely:
1. Update only `YOOKASSA_ALLOWED_IP_RANGES` in `allowlist.ts`.
2. Update `YOOKASSA_ALLOWLIST_METADATA.lastReviewedAt` in the same commit.
3. Do not remove signature validation or optional webhook token validation.
4. Run quality checks (`lint`, `typecheck`, encoding checks).
5. Send a signed test webhook and confirm ingress returns `200` and job is queued.

GO condition:
- Ranges match official YooKassa docs and `lastReviewedAt` is within review cadence.

NO-GO condition:
- Ranges are not verified or review date is stale.

Notes:
- Invalid CIDR in `YOOKASSA_ALLOWED_IP_RANGES` fails fast at startup.
- IP allowlist is defense-in-depth. Signature check remains mandatory.
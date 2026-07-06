import crypto from "crypto";
import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { env } from "@/lib/env";
import { checkYookassaIpAllowlist } from "@/lib/payments/yookassa/allowlist";
import { createYookassaWebhookJob } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { alertCritical } from "@/lib/monitoring";
import { alertWebhookFailure } from "@/lib/monitoring/api-alerts";
import { logError, logInfo } from "@/lib/logging/logger";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

export const runtime = "nodejs";

/**
 * HARDENING-02 — YooKassa webhook ingress.
 *
 * YooKassa does NOT sign outbound notifications (no HMAC, no signature header —
 * verified against the official docs 2026-07-06). The old HMAC + bearer-token
 * gates rejected every real notification, leaving subscriptions PENDING forever.
 *
 * The authenticity anchor is now a server-to-server re-fetch of the object from
 * the YooKassa API inside the worker (see `webhook-processor.ts`): the body here
 * is an untrusted hint and only `object.id` is propagated. This route does two
 * cheap best-effort pre-filters and enqueues:
 *   1. optional merchant-controlled URL secret (`?token=`);
 *   2. IP allowlist — currently LOG-ONLY (see `IP_ALLOWLIST_ENFORCED`).
 * A 200 is returned only after the job is durably enqueued; any other outcome
 * makes YooKassa retry (its 24h redelivery window is the delivery safety net).
 */

// finding #17 (leftmost-XFF trust, undecided). Behind the load balancer the
// socket peer is the balancer, so `extractClientIp` reads `X-Forwarded-For`,
// whose LEFTMOST entry is client-spoofable until the trusted-proxy hop count is
// fixed at the deploy layer. An unenforceable check must not masquerade as
// security, so the allowlist runs LOG-ONLY and the re-fetch anchor carries
// authenticity. Flip this to `true` once XFF derivation is provably trustworthy
// (LB → app hop count decided) to reject non-listed source IPs.
const IP_ALLOWLIST_ENFORCED = false;

// Warn at most once per process when the optional URL secret is unset in prod —
// avoids logging the same warning on every notification.
let warnedUnsetTokenInProd = false;

const webhookBodySchema = z.object({
  event: z.string().min(1),
  object: z.object({ id: z.string().min(1) }),
});

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return null;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    // ── 1. Optional merchant-controlled URL secret (?token=) ────────────────
    // The token is read from the query string and NEVER logged (residual leak
    // risk is the LB/app access log — keep it out of app logs + rotatable).
    const expectedToken = env.YOOKASSA_WEBHOOK_TOKEN?.trim();
    if (expectedToken) {
      const providedToken = new URL(req.url).searchParams.get("token")?.trim() ?? "";
      if (!timingSafeStringEqual(providedToken, expectedToken)) {
        logError("YooKassa webhook rejected: invalid URL token");
        void recordSurfaceEvent({
          surface: "webhook",
          outcome: "denied",
          operation: "yookassa-ingress",
          code: "INVALID_WEBHOOK_TOKEN",
        });
        alertWebhookFailure("yookassa", "INVALID_WEBHOOK_TOKEN");
        return fail("Unauthorized", 401, "UNAUTHORIZED");
      }
    } else if (env.NODE_ENV === "production" && !warnedUnsetTokenInProd) {
      warnedUnsetTokenInProd = true;
      logInfo(
        "YooKassa webhook: YOOKASSA_WEBHOOK_TOKEN unset in production — no URL-secret pre-filter (re-fetch anchor still applies)",
        { level: "warn" },
      );
    }

    // ── 2. IP allowlist — log-only pre-filter (see IP_ALLOWLIST_ENFORCED) ────
    const allowlistCheck = checkYookassaIpAllowlist(extractClientIp(req));
    if (!allowlistCheck.allowed) {
      logInfo("YooKassa webhook: source IP not in allowlist", {
        level: "warn",
        ip: allowlistCheck.ip,
        reason: allowlistCheck.reason,
        enforced: IP_ALLOWLIST_ENFORCED,
      });
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: IP_ALLOWLIST_ENFORCED ? "denied" : "success",
        operation: "yookassa-ingress",
        code: "IP_NOT_ALLOWED",
      });
      if (IP_ALLOWLIST_ENFORCED) {
        alertWebhookFailure("yookassa", "IP_NOT_ALLOWED", { ip: allowlistCheck.ip });
        return fail("Forbidden", 403, "FORBIDDEN");
      }
    }

    // ── 3. Minimal parse — only { event, object.id } is propagated ──────────
    const body = await req.json().catch(() => null);
    const parsed = webhookBodySchema.safeParse(body);
    if (!parsed.success) {
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: "failure",
        operation: "yookassa-ingress",
        code: "BAD_PAYLOAD",
      });
      return fail("Bad request", 400, "BAD_REQUEST");
    }

    // ── 4. Enqueue — 200 only after the job is durably queued ───────────────
    try {
      await enqueue(
        createYookassaWebhookJob({ event: parsed.data.event, objectId: parsed.data.object.id }),
      );
    } catch (error) {
      logError("Failed to enqueue YooKassa webhook job", {
        error: error instanceof Error ? error.message : String(error),
      });
      await alertCritical("Failed to enqueue YooKassa webhook job", {
        error: error instanceof Error ? error.message : String(error),
      });
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: "failure",
        operation: "yookassa-ingress",
        code: "QUEUE_ENQUEUE_FAILED",
      });
      // 5xx → YooKassa retries (24h redelivery window).
      return fail("Service unavailable", 503, "SERVICE_UNAVAILABLE");
    }

    logInfo("YooKassa webhook accepted and queued", { event: parsed.data.event });
    void recordSurfaceEvent({
      surface: "webhook",
      outcome: "success",
      operation: "yookassa-ingress",
    });
    return ok({ ok: true });
  });
}

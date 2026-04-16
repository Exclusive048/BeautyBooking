import crypto from "crypto";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { env } from "@/lib/env";
import { checkYookassaIpAllowlist } from "@/lib/payments/yookassa/allowlist";
import { createYookassaWebhookJob, type YookassaWebhookPayload } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { alertCritical } from "@/lib/monitoring";
import { logError, logInfo } from "@/lib/logging/logger";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

export const runtime = "nodejs";

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

function getWebhookToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

function parsePayload(rawBody: Buffer): YookassaWebhookPayload | null {
  try {
    return JSON.parse(rawBody.toString("utf-8")) as YookassaWebhookPayload;
  } catch {
    return null;
  }
}

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const rawBody = Buffer.from(await req.arrayBuffer());
    const signature = req.headers.get("x-api-signature-sha256")?.trim();
    const secret = env.YOOKASSA_SECRET_KEY?.trim();
    if (!signature || !secret || !verifySignature(rawBody, signature, secret)) {
      logError("YooKassa webhook rejected: invalid signature", {
        signaturePresent: Boolean(signature),
        secretPresent: Boolean(secret),
      });
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: "denied",
        operation: "yookassa-ingress",
        code: "INVALID_SIGNATURE",
      });
      return fail("Invalid signature", 401, "UNAUTHORIZED");
    }

    const allowlistCheck = checkYookassaIpAllowlist(extractClientIp(req));
    if (!allowlistCheck.allowed) {
      logError("YooKassa webhook rejected: IP allowlist deny", {
        ip: allowlistCheck.ip,
        reason: allowlistCheck.reason,
        ipVersion: allowlistCheck.ipVersion,
        allowlistLastReviewedAt: allowlistCheck.metadata.lastReviewedAt,
      });
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: "denied",
        operation: "yookassa-ingress",
        code: "IP_NOT_ALLOWED",
      });
      return fail("Forbidden", 403, "FORBIDDEN");
    }

    const token = getWebhookToken(req);
    const expectedToken = env.YOOKASSA_WEBHOOK_TOKEN?.trim();
    const isProd = env.NODE_ENV === "production";
    if (!expectedToken && isProd) {
      logError("YooKassa webhook rejected: YOOKASSA_WEBHOOK_TOKEN not configured in production");
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: "denied",
        operation: "yookassa-ingress",
        code: "WEBHOOK_TOKEN_NOT_CONFIGURED",
      });
      return fail("Service unavailable", 503, "SERVICE_UNAVAILABLE");
    }
    if (expectedToken) {
      const tokenBuf = Buffer.from(token ?? "");
      const expectedBuf = Buffer.from(expectedToken);
      const tokenValid =
        tokenBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(tokenBuf, expectedBuf);
      if (!tokenValid) {
        logError("YooKassa webhook rejected: invalid token", {
          ip: allowlistCheck.ip,
        });
        void recordSurfaceEvent({
          surface: "webhook",
          outcome: "denied",
          operation: "yookassa-ingress",
          code: "INVALID_WEBHOOK_TOKEN",
        });
        return fail("Unauthorized", 401, "UNAUTHORIZED");
      }
    }

    const payload = parsePayload(rawBody);
    if (!payload) {
      void recordSurfaceEvent({
        surface: "webhook",
        outcome: "failure",
        operation: "yookassa-ingress",
        code: "BAD_PAYLOAD",
      });
      return fail("Bad request", 400, "BAD_REQUEST");
    }

    try {
      await enqueue(createYookassaWebhookJob(payload));
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
      return fail("Service unavailable", 503, "SERVICE_UNAVAILABLE");
    }

    logInfo("YooKassa webhook accepted and queued");
    void recordSurfaceEvent({
      surface: "webhook",
      outcome: "success",
      operation: "yookassa-ingress",
    });
    return ok({ ok: true });
  });
}

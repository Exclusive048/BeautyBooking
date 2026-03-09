import crypto from "crypto";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { isYookassaIpAllowed } from "@/lib/payments/yookassa/allowlist";
import { createYookassaWebhookJob, type YookassaWebhookPayload } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { alertCritical } from "@/lib/monitoring";
import { logError, logInfo } from "@/lib/logging/logger";

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
    const secret = process.env.YOOKASSA_SECRET_KEY?.trim();
    if (!signature || !secret || !verifySignature(rawBody, signature, secret)) {
      logError("YooKassa webhook rejected: invalid signature", {
        signaturePresent: Boolean(signature),
        secretPresent: Boolean(secret),
      });
      return fail("Invalid signature", 401, "UNAUTHORIZED");
    }

    const ip = extractClientIp(req);
    if (!ip || !isYookassaIpAllowed(ip)) {
      logError("YooKassa webhook rejected: IP not allowed", { ip });
      return fail("Forbidden", 403, "FORBIDDEN");
    }

    const token = getWebhookToken(req);
    const expectedToken = process.env.YOOKASSA_WEBHOOK_TOKEN?.trim();
    if (expectedToken && token !== expectedToken) {
      logError("YooKassa webhook rejected: invalid token", { ip });
      return fail("Unauthorized", 401, "UNAUTHORIZED");
    }

    const payload = parsePayload(rawBody);
    if (!payload) {
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
      return fail("Service unavailable", 503, "SERVICE_UNAVAILABLE");
    }

    logInfo("YooKassa webhook accepted and queued");
    return ok({ ok: true });
  });
}

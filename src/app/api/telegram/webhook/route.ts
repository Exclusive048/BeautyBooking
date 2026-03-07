import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { getTelegramWebhookSecret } from "@/lib/telegram/config";
import { handleTelegramWebhook } from "@/lib/telegram/webhook";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getClientIp } from "@/lib/http/ip";
import { checkTelegramWebhookRateLimit } from "@/lib/telegram/webhookRateLimit";
import { z } from "zod";

const telegramWebhookBodySchema = z.record(z.string(), z.unknown());

export async function POST(req: Request) {
  const secret = getTelegramWebhookSecret();
  if (secret) {
    const header = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (header !== secret) {
      return fail("Forbidden", 403, "FORBIDDEN");
    }
  }

  const requestId = getRequestId(req);
  const ip = getClientIp(req);
  const allowed = await checkTelegramWebhookRateLimit(ip);
  if (!allowed) {
    return fail("Rate limit exceeded", 429, "RATE_LIMITED");
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = telegramWebhookBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("Validation error", 400, "BAD_REQUEST", formatZodError(parsed.error));
    }
    await handleTelegramWebhook(parsed.data, { requestId });
  } catch (error) {
    logError("POST /api/telegram/webhook failed", {
      requestId,
      route: "POST /api/telegram/webhook",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return ok(null);
}

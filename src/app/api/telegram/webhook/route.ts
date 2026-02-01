import { fail, ok } from "@/lib/api/response";
import { getTelegramWebhookSecret } from "@/lib/telegram/config";
import { handleTelegramWebhook } from "@/lib/telegram/webhook";
import { getRequestId, logError } from "@/lib/logging/logger";

export async function POST(req: Request) {
  const secret = getTelegramWebhookSecret();
  if (secret) {
    const header = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (header !== secret) {
      return fail("Forbidden", 403, "FORBIDDEN");
    }
  }

  const requestId = getRequestId(req);

  try {
    const body = await req.json().catch(() => null);
    if (body) {
      await handleTelegramWebhook(body, { requestId });
    }
  } catch (error) {
    logError("POST /api/telegram/webhook failed", {
      requestId,
      route: "POST /api/telegram/webhook",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return ok(null);
}

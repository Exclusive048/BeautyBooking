import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { getTelegramBotUsername } from "@/lib/telegram/config";
import { getTelegramLinkSummary } from "@/lib/telegram/links";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const botUsername = getTelegramBotUsername();
  if (!botUsername) {
    return fail("Telegram bot username is not configured", 500, "TELEGRAM_BOT_USERNAME_MISSING");
  }

  const status = await getTelegramLinkSummary(auth.user.id);
  return ok({
    linked: status.linked,
    enabled: status.enabled,
    botUsername,
  });
}

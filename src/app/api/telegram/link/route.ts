import { requireAuth } from "@/lib/auth/guards";
import { ok, fail } from "@/lib/api/response";
import { getTelegramBotUsername } from "@/lib/telegram/config";
import { generateTelegramLinkToken } from "@/lib/telegram/linking";
import { getTelegramLinkSummary } from "@/lib/telegram/links";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const botUsername = getTelegramBotUsername();
  if (!botUsername) {
    return fail("Telegram bot username is not configured", 500, "TELEGRAM_BOT_USERNAME_MISSING");
  }

  const { token, expiresAt } = await generateTelegramLinkToken(auth.user.id);
  const link = await getTelegramLinkSummary(auth.user.id);
  const url = `https://t.me/${botUsername}?start=${token}`;

  return ok({
    url,
    expiresAt,
    alreadyLinked: link.linked,
  });
}

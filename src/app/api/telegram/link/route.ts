import { requireAuth } from "@/lib/auth/guards";
import { ok, fail } from "@/lib/api/response";
import { getTelegramBotUsername } from "@/lib/telegram/config";
import { getTelegramEnabled } from "@/lib/telegram/feature";
import { generateTelegramLinkToken } from "@/lib/telegram/linking";
import { getTelegramLinkSummary } from "@/lib/telegram/links";

export async function GET() {
  // AUTH-KILLSWITCH-ENFORCE-01: gate the bot-DM connect-link generation on the
  // effective kill-switch — a disabled provider must not hand out a working
  // t.me deep-link, even with a bot username configured.
  if (!(await getTelegramEnabled())) {
    return fail("Telegram not configured", 503, "SYSTEM_FEATURE_DISABLED");
  }

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

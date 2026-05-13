import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { telegramLoginSchema } from "@/lib/auth/schemas";
import { verifyTelegramLogin } from "@/lib/auth/telegram";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_AUTH_AGE_SECONDS = 60 * 60;

function isAuthDateFresh(authDate: number, nowSeconds: number): boolean {
  if (authDate > nowSeconds + 60) return false;
  return nowSeconds - authDate <= MAX_AUTH_AGE_SECONDS;
}

/**
 * Link-only Telegram endpoint for the cabinet profile flow. Validates the
 * widget hash with the bot token, then attaches the Telegram identity to
 * the **already-authenticated** caller — without rotating their session.
 *
 * If the Telegram account is already linked to a different user, we reject
 * with `TG_ALREADY_LINKED_OTHER` so the UI can show a clear message. If
 * the user previously linked the same TG account but disabled it, we
 * simply re-enable.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, telegramLoginSchema);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return jsonFail(503, "Telegram not configured", "SYSTEM_FEATURE_DISABLED");
    }

    if (!verifyTelegramLogin(body, botToken)) {
      return jsonFail(401, "Invalid telegram hash", "INVALID_HASH");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!isAuthDateFresh(body.auth_date, nowSeconds)) {
      return jsonFail(401, "Auth data expired", "AUTH_DATE_EXPIRED");
    }

    const telegramId = String(body.id);

    // Block linking when the Telegram identity already belongs to another
    // active user. We allow re-link onto the same user (re-enable) and
    // onto any other user iff they have NO Telegram link yet.
    const otherOwner = await prisma.userProfile.findFirst({
      where: { telegramId, id: { not: user.id } },
      select: { id: true },
    });
    if (otherOwner) {
      return jsonFail(
        409,
        "Этот Telegram-аккаунт уже привязан к другому пользователю",
        "CONFLICT",
      );
    }

    const linked = new Date();

    await prisma.$transaction([
      prisma.userProfile.update({
        where: { id: user.id },
        data: {
          telegramId,
          telegramUsername: body.username ?? null,
          // Keep externalPhotoUrl if user already has one; only fill from
          // payload when empty so we don't overwrite a curated avatar.
          ...(body.photo_url && !user ? { externalPhotoUrl: body.photo_url } : {}),
        },
      }),
      prisma.telegramLink.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          telegramUserId: telegramId,
          isEnabled: true,
          linkedAt: linked,
        },
        update: {
          telegramUserId: telegramId,
          isEnabled: true,
          linkedAt: linked,
        },
      }),
    ]);

    logInfo("Telegram link completed", { userId: user.id, telegramId });
    return jsonOk({ linked: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/auth/telegram/link failed", {
        requestId: getRequestId(req),
        route: "POST /api/auth/telegram/link",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

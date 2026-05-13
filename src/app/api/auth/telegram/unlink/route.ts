import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Disconnect the caller's Telegram link. Soft-delete via `isEnabled=false`
 * preserves the row (and its `chatId`) so notifications can be silently
 * dropped without losing the historical link — the user can re-enable via
 * the same bot DM without re-discovering the chat. The row is fully
 * removed on account deletion (Cascade).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    await prisma.telegramLink.updateMany({
      where: { userId: user.id },
      data: { isEnabled: false },
    });

    return jsonOk({ unlinked: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/auth/telegram/unlink failed", {
        requestId: getRequestId(req),
        route: "POST /api/auth/telegram/unlink",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

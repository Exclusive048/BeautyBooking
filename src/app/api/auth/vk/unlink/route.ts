import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Disconnect VK. We disable rather than delete so we can audit
 * subsequent re-connects.
 *
 * RKN-FIX-12: the token-zeroing that used to accompany this is gone — there
 * are no token columns left to zero. Nothing else about the flow changed.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    await prisma.vkLink.updateMany({
      where: { userId: user.id },
      data: { isEnabled: false },
    });

    return jsonOk({ unlinked: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/auth/vk/unlink failed", {
        requestId: getRequestId(req),
        route: "POST /api/auth/vk/unlink",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

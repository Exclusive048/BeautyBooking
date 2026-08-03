import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * FIX-YANDEX-OAUTH — disconnect Yandex, bespoke-parallel to api/auth/vk/unlink.
 * Disable rather than delete (audit re-connects).
 *
 * RKN-FIX-12: token-zeroing removed — no token columns remain to zero.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    await prisma.yandexLink.updateMany({
      where: { userId: user.id },
      data: { isEnabled: false },
    });

    return jsonOk({ unlinked: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/auth/yandex/unlink failed", {
        requestId: getRequestId(req),
        route: "POST /api/auth/yandex/unlink",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

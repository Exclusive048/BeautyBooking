import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Disconnect VK. We disable rather than delete so we can audit
 * subsequent re-connects. Tokens are zeroed to prevent stale refreshes
 * from succeeding.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    await prisma.vkLink.updateMany({
      where: { userId: user.id },
      data: { isEnabled: false, accessToken: "", refreshToken: "" },
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

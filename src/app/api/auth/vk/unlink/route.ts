import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { unlinkOAuthIdentity } from "@/lib/auth/oauth-unlink";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * Отвязать VK ID от профиля: вход через VK и уведомления ВКонтакте.
 *
 * VK-YANDEX-UNLINK-01: связка удаляется целиком (раньше снимался только
 * `isEnabled`, и вход через VK продолжал вести в этот аккаунт). Последний
 * способ входа отвязать нельзя — `409 LAST_LOGIN_METHOD`; правила —
 * `src/lib/auth/oauth-unlink.ts`.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    await unlinkOAuthIdentity(user.id, "vk");

    return jsonOk({ unlinked: true });
  } catch (error) {
    const appError = toAuthSurfaceError(error);
    if (appError.status >= 500) {
      logError("POST /api/auth/vk/unlink failed", {
        requestId: getRequestId(req),
        route: "POST /api/auth/vk/unlink",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    // SECURITY-EXPOSURE-AUDIT-01 · Y9 / FIX-B14: граница auth не отдаёт `AppError.details`.
    return jsonFail(appError.status, appError.message, appError.code);
  }
}

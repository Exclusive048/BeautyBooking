import { toAppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getSessionContext } from "@/lib/auth/session";
import { listActiveSessionFamilies } from "@/lib/auth/session-families";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * MOBILE-AUTH-A3 — «Где я вошёл»: активные сессии (семьи, SEC-13) текущего
 * пользователя, самые свежие по активности — первыми. `current` — семья
 * предъявленного access-токена (Bearer или кука), а не догадка по UA.
 *
 * Ответ личный — `no-store`.
 *
 * ERROR-ENVELOPE-NEW-ROUTES: сбой БД отвечает конвертом `{ ok:false, error }`,
 * а не HTML-страницей 500 Next — приложение разбирает ответ как JSON.
 */
export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    try {
      const session = await getSessionContext();
      if (!session) {
        return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
      }

      const sessions = await listActiveSessionFamilies(session.user.id, session.familyId);
      return ok({ sessions }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.status >= 500) {
        logError("GET /api/me/sessions failed", {
          requestId: getRequestId(req),
          route: "GET /api/me/sessions",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      return fail(appError.message, appError.status, appError.code);
    }
  });
}

import { toAppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getSessionContext } from "@/lib/auth/session";
import { revokeOtherSessionFamilies } from "@/lib/auth/session-families";
import { getRequestId, logError } from "@/lib/logging/logger";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

/**
 * MOBILE-AUTH-A3 — «Завершить все остальные сессии» для любого клиента.
 *
 * В отличие от кабинетного `/api/master/account/sessions/revoke-others`
 * (отзывает ВСЁ и перевыдаёт куки этому браузеру) здесь текущая семья не
 * трогается вовсе: приложению на Bearer нечем принять перевыданные куки, а
 * семья текущего токена известна точно (`fid`). Остальные семьи гаснут сразу —
 * их access-токены перестают проходить (SEC-13), не дожидаясь TTL.
 *
 * `revoked` — сколько активных сессий завершено (как в списке), не строк.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    try {
      const session = await getSessionContext();
      if (!session) {
        return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
      }

      const revoked = await revokeOtherSessionFamilies(session.user.id, session.familyId);
      void recordSurfaceEvent({ surface: "auth", outcome: "success", operation: "session-revoke-others" });
      return ok({ revoked }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      // ERROR-ENVELOPE-NEW-ROUTES: сбой БД — конверт, а не HTML-страница 500.
      const appError = toAppError(error);
      if (appError.status >= 500) {
        logError("POST /api/me/sessions/revoke-others failed", {
          requestId: getRequestId(req),
          route: "POST /api/me/sessions/revoke-others",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      return fail(appError.message, appError.status, appError.code);
    }
  });
}

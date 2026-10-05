import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getSessionContext } from "@/lib/auth/session";
import { listActiveSessionFamilies } from "@/lib/auth/session-families";

/**
 * MOBILE-AUTH-A3 — «Где я вошёл»: активные сессии (семьи, SEC-13) текущего
 * пользователя, самые свежие по активности — первыми. `current` — семья
 * предъявленного access-токена (Bearer или кука), а не догадка по UA.
 *
 * Ответ личный — `no-store`.
 */
export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    const session = await getSessionContext();
    if (!session) {
      return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
    }

    const sessions = await listActiveSessionFamilies(session.user.id, session.familyId);
    return ok({ sessions }, { headers: { "Cache-Control": "no-store" } });
  });
}

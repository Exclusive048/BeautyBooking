import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { withRequestContext } from "@/lib/api/with-request-context";
import { MOBILE_NO_STORE_INIT, mobileRefreshTokenBodySchema } from "@/lib/auth/mobile-session";
import { revokeRefreshSessionByToken } from "@/lib/auth/session";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

/**
 * MOBILE-AUTH-A — выход из нативного приложения.
 *
 * Отзывает ВСЮ семью сессии (`revokeRefreshSessionByToken`, как веб-`/logout`):
 * access-токены этой семьи перестают работать сразу (SEC-13), а не через два
 * часа. Идемпотентен: повтор, чужой/битый/протухший токен — тот же `200 {}`;
 * клиент стирает токены у себя в любом случае, и ответ не должен ни мешать
 * выходу, ни сообщать, жила ли сессия. Push-токены установки этой семьи
 * удаляются в той же транзакции (MOBILE-B2, `revokeRefreshSessionByToken`).
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = mobileRefreshTokenBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const result = await revokeRefreshSessionByToken(parsed.data.refreshToken);
    void recordSurfaceEvent({
      surface: "auth",
      outcome: "success",
      operation: "mobile-logout",
      code: result,
    });

    return ok({}, MOBILE_NO_STORE_INIT);
  });
}

import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { withRequestContext } from "@/lib/api/with-request-context";
import {
  MOBILE_NO_STORE_INIT,
  mobileRefreshTokenBodySchema,
  serializeSessionTokens,
} from "@/lib/auth/mobile-session";
import { rotateSession } from "@/lib/auth/session";
import { readSessionDeviceMeta } from "@/lib/auth/session-client-meta";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

/**
 * MOBILE-AUTH-A — обмен refresh-токена на новую пару для нативного приложения.
 *
 * Ротация та же, что у веба (`rotateSession`): одноразовая, внутри семьи, с
 * повторной выдачей преемника отставшему на один шаг токену (SESSION-LOSS-01 —
 * ответ ротации потерялся в сети). Свежие `X-App-Version` / `X-Device-Name` /
 * … ложатся на новую строку семьи, `lastUsedAt` обновляется.
 *
 * Любой отказ ротации (подпись, срок, отзыв, отставание на два шага, удалённый
 * аккаунт) — 401 `UNAUTHORIZED`: по нему клиент разлогинивается. В отличие от
 * веб-`/api/auth/refresh` путь стоит за лимитером прокси (тир `mobileAuthRefresh`).
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = mobileRefreshTokenBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const rotated = await rotateSession(parsed.data.refreshToken, {
      deviceMeta: readSessionDeviceMeta(req.headers),
    });
    if (!rotated) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "mobile-refresh",
        code: "INVALID_REFRESH_TOKEN",
      });
      const unauthorized = fail("Вход устарел. Войдите заново.", 401, "UNAUTHORIZED");
      unauthorized.headers.set("Cache-Control", "no-store");
      return unauthorized;
    }

    return ok({ tokens: serializeSessionTokens(rotated.tokens) }, MOBILE_NO_STORE_INIT);
  });
}

import { fail } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { respondWithMobileOtpLogin } from "@/lib/auth/mobile-session";
import { verifyPhoneOtpLogin } from "@/lib/auth/otp-login";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * MOBILE-AUTH-A — вход по коду из SMS для нативного приложения.
 *
 * Логика и отказы — те же, что у веб-`/api/auth/otp/verify` (общий
 * `verifyPhoneOtpLogin`): 503 `SYSTEM_FEATURE_DISABLED`, 400
 * `VALIDATION_ERROR` / `CONSENT_REQUIRED`, 401 `CODE_NOT_FOUND`, 429/503 от
 * блокировки перебора. Отличие одно — транспорт: `{ tokens, user }` в теле,
 * без кук.
 *
 * ERROR-ENVELOPE-NEW-ROUTES: отказы собирает сервис (`result.response`), сюда
 * ловится только неожиданное — обрыв БД или Redis. Без этого приложение
 * получало HTML-страницу 500 Next и не могло показать текст. Граница auth не
 * отдаёт `details` (Y9) — вид ошибки `toAuthSurfaceError`.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    try {
      const result = await verifyPhoneOtpLogin(req, { resolveRedirect: false });
      if (!result.ok) return result.response;
      return await respondWithMobileOtpLogin(req, result, "phone");
    } catch (error) {
      const appError = toAuthSurfaceError(error);
      if (appError.status >= 500) {
        logError("POST /api/mobile/v1/auth/otp/verify failed", {
          requestId: getRequestId(req),
          route: "POST /api/mobile/v1/auth/otp/verify",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      return fail(appError.message, appError.status, appError.code);
    }
  });
}

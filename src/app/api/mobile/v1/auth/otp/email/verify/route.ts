import { fail } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { respondWithMobileOtpLogin } from "@/lib/auth/mobile-session";
import { verifyEmailOtpLogin } from "@/lib/auth/otp-login";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * MOBILE-AUTH-A — вход по коду из письма для нативного приложения.
 *
 * Логика и отказы — те же, что у веб-`/api/auth/otp/email/verify` (общий
 * `verifyEmailOtpLogin`): 400 `VALIDATION_ERROR` / `CONSENT_REQUIRED`, 401
 * `CODE_NOT_FOUND`, `EMAIL_NOT_VERIFIED`, 429/503 от блокировки перебора.
 * Транспорт — `{ tokens, user }` в теле, без кук.
 *
 * ERROR-ENVELOPE-NEW-ROUTES: отказы собирает сервис (`result.response`), сюда
 * ловится только неожиданное — обрыв БД или Redis, — и отвечает конвертом, а не
 * HTML-страницей 500. Граница auth не отдаёт `details` (Y9).
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    try {
      const result = await verifyEmailOtpLogin(req, { resolveRedirect: false });
      if (!result.ok) return result.response;
      return await respondWithMobileOtpLogin(req, result, "email");
    } catch (error) {
      const appError = toAuthSurfaceError(error);
      if (appError.status >= 500) {
        logError("POST /api/mobile/v1/auth/otp/email/verify failed", {
          requestId: getRequestId(req),
          route: "POST /api/mobile/v1/auth/otp/email/verify",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      return fail(appError.message, appError.status, appError.code);
    }
  });
}

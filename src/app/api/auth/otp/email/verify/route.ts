import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { completeOtpLogin, verifyEmailOtpLogin } from "@/lib/auth/otp-login";
import { setSessionCookies } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * Вход по коду из письма. Логика (блокировка O2, только подтверждённый адрес —
 * FIX-SEC-EMAIL-IDENTITY-01, согласия RKN-FIX-01) — в `verifyEmailOtpLogin`
 * (`src/lib/auth/otp-login.ts`), общем с мобильным
 * `/api/mobile/v1/auth/otp/email/verify` (MOBILE-AUTH-A). Здесь — только
 * веб-транспорт сессии: куки + `{ redirect }` в кабинет по роли.
 *
 * ERROR-ENVELOPE-NEW-ROUTES: отказы собирает сервис (`result.response`), сюда
 * ловится только неожиданное (обрыв БД или Redis) — конвертом, а не
 * HTML-страницей 500 на единственном включённом в проде канале входа.
 * Граница auth не отдаёт `details` (Y9).
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    try {
      const result = await verifyEmailOtpLogin(req, { resolveRedirect: true });
      if (!result.ok) return result.response;

      const { profile } = result;
      const response = ok({ redirect: result.redirect });
      await setSessionCookies(response, { sub: profile.id, phone: profile.phone, roles: profile.roles });
      completeOtpLogin(profile, "email", result.startedAt);
      return response;
    } catch (error) {
      const appError = toAuthSurfaceError(error);
      if (appError.status >= 500) {
        logError("POST /api/auth/otp/email/verify failed", {
          requestId: getRequestId(req),
          route: "POST /api/auth/otp/email/verify",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      return fail(appError.message, appError.status, appError.code);
    }
  });
}

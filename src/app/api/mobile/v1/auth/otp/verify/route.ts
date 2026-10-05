import { withRequestContext } from "@/lib/api/with-request-context";
import { respondWithMobileOtpLogin } from "@/lib/auth/mobile-session";
import { verifyPhoneOtpLogin } from "@/lib/auth/otp-login";

/**
 * MOBILE-AUTH-A — вход по коду из SMS для нативного приложения.
 *
 * Логика и отказы — те же, что у веб-`/api/auth/otp/verify` (общий
 * `verifyPhoneOtpLogin`): 503 `SYSTEM_FEATURE_DISABLED`, 400
 * `VALIDATION_ERROR` / `CONSENT_REQUIRED`, 401 `CODE_NOT_FOUND`, 429/503 от
 * блокировки перебора. Отличие одно — транспорт: `{ tokens, user }` в теле,
 * без кук.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const result = await verifyPhoneOtpLogin(req, { resolveRedirect: false });
    if (!result.ok) return result.response;
    return respondWithMobileOtpLogin(req, result, "phone");
  });
}

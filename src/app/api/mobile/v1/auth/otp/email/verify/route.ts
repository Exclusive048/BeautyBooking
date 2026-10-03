import { withRequestContext } from "@/lib/api/with-request-context";
import { respondWithMobileOtpLogin } from "@/lib/auth/mobile-session";
import { verifyEmailOtpLogin } from "@/lib/auth/otp-login";

/**
 * MOBILE-AUTH-A — вход по коду из письма для нативного приложения.
 *
 * Логика и отказы — те же, что у веб-`/api/auth/otp/email/verify` (общий
 * `verifyEmailOtpLogin`): 400 `VALIDATION_ERROR` / `CONSENT_REQUIRED`, 401
 * `CODE_NOT_FOUND`, `EMAIL_NOT_VERIFIED`, 429/503 от блокировки перебора.
 * Транспорт — `{ tokens, user }` в теле, без кук.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const result = await verifyEmailOtpLogin(req, { resolveRedirect: false });
    if (!result.ok) return result.response;
    return respondWithMobileOtpLogin(req, result, "email");
  });
}

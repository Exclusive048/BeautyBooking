import { ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { completeOtpLogin, verifyEmailOtpLogin } from "@/lib/auth/otp-login";
import { setSessionCookies } from "@/lib/auth/session";

/**
 * Вход по коду из письма. Логика (блокировка O2, только подтверждённый адрес —
 * FIX-SEC-EMAIL-IDENTITY-01, согласия RKN-FIX-01) — в `verifyEmailOtpLogin`
 * (`src/lib/auth/otp-login.ts`), общем с мобильным
 * `/api/mobile/v1/auth/otp/email/verify` (MOBILE-AUTH-A). Здесь — только
 * веб-транспорт сессии: куки + `{ redirect }` в кабинет по роли.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const result = await verifyEmailOtpLogin(req, { resolveRedirect: true });
    if (!result.ok) return result.response;

    const { profile } = result;
    const response = ok({ redirect: result.redirect });
    await setSessionCookies(response, { sub: profile.id, phone: profile.phone, roles: profile.roles });
    completeOtpLogin(profile, "email", result.startedAt);
    return response;
  });
}

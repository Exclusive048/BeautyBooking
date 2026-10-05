import { ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { completeOtpLogin, verifyPhoneOtpLogin } from "@/lib/auth/otp-login";
import { setSessionCookies } from "@/lib/auth/session";

/**
 * Вход по коду из SMS. Вся логика (гейт AUTH-GATE-01, блокировка O2, триаж
 * PHONE-CLAIM-01, согласия RKN-FIX-01, гостевые брони) — в
 * `verifyPhoneOtpLogin` (`src/lib/auth/otp-login.ts`), общем с мобильным
 * `/api/mobile/v1/auth/otp/verify` (MOBILE-AUTH-A). Здесь — только веб-транспорт
 * сессии: куки + `{ redirect }` в кабинет по роли.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const result = await verifyPhoneOtpLogin(req, { resolveRedirect: true });
    if (!result.ok) return result.response;

    const { profile } = result;
    const response = ok({ redirect: result.redirect });
    await setSessionCookies(response, { sub: profile.id, phone: profile.phone, roles: profile.roles });
    completeOtpLogin(profile, "phone", result.startedAt);
    return response;
  });
}

import { cookies } from "next/headers";
import { withRequestContext } from "@/lib/api/with-request-context";
import { AppError } from "@/lib/api/errors";
import { failOAuthCallback } from "@/lib/auth/oauth-callback-error";
import { fail } from "@/lib/api/response";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import {
  clearMobileOAuthFlowCookie,
  readMobileOAuthFlowCookie,
  type MobileOAuthFlow,
} from "@/lib/auth/mobile-oauth-flow";
import { linkOAuthIdentity, resolveOAuthLogin } from "@/lib/auth/oauth-login";
import { completeMobileOAuthCallback, mobileOAuthStateInvalid } from "@/lib/auth/oauth-mobile-callback";
import { phoneVerifyResultPath, takePhoneVerifyReturn } from "@/lib/auth/phone-verify-return";
import { getSessionUser, setSessionCookies } from "@/lib/auth/session";
import { nextRedirect } from "@/lib/http/origin";
import { mobileAuthCallbackRedirect } from "@/lib/mobile/app-redirect";
import { exchangeYandexCodeForToken, fetchYandexProfile, requireYandexRedirectUri } from "@/lib/yandex/oauth";
import { yandexCallbackSchema } from "@/lib/yandex/schemas";
import {
  readSignedYandexCookieValue,
  YANDEX_STATE_COOKIE,
  YANDEX_VERIFIER_COOKIE,
} from "@/lib/yandex/cookies";
import { readConsentCookieValue, YANDEX_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { extractClientIp } from "@/lib/http/ip";
import { isProduction, isYandexAuthEnabled } from "@/lib/env";

// FIX-YANDEX-OAUTH — callback route. Account-linking logic mirrors
// api/auth/vk/callback EXACTLY (the security-sensitive new-vs-existing-user
// branch + the "already linked to another user" 409 guard). MOBILE-AUTH-A2:
// with the logic now living in ONE service (`auth/oauth-login.ts`), the mirror
// is structural rather than copy-paste.

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function clearYandexCookies(cookieStore: CookieStore) {
  // RKN-FIX-01: consent cookie is single-use alongside state/verifier.
  for (const name of [YANDEX_STATE_COOKIE, YANDEX_VERIFIER_COOKIE, YANDEX_CONSENT_COOKIE]) {
    cookieStore.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: 0,
    });
  }
  // MOBILE-AUTH-A2: кука мобильного флоу — из той же одноразовой пачки (гасится,
  // только если пришла: веб-колбэк без неё отвечает ровно как раньше).
  clearMobileOAuthFlowCookie(cookieStore, "yandex");
}

/** MOBILE-AUTH-A2: флоу начат приложением — см. VK-близнец. */
function readYandexMobileFlow(cookieStore: CookieStore): MobileOAuthFlow | null {
  try {
    const expectedState = readSignedYandexCookieValue(cookieStore.get(YANDEX_STATE_COOKIE)?.value);
    return readMobileOAuthFlowCookie(cookieStore, "yandex", expectedState);
  } catch {
    // Нечем проверить подпись — веб-ветка ответит прежним отказом.
    return null;
  }
}

/** MOBILE-AUTH-A2 — ветка приложения (см. VK-близнец и `oauth-mobile-callback.ts`). */
async function completeYandexMobileCallback(req: Request, cookieStore: CookieStore, flow: MobileOAuthFlow) {
  const codeVerifier = readSignedYandexCookieValue(cookieStore.get(YANDEX_VERIFIER_COOKIE)?.value);
  const rawConsentCookie = cookieStore.get(YANDEX_CONSENT_COOKIE)?.value;
  clearYandexCookies(cookieStore);

  return completeMobileOAuthCallback(req, flow, {
    consentFlags: readConsentCookieValue(rawConsentCookie, flow.state),
    obtainIdentity: async () => {
      const url = new URL(req.url);
      const parsed = yandexCallbackSchema.safeParse({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
      });
      if (!parsed.success) {
        throw new AppError("Не удалось войти через Яндекс. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
      }
      if (parsed.data.state !== flow.state || !codeVerifier) {
        throw mobileOAuthStateInvalid("yandex");
      }
      const token = await exchangeYandexCodeForToken({
        code: parsed.data.code,
        codeVerifier,
        redirectUri: requireYandexRedirectUri(),
      });
      const profile = await fetchYandexProfile(token.accessToken);
      return { provider: "yandex", profile };
    },
  });
}

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: gate the callback too (the session-issuing
    // leg) — a gate on `start` alone is bypassable by hitting `callback`.
    if (!isYandexAuthEnabled) {
      // MOBILE-AUTH-A2: флоу приложения получает отказ в приложение.
      const cookieStore = await cookies();
      if (readYandexMobileFlow(cookieStore)) {
        clearYandexCookies(cookieStore);
        return mobileAuthCallbackRedirect({ error: "provider_unavailable" });
      }
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    const cookieStore = await cookies();

    const mobileFlow = readYandexMobileFlow(cookieStore);
    if (mobileFlow) {
      return completeYandexMobileCallback(req, cookieStore, mobileFlow);
    }

    try {
      const url = new URL(req.url);
      const parsed = yandexCallbackSchema.safeParse({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
      });
      if (!parsed.success) {
        clearYandexCookies(cookieStore);
        return fail("Не удалось войти через Яндекс. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
      }
      const parsedCallback = parsed.data;

      const expectedState = readSignedYandexCookieValue(cookieStore.get(YANDEX_STATE_COOKIE)?.value);
      const codeVerifier = readSignedYandexCookieValue(cookieStore.get(YANDEX_VERIFIER_COOKIE)?.value);
      const rawConsentCookie = cookieStore.get(YANDEX_CONSENT_COOKIE)?.value;

      clearYandexCookies(cookieStore);

      if (!expectedState || parsedCallback.state !== expectedState) {
        return fail("Вход через Яндекс не завершился. Начните заново.", 400, "YANDEX_STATE_INVALID");
      }
      if (!codeVerifier) {
        return fail("Вход через Яндекс не завершился. Начните заново.", 400, "VALIDATION_ERROR");
      }

      // RKN-FIX-01 — signature + state binding gate the flags (see the VK
      // callback and `oauth-consent-cookie.ts`).
      const consent = {
        flags: readConsentCookieValue(rawConsentCookie, expectedState),
        ipAddress: extractClientIp(req),
        userAgent: req.headers.get("user-agent"),
      };

      const redirectUri = requireYandexRedirectUri();
      const token = await exchangeYandexCodeForToken({
        code: parsedCallback.code,
        codeVerifier,
        redirectUri,
      });

      const profile = await fetchYandexProfile(token.accessToken);
      const identity = { provider: "yandex" as const, profile };
      const sessionUser = await getSessionUser();

      if (sessionUser) {
        // Session-link: registers nobody, so never blocked — flags honoured if
        // the visitor came through the login form (`linkOAuthIdentity`).
        const phoneOutcome = await linkOAuthIdentity({ identity, user: sessionUser, consent });

        // PHONE-OAUTH-PROOF-01: вход из кнопки «Подтвердить номер» возвращает
        // на страницу-источник с итогом, остальные привязки — как прежде, в
        // кабинет по роли.
        const verifyReturn = await takePhoneVerifyReturn();
        const target = verifyReturn
          ? phoneVerifyResultPath(verifyReturn, "yandex", phoneOutcome ?? "error")
          : (await resolveCabinetRedirect(sessionUser.id)).target;
        const response = nextRedirect(req, target);
        await setSessionCookies(response, {
          sub: sessionUser.id,
          phone: sessionUser.phone ?? null,
          roles: sessionUser.roles,
        });
        return response;
      }

      // RKN-FIX-01 fail-safe — no consent, no account (inside `resolveOAuthLogin`).
      const resolution = await resolveOAuthLogin({ identity, consent });
      if (!resolution.ok) {
        return nextRedirect(req, "/login?error=consent");
      }
      const { user } = resolution;

      const redirectDecision = await resolveCabinetRedirect(user.id);
      const response = nextRedirect(req, redirectDecision.target);
      await setSessionCookies(response, { sub: user.id, phone: user.phone ?? null, roles: user.roles });
      return response;
    } catch (error) {
      return failOAuthCallback(req, error);
    }
  });
}

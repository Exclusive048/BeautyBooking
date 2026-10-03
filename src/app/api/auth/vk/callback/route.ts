import { z } from "zod";
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
import { exchangeVkCodeForToken, fetchVkProfile, requireVkRedirectUri } from "@/lib/vk/oauth";
import { readSignedVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { readConsentCookieValue, VK_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { extractClientIp } from "@/lib/http/ip";
import { isProduction, isVkAuthEnabled } from "@/lib/env";

const callbackSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
  device_id: z.string().trim().min(1),
  type: z.string().trim().optional(),
});

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function clearVkCookies(cookieStore: CookieStore) {
  // RKN-FIX-01: the consent cookie is single-use like the state/verifier pair —
  // cleared on every exit path so it can never be reused by a later flow.
  for (const name of [VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE, VK_CONSENT_COOKIE]) {
    cookieStore.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: 0,
    });
  }
  // MOBILE-AUTH-A2: кука мобильного флоу — из той же одноразовой пачки. Гасится,
  // только если пришла: веб-колбэк без неё отвечает ровно как раньше.
  clearMobileOAuthFlowCookie(cookieStore, "vk");
}

/**
 * MOBILE-AUTH-A2: флоу начат приложением (`/api/mobile/v1/auth/oauth/vk/start`)
 * — кука подлинная и привязана к state этого флоу. Иначе `null`: флоу веба.
 */
function readVkMobileFlow(cookieStore: CookieStore): MobileOAuthFlow | null {
  try {
    const expectedState = readSignedVkCookieValue(cookieStore.get(VK_ID_STATE_COOKIE)?.value);
    return readMobileOAuthFlowCookie(cookieStore, "vk", expectedState);
  } catch {
    // Нечем проверить подпись (нет AUTH_JWT_SECRET) — веб-ветка упрётся в то же
    // самое внутри своего `try` и ответит прежним отказом.
    return null;
  }
}

function parseVkCallback(url: URL): z.infer<typeof callbackSchema> {
  const sp = url.searchParams;
  const payloadRaw = sp.get("payload");
  if (payloadRaw) {
    let payloadValue: unknown;

    try {
      payloadValue = JSON.parse(payloadRaw);
    } catch {
      try {
        payloadValue = JSON.parse(decodeURIComponent(payloadRaw));
      } catch {
        throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
      }
    }

    const parsed = callbackSchema.safeParse(payloadValue);
    if (!parsed.success) {
      throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
    }
    return parsed.data;
  }

  const directValue = {
    code: sp.get("code"),
    state: sp.get("state"),
    device_id: sp.get("device_id"),
    type: sp.get("type") ?? undefined,
  };
  const parsed = callbackSchema.safeParse(directValue);
  if (!parsed.success) {
    throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
  }
  return parsed.data;
}

/**
 * MOBILE-AUTH-A2 — ветка приложения. Те же state/verifier/согласия, тот же
 * обмен кода и тот же сервис входа, что у веба; транспорт — одноразовый код в
 * приложение, а не куки. Сессия браузера не читается (`oauth-mobile-callback.ts`).
 */
async function completeVkMobileCallback(req: Request, cookieStore: CookieStore, flow: MobileOAuthFlow) {
  const codeVerifier = readSignedVkCookieValue(cookieStore.get(VK_ID_VERIFIER_COOKIE)?.value);
  const rawConsentCookie = cookieStore.get(VK_CONSENT_COOKIE)?.value;
  clearVkCookies(cookieStore);

  return completeMobileOAuthCallback(req, flow, {
    consentFlags: readConsentCookieValue(rawConsentCookie, flow.state),
    obtainIdentity: async () => {
      const parsedCallback = parseVkCallback(new URL(req.url));
      if (parsedCallback.state !== flow.state || !codeVerifier) {
        throw mobileOAuthStateInvalid("vk");
      }
      const token = await exchangeVkCodeForToken({
        code: parsedCallback.code,
        codeVerifier,
        deviceId: parsedCallback.device_id,
        redirectUri: requireVkRedirectUri("auth"),
        state: parsedCallback.state,
      });
      const profile = await fetchVkProfile(token.accessToken);
      return { provider: "vk", profile, deviceId: token.deviceId };
    },
  });
}

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: gate the callback too — gating `start` alone
    // is bypassable by hitting `callback` directly (this is the leg that issues
    // the session). Refuse before touching creds / OAuth exchange.
    if (!isVkAuthEnabled) {
      // MOBILE-AUTH-A2: флоу приложения получает отказ в приложение — в
      // системном браузере JSON-конверт был бы тупиком.
      const cookieStore = await cookies();
      if (readVkMobileFlow(cookieStore)) {
        clearVkCookies(cookieStore);
        return mobileAuthCallbackRedirect({ error: "provider_unavailable" });
      }
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    const cookieStore = await cookies();

    const mobileFlow = readVkMobileFlow(cookieStore);
    if (mobileFlow) {
      return completeVkMobileCallback(req, cookieStore, mobileFlow);
    }

    try {
      const url = new URL(req.url);
      const parsedCallback = parseVkCallback(url);
      const expectedState = readSignedVkCookieValue(cookieStore.get(VK_ID_STATE_COOKIE)?.value);
      const codeVerifier = readSignedVkCookieValue(cookieStore.get(VK_ID_VERIFIER_COOKIE)?.value);
      const rawConsentCookie = cookieStore.get(VK_CONSENT_COOKIE)?.value;

      clearVkCookies(cookieStore);

      if (!expectedState || parsedCallback.state !== expectedState) {
        return fail("Вход через VK не завершился. Начните заново.", 400, "VK_STATE_INVALID");
      }
      if (!codeVerifier) {
        return fail("Вход через VK не завершился. Начните заново.", 400, "VALIDATION_ERROR");
      }

      // RKN-FIX-01: the flags are trusted only after the signature AND the
      // state binding check — a cookie from another flow, a tampered one, or
      // one whose 10-minute TTL lapsed mid-round-trip all resolve to `null`,
      // which reads as "no consent captured" (never as consent granted).
      const consent = {
        flags: readConsentCookieValue(rawConsentCookie, expectedState),
        ipAddress: extractClientIp(req),
        userAgent: req.headers.get("user-agent"),
      };

      const redirectUri = requireVkRedirectUri("auth");
      const token = await exchangeVkCodeForToken({
        code: parsedCallback.code,
        codeVerifier,
        deviceId: parsedCallback.device_id,
        redirectUri,
        state: parsedCallback.state,
      });

      const profile = await fetchVkProfile(token.accessToken);
      const identity = { provider: "vk" as const, profile, deviceId: token.deviceId };
      const sessionUser = await getSessionUser();

      if (sessionUser) {
        // Linking VK to an account that already exists registers nobody, so it
        // is never blocked; flags are still honoured if the visitor happened to
        // come through the login form. Связка, согласия, подписки и номер —
        // общий с приложением `linkOAuthIdentity` (MOBILE-AUTH-A2).
        const phoneOutcome = await linkOAuthIdentity({ identity, user: sessionUser, consent });

        // PHONE-OAUTH-PROOF-01: вход из кнопки «Подтвердить номер» возвращает
        // на страницу-источник с итогом, остальные привязки — как прежде, в
        // кабинет по роли.
        const verifyReturn = await takePhoneVerifyReturn();
        const target = verifyReturn
          ? phoneVerifyResultPath(verifyReturn, "vk", phoneOutcome ?? "error")
          : (await resolveCabinetRedirect(sessionUser.id)).target;
        const response = nextRedirect(req, target);
        await setSessionCookies(response, {
          sub: sessionUser.id,
          phone: sessionUser.phone ?? null,
          roles: sessionUser.roles,
        });
        return response;
      }

      // MOBILE-AUTH-A2: найти/создать пользователя (fail-safe согласий
      // RKN-FIX-01, запрет перехвата связки, номер, подписки, согласия) —
      // общий с приложением сервис `auth/oauth-login.ts`.
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

import crypto from "crypto";
import { cookies } from "next/headers";
import { withRequestContext } from "@/lib/api/with-request-context";
import {
  failOAuthStart,
  oauthStartLoginRedirect,
  oauthStartProviderRedirect,
  type OAuthStartNavigation,
} from "@/lib/auth/oauth-start-error";
import { getSessionUser } from "@/lib/auth/session";
import { buildYandexAuthorizeUrl, requireYandexRedirectUri } from "@/lib/yandex/oauth";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/yandex/pkce";
import {
  signYandexCookieValue,
  YANDEX_STATE_COOKIE,
  YANDEX_STATE_TTL_SECONDS,
  YANDEX_VERIFIER_COOKIE,
} from "@/lib/yandex/cookies";
import { consentFlagsFromParams, hasRequiredConsents } from "@/lib/legal/consent-flags";
import { signConsentCookieValue, YANDEX_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { isProduction, isYandexAuthEnabled } from "@/lib/env";

// FIX-YANDEX-OAUTH — start route, bespoke-parallel to api/auth/vk/start.
const YANDEX_NOT_CONFIGURED_CODES = new Set([
  "YANDEX_CLIENT_ID_MISSING",
  "YANDEX_CLIENT_SECRET_MISSING",
  "YANDEX_REDIRECT_URI_MISSING",
]);

export async function GET(req: Request): Promise<OAuthStartNavigation> {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: refuse when Yandex auth is disabled
    // server-side (FZ-199 kill-switch), before any cred read / OAuth work.
    // FIX-B14: та же форма ответа, что у VK-близнеца — навигация, не JSON.
    if (!isYandexAuthEnabled) {
      return oauthStartLoginRedirect(req, "provider_unavailable");
    }

    // RKN-FIX-01 — identical consent capture to the VK start route (see there
    // for the rationale); linking an already-signed-in account needs no flags.
    const consentFlags = consentFlagsFromParams(new URL(req.url).searchParams);
    const isLinkingSession = Boolean(await getSessionUser());
    if (!isLinkingSession && !hasRequiredConsents(consentFlags)) {
      return oauthStartLoginRedirect(req, "consent_required");
    }

    try {
      const state = crypto.randomBytes(32).toString("hex");
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const redirectUri = requireYandexRedirectUri();
      const authUrl = buildYandexAuthorizeUrl({ state, codeChallenge, redirectUri });

      const cookieStore = await cookies();
      cookieStore.set(YANDEX_CONSENT_COOKIE, signConsentCookieValue(state, consentFlags), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: YANDEX_STATE_TTL_SECONDS,
      });
      cookieStore.set(YANDEX_STATE_COOKIE, signYandexCookieValue(state), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: YANDEX_STATE_TTL_SECONDS,
      });
      cookieStore.set(YANDEX_VERIFIER_COOKIE, signYandexCookieValue(codeVerifier), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: YANDEX_STATE_TTL_SECONDS,
      });

      return oauthStartProviderRedirect(authUrl);
    } catch (error) {
      // FIX-B14 — см. VK-близнец: оба исхода навигация, `details` в ответ не
      // уезжает (Y9), диагностика — в лог со скрабом.
      return failOAuthStart(req, error, YANDEX_NOT_CONFIGURED_CODES);
    }
  });
}

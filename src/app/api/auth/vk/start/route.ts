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
import { buildVkAuthorizeUrl, requireVkRedirectUri } from "@/lib/vk/oauth";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/vk/pkce";
import { signVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_STATE_TTL_SECONDS, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { consentFlagsFromParams, hasRequiredConsents } from "@/lib/legal/consent-flags";
import { signConsentCookieValue, VK_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { isProduction, isVkAuthEnabled } from "@/lib/env";

const VK_NOT_CONFIGURED_CODES = new Set([
  "VK_CLIENT_ID_MISSING",
  "VK_CLIENT_SECRET_MISSING",
  "VK_REDIRECT_URI_MISSING",
  "VK_ID_CLIENT_ID_MISSING",
  "VK_ID_CLIENT_SECRET_MISSING",
  "VK_ID_REDIRECT_URI_MISSING",
]);

export async function GET(req: Request): Promise<OAuthStartNavigation> {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: refuse when the provider is disabled
    // server-side (FZ-199 kill-switch), before any cred read / OAuth work —
    // a flag-off provider with creds present must not initiate the flow.
    //
    // FIX-B14: отказ по-прежнему происходит здесь и до всего; изменилась только
    // его ФОРМА — навигация возвращается на `/login`, а не в JSON-тупик.
    if (!isVkAuthEnabled) {
      return oauthStartLoginRedirect(req, "provider_unavailable");
    }

    // RKN-FIX-01: the consent the visitor ticked on /login travels with the
    // flow. It is validated HERE (before any OAuth work) and then signed into a
    // state-bound cookie the callback can trust — see `oauth-consent-cookie.ts`
    // for why that, and not a query param on the callback, is the trustworthy
    // vehicle in this codebase.
    //
    // A session-linking round-trip (an already-signed-in user attaching VK)
    // carries no flags and needs none: it registers nobody. So the refusal is
    // scoped to visitors who could end up creating an account.
    const consentFlags = consentFlagsFromParams(new URL(req.url).searchParams);
    const isLinkingSession = Boolean(await getSessionUser());
    if (!isLinkingSession && !hasRequiredConsents(consentFlags)) {
      return oauthStartLoginRedirect(req, "consent_required");
    }

    try {
      const state = crypto.randomBytes(32).toString("hex");
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const redirectUri = requireVkRedirectUri("auth");
      const authUrl = buildVkAuthorizeUrl({ state, codeChallenge, redirectUri });

      const cookieStore = await cookies();
      cookieStore.set(VK_CONSENT_COOKIE, signConsentCookieValue(state, consentFlags), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: VK_ID_STATE_TTL_SECONDS,
      });
      cookieStore.set(VK_ID_STATE_COOKIE, signVkCookieValue(state), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: VK_ID_STATE_TTL_SECONDS,
      });
      cookieStore.set(VK_ID_VERIFIER_COOKIE, signVkCookieValue(codeVerifier), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: VK_ID_STATE_TTL_SECONDS,
      });

      return oauthStartProviderRedirect(authUrl);
    } catch (error) {
      // FIX-B14: раньше здесь было два разных ответа — 503 для «не
      // сконфигурирован» и общий `fail(...)` с `appError.details`. Второй ещё и
      // тащил наружу payload ошибки, который SECURITY-EXPOSURE-AUDIT-01 · Y9
      // намеренно снял с колбэков; на старте это осталось незамеченным.
      // Оба исхода теперь навигация, а диагностика уезжает в лог со скрабом.
      return failOAuthStart(req, error, VK_NOT_CONFIGURED_CODES);
    }
  });
}

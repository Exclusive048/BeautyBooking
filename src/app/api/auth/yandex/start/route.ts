import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withRequestContext } from "@/lib/api/with-request-context";
import { fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
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
import { UI_TEXT } from "@/lib/ui/text";

// FIX-YANDEX-OAUTH — start route, bespoke-parallel to api/auth/vk/start.
const YANDEX_NOT_CONFIGURED_CODES = new Set([
  "YANDEX_CLIENT_ID_MISSING",
  "YANDEX_CLIENT_SECRET_MISSING",
  "YANDEX_REDIRECT_URI_MISSING",
]);

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: refuse when Yandex auth is disabled
    // server-side (FZ-199 kill-switch), before any cred read / OAuth work.
    if (!isYandexAuthEnabled) {
      return fail("Auth method not configured", 503, "SERVICE_UNAVAILABLE");
    }

    // RKN-FIX-01 — identical consent capture to the VK start route (see there
    // for the rationale); linking an already-signed-in account needs no flags.
    const consentFlags = consentFlagsFromParams(new URL(req.url).searchParams);
    const isLinkingSession = Boolean(await getSessionUser());
    if (!isLinkingSession && !hasRequiredConsents(consentFlags)) {
      return fail(UI_TEXT.auth.loginPage.consentRequired, 400, "CONSENT_REQUIRED");
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

      return NextResponse.redirect(authUrl);
    } catch (error) {
      const appError = error instanceof AppError ? error : toAppError(error);
      if (YANDEX_NOT_CONFIGURED_CODES.has(appError.code)) {
        return fail("Auth method not configured", 503, "SERVICE_UNAVAILABLE");
      }
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
  });
}

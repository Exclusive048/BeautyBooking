import { cookies } from "next/headers";
import { withRequestContext } from "@/lib/api/with-request-context";
import { ok, fail } from "@/lib/api/response";
import { getTelegramEnabled } from "@/lib/telegram/feature";
import {
  createTelegramLoginState,
  TELEGRAM_LOGIN_STATE_COOKIE,
  TELEGRAM_LOGIN_STATE_TTL_SECONDS,
} from "@/lib/auth/telegram-login-state";
import { consentFlagsFromParams, hasRequiredConsents } from "@/lib/legal/consent-flags";
import { signConsentCookieValue, TELEGRAM_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { isProduction } from "@/lib/env";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * FIX-9 (HARDENING-06) — Telegram login "start" step. The widget fetches this
 * before rendering; the server sets an HttpOnly single-use state cookie and
 * returns the nonce, which the widget round-trips via `data-auth-url=...?s=`.
 * The login GET then binds the flow to this browser. Gated on the effective
 * kill-switch. Rate-limiting is applied by the `/api/auth/*` proxy tier.
 */
export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    if (!(await getTelegramEnabled())) {
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    // RKN-FIX-01 — parity with the VK/Yandex start routes. The widget only
    // initialises after the required boxes are ticked, and passes the flags
    // here; they are bound to the same single-use nonce that already binds the
    // flow to this browser, so `/telegram/login` can trust them.
    const consentFlags = consentFlagsFromParams(new URL(req.url).searchParams);
    if (!hasRequiredConsents(consentFlags)) {
      return fail(UI_TEXT.auth.loginPage.consentRequired, 400, "CONSENT_REQUIRED");
    }

    const { state, cookieValue } = createTelegramLoginState();
    const cookieStore = await cookies();
    cookieStore.set(TELEGRAM_LOGIN_STATE_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: TELEGRAM_LOGIN_STATE_TTL_SECONDS,
    });
    cookieStore.set(TELEGRAM_CONSENT_COOKIE, signConsentCookieValue(state, consentFlags), {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: TELEGRAM_LOGIN_STATE_TTL_SECONDS,
    });

    return ok({ state });
  });
}

import { cookies } from "next/headers";
import { withRequestContext } from "@/lib/api/with-request-context";
import { ok, fail } from "@/lib/api/response";
import { getTelegramEnabled } from "@/lib/telegram/feature";
import {
  createTelegramLoginState,
  TELEGRAM_LOGIN_STATE_COOKIE,
  TELEGRAM_LOGIN_STATE_TTL_SECONDS,
} from "@/lib/auth/telegram-login-state";
import { isProduction } from "@/lib/env";

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
      return fail("Auth method not configured", 503, "SERVICE_UNAVAILABLE");
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

    return ok({ state });
  });
}

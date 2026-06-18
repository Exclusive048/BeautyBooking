import { NextResponse, type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { telegramLoginSchema } from "@/lib/auth/schemas";
import { authenticateTelegramLogin } from "@/lib/auth/telegram-login";
import { setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = telegramLoginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "telegram-login",
        code: "SERVICE_UNAVAILABLE",
      });
      return fail("Auth method not configured", 503, "SERVICE_UNAVAILABLE");
    }

    const result = await authenticateTelegramLogin(parsed.data, botToken);
    if (!result.ok) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: result.status === 401 || result.status === 403 ? "denied" : "failure",
        operation: "telegram-login",
        code: result.code,
      });
      return fail(result.message, result.status, result.code);
    }

    try {
      await ensureFreeSubscriptionsForRoles(result.user.id, result.user.roles);
    } catch (error) {
      logError("ensureFreeSubscriptionsForRoles failed after telegram login", {
        userProfileId: result.user.id,
        error: error instanceof Error ? error.stack : error,
      });
      void sendTelegramAlert(
        `User ${result.user.id} logged in without free subscription`,
        `auth:free-subscription:telegram:${result.user.id}`
      );
    }

    const redirectDecision = await resolveCabinetRedirect(result.user.id);
    const response = ok({ redirect: redirectDecision.target });
    await setSessionCookies(response, {
      sub: result.user.id,
      phone: result.user.phone ?? null,
      roles: result.user.roles,
    });
    return response;
  });
}

/**
 * FIX-23 (CSP unsafe-eval on /login) — redirect-mode Telegram callback.
 *
 * The embedded Telegram Login widget is now configured with `data-auth-url`
 * instead of `data-onauth`. `data-onauth` makes telegram-widget.js compile the
 * callback string at widget-init via `new Function`/`eval` — that was the
 * prod-only `unsafe-eval` pageerror under the strict-dynamic CSP. In redirect
 * mode the widget never touches its string compiler; it navigates the browser
 * here with the signed auth fields as query params. We verify the HMAC hash
 * with the SAME `authenticateTelegramLogin` used by the POST path (authenticity
 * + auth_date freshness are identical), then issue the session and redirect to
 * the resolved cabinet. On any failure we bounce back to /login with an error
 * flag the page surfaces.
 */
export async function GET(req: NextRequest) {
  return withRequestContext(req, async () => {
    const params = new URL(req.url).searchParams;
    const candidate = {
      id: params.get("id"),
      first_name: params.get("first_name"),
      last_name: params.get("last_name") ?? undefined,
      username: params.get("username") ?? undefined,
      photo_url: params.get("photo_url") ?? undefined,
      auth_date: params.get("auth_date"),
      hash: params.get("hash"),
    };

    const loginRedirect = (errorCode: string) =>
      NextResponse.redirect(new URL(`/login?error=${errorCode}`, req.url));

    const parsed = telegramLoginSchema.safeParse(candidate);
    if (!parsed.success) {
      return loginRedirect("telegram");
    }

    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "telegram-login",
        code: "SERVICE_UNAVAILABLE",
      });
      return loginRedirect("telegram_unconfigured");
    }

    const result = await authenticateTelegramLogin(parsed.data, botToken);
    if (!result.ok) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: result.status === 401 || result.status === 403 ? "denied" : "failure",
        operation: "telegram-login",
        code: result.code,
      });
      return loginRedirect("telegram");
    }

    try {
      await ensureFreeSubscriptionsForRoles(result.user.id, result.user.roles);
    } catch (error) {
      logError("ensureFreeSubscriptionsForRoles failed after telegram login", {
        userProfileId: result.user.id,
        error: error instanceof Error ? error.stack : error,
      });
      void sendTelegramAlert(
        `User ${result.user.id} logged in without free subscription`,
        `auth:free-subscription:telegram:${result.user.id}`
      );
    }

    const redirectDecision = await resolveCabinetRedirect(result.user.id);
    const response = NextResponse.redirect(new URL(redirectDecision.target, req.url));
    await setSessionCookies(response, {
      sub: result.user.id,
      phone: result.user.phone ?? null,
      roles: result.user.roles,
    });
    return response;
  });
}

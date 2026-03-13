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

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = telegramLoginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
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

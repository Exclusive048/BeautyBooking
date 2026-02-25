import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { providerSettingsSchema } from "@/lib/providers/schemas";
import {
  getProviderSettings,
  updateProviderSettings,
} from "@/lib/providers/settings";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const data = await getProviderSettings(user.id);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/providers/me/settings failed", {
        requestId: getRequestId(req),
        route: "GET /api/providers/me/settings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, providerSettingsSchema);
    const data = await updateProviderSettings(user.id, {
      autoConfirmBookings: body.autoConfirmBookings,
      cancellationDeadlineHours: body.cancellationDeadlineHours,
      remindersEnabled: body.remindersEnabled,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/providers/me/settings failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/providers/me/settings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

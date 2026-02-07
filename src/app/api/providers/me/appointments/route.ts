import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { providerAppointmentsQuerySchema } from "@/lib/providers/schemas";
import { listProviderAppointmentsForDate } from "@/lib/providers/appointments";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), providerAppointmentsQuerySchema);
    const data = await listProviderAppointmentsForDate({ userId: user.id, date: query.date });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/providers/me/appointments failed", {
        requestId: getRequestId(req),
        route: "GET /api/providers/me/appointments",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

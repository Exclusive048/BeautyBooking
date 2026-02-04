import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { getStudioCalendar } from "@/lib/studio/calendar.service";
import { studioCalendarQuerySchema } from "@/lib/studio/schemas";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), studioCalendarQuerySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const masterIds =
      query.masterIds
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) ?? undefined;

    const data = await getStudioCalendar({
      studioId: query.studioId,
      date: query.date,
      view: query.view,
      masterIds,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/calendar failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/calendar",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}


import type { DayOfWeek } from "@/lib/domain/schedule";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { resolveErrorCode, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { masterScheduleRuleSchema } from "@/lib/master/schemas";
import { saveScheduleRule } from "@/lib/schedule/usecases";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const providerId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, masterScheduleRuleSchema);

    const payload =
      body.kind === "WEEKLY" && "weekly" in body.payload
        ? {
            weekly: body.payload.weekly.map((day) => ({
              dayOfWeek: day.dayOfWeek as DayOfWeek,
              isWorkday: day.isWorkday,
              startLocal: day.startLocal ?? null,
              endLocal: day.endLocal ?? null,
              breaks: day.breaks ?? [],
            })),
          }
        : {
            cycle: {
              days:
                "cycle" in body.payload
                  ? body.payload.cycle.days.map((day) => ({
                      isWorkday: day.isWorkday,
                      startLocal: day.startLocal ?? null,
                      endLocal: day.endLocal ?? null,
                      breaks: day.breaks ?? [],
                    }))
                  : [],
            },
          };

    const result = await saveScheduleRule(providerId, {
      kind: body.kind,
      timezone: body.timezone,
      anchorDate: body.anchorDate ? new Date(`${body.anchorDate}T00:00:00.000Z`) : null,
      bufferBetweenBookingsMin: body.bufferBetweenBookingsMin,
      payload,
    });
    if (!result.ok) {
      return jsonFail(result.status, result.message, resolveErrorCode(result.code, "INTERNAL_ERROR"));
    }

    return jsonOk({ id: result.data.id }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/schedule/rule failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/schedule/rule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

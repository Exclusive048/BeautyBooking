import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { resolveErrorCode, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { parseBody } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { setWeeklySchedule } from "@/lib/schedule/usecases";
import type { DayOfWeek } from "@/lib/domain/schedule";

export const runtime = "nodejs";

const breakSchema = z.object({
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
});

const weeklySchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startLocal: z.string().min(1),
    endLocal: z.string().min(1),
    breaks: z.array(breakSchema).max(3).optional(),
  })
);

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const providerId = await getCurrentMasterProviderId(user.id);
    const items = await prisma.weeklySchedule.findMany({
      where: { providerId },
      select: { dayOfWeek: true, startLocal: true, endLocal: true },
      orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
    });

    const breaks = await prisma.scheduleBreak.findMany({
      where: { providerId, kind: "WEEKLY" },
      select: { dayOfWeek: true, startLocal: true, endLocal: true },
      orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
    });

    const breaksByDay = new Map<number, typeof breaks>();
    for (const item of breaks) {
      const key = item.dayOfWeek ?? 0;
      const list = breaksByDay.get(key) ?? [];
      list.push(item);
      breaksByDay.set(key, list);
    }

    return jsonOk({
      items: items.map((item) => ({
        ...item,
        breaks: breaksByDay.get(item.dayOfWeek)?.map((entry) => ({
          startLocal: entry.startLocal,
          endLocal: entry.endLocal,
        })),
      })),
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/schedule/weekly failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/schedule/weekly",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const providerId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, weeklySchema);
    const items = body.map((item) => ({ ...item, dayOfWeek: item.dayOfWeek as DayOfWeek }));

    const result = await setWeeklySchedule(providerId, items);
    if (!result.ok) {
      return jsonFail(result.status, result.message, resolveErrorCode(result.code, "INTERNAL_ERROR"));
    }

    return jsonOk({ count: result.data.count });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/master/schedule/weekly failed", {
        requestId: getRequestId(req),
        route: "PUT /api/master/schedule/weekly",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

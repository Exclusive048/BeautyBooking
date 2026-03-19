import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import {
  archiveFinalizedScheduleChangeRequestsForStudio,
  getScheduleChangeRequestArchiveReport,
} from "@/lib/schedule/request-archive";

export const runtime = "nodejs";

const BACKFILL_LIMIT = 2000;

function hasAdminRole(roles: StudioRole[]) {
  return roles.some((role) => role === StudioRole.ADMIN || role === StudioRole.OWNER);
}

function parseDateRange(url: URL): {
  fromKey: string;
  toKey: string;
  from: Date;
  toExclusive: Date;
} | null {
  const fromKey = url.searchParams.get("from");
  const toKey = url.searchParams.get("to");
  if (!fromKey || !toKey || !isDateKey(fromKey) || !isDateKey(toKey) || toKey < fromKey) {
    return null;
  }

  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const toExclusive = new Date(`${addDaysToDateKey(toKey, 1)}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
    return null;
  }

  return { fromKey, toKey, from, toExclusive };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const access = await resolveCurrentStudioAccess(user.id);
    if (!hasAdminRole(access.roles)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const range = parseDateRange(new URL(req.url));
    if (!range) {
      return jsonFail(400, "Invalid date range", "VALIDATION_ERROR");
    }

    const backfill = await archiveFinalizedScheduleChangeRequestsForStudio({
      studioId: access.studioId,
      finalizedFrom: range.from,
      finalizedToExclusive: range.toExclusive,
      limit: BACKFILL_LIMIT,
    });

    if (backfill.scannedCount > 0) {
      logInfo("Schedule request archive backfill executed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/schedule/requests/archive/report",
        studioId: access.studioId,
        scannedCount: backfill.scannedCount,
        archivedCount: backfill.archivedCount,
      });
    }

    const rows = await getScheduleChangeRequestArchiveReport({
      studioId: access.studioId,
      finalizedFrom: range.from,
      finalizedToExclusive: range.toExclusive,
    });

    return jsonOk({
      period: { from: range.fromKey, to: range.toKey },
      backfill,
      rows,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/schedule/requests/archive/report failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/schedule/requests/archive/report",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

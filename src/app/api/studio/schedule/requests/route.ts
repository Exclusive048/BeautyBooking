import { Prisma, ScheduleChangeRequestStatus, StudioRole } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

function hasAdminRole(roles: StudioRole[]) {
  return roles.some((role) => role === StudioRole.ADMIN || role === StudioRole.OWNER);
}

const querySchema = z.object({
  status: z.string().trim().optional(),
});

const STATUS_VALUES = new Set(Object.values(ScheduleChangeRequestStatus));
const ALLOWED_STATUS_VALUES = [
  "pending",
  "approved",
  "rejected",
  "all",
  ScheduleChangeRequestStatus.PENDING,
  ScheduleChangeRequestStatus.APPROVED,
  ScheduleChangeRequestStatus.REJECTED,
];

function parseStatusParam(value?: string | null): ScheduleChangeRequestStatus | undefined | null {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "all") return undefined;
  const upper = trimmed.toUpperCase();
  if (STATUS_VALUES.has(upper as ScheduleChangeRequestStatus)) {
    return upper as ScheduleChangeRequestStatus;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const access = await resolveCurrentStudioAccess(user.id);
    if (!hasAdminRole(access.roles)) {
      return jsonFail(403, "Недостаточно прав.", "FORBIDDEN");
    }

    const url = new URL(req.url);
    const query = parseQuery(url, querySchema);
    const parsedStatus = parseStatusParam(query.status);
    if (parsedStatus === null) {
      logInfo("GET /api/studio/schedule/requests invalid status", {
        requestId: getRequestId(req),
        route: "GET /api/studio/schedule/requests",
        status: query.status ?? null,
      });
      return jsonFail(400, "Invalid status", "VALIDATION_ERROR", { allowed: ALLOWED_STATUS_VALUES });
    }

    const where: Prisma.ScheduleChangeRequestWhereInput = {
      studioId: access.studioId,
    };
    if (parsedStatus) {
      where.status = parsedStatus;
    }

    const requests = await prisma.scheduleChangeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        provider: { select: { id: true, name: true } },
      },
    });

    return jsonOk({
      requests: requests.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        provider: { id: item.provider.id, name: item.provider.name },
      })),
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/schedule/requests failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/schedule/requests",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

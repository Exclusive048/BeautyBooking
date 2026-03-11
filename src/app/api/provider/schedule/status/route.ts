import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { assertScheduleEditable, resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function normalizeFixedSlotTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFixedSlotTimes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string") continue;
    const normalized = normalizeFixedSlotTime(item);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function parseScheduleMode(value: unknown): "FLEXIBLE" | "FIXED" {
  if (value === "FIXED") return "FIXED";
  if (value === "FLEXIBLE") return "FLEXIBLE";
  return "FLEXIBLE";
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    const providerSettings = await prisma.provider.findUnique({
      where: { id: provider.id },
      select: { scheduleMode: true, fixedSlotTimes: true },
    });
    const scheduleMode = providerSettings?.scheduleMode ?? "FLEXIBLE";
    const fixedSlotTimes = providerSettings?.fixedSlotTimes ?? [];

    const isStudioMember = provider.type === "MASTER" && Boolean(provider.studioId);
    if (!isStudioMember) {
      return jsonOk({
        mode: "solo",
        scheduleMode,
        fixedSlotTimes,
      });
    }

    const [pending, rejected] = await Promise.all([
      prisma.scheduleChangeRequest.findFirst({
        where: { providerId: provider.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.scheduleChangeRequest.findFirst({
        where: { providerId: provider.id, status: "REJECTED" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, comment: true, updatedAt: true },
      }),
    ]);

    return jsonOk({
      mode: "studio_member",
      scheduleMode,
      fixedSlotTimes,
      requestStatus: pending ? "PENDING" : rejected ? "REJECTED" : null,
      pendingRequestId: pending?.id ?? null,
      rejectedComment: rejected?.comment ?? null,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/provider/schedule/status failed", {
        requestId: getRequestId(req),
        route: "GET /api/provider/schedule/status",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    assertScheduleEditable(provider);

    const body = (await req.json().catch(() => null)) as
      | { scheduleMode?: unknown; fixedSlotTimes?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return jsonFail(400, "Некорректное тело запроса.", "INVALID_BODY");
    }

    const current = await prisma.provider.findUnique({
      where: { id: provider.id },
      select: { scheduleMode: true, fixedSlotTimes: true },
    });
    if (!current) {
      return jsonFail(404, "Мастер не найден.", "NOT_FOUND");
    }

    const scheduleMode =
      body.scheduleMode === undefined ? current.scheduleMode : parseScheduleMode(body.scheduleMode);
    const fixedSlotTimes =
      body.fixedSlotTimes === undefined ? current.fixedSlotTimes : normalizeFixedSlotTimes(body.fixedSlotTimes);

    const updated = await prisma.provider.update({
      where: { id: provider.id },
      data: {
        scheduleMode,
        fixedSlotTimes,
      },
      select: {
        scheduleMode: true,
        fixedSlotTimes: true,
      },
    });
    await invalidateSlotsForMaster(provider.id);

    return jsonOk({
      scheduleMode: updated.scheduleMode,
      fixedSlotTimes: updated.fixedSlotTimes,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/provider/schedule/status failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/provider/schedule/status",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

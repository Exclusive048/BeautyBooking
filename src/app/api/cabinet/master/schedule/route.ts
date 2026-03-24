import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { cancelBooking } from "@/lib/bookings/cancelBooking";
import { resolveBookingRuntimeStatus, type BookingRuntimeStatus } from "@/lib/bookings/flow";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderContext } from "@/lib/master/access";
import {
  loadBookingWithRelations,
  notifyCancelledByMaster,
} from "@/lib/notifications/booking-notifications";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import {
  applyScheduleSnapshot,
  buildScheduleSnapshot,
  normalizeExceptionInput,
  normalizeWeekScheduleInput,
  serializeScheduleState,
  toScheduleEditorRequestPayload,
  type DayScheduleDto,
  type EditorExceptionInput,
  type ScheduleEditorSnapshot,
} from "@/lib/schedule/editor";
import { ensureStudioRole } from "@/lib/studio/access";
import {
  loadScheduleRequestWithRelations,
  notifyMasterScheduleUpdatedByStudio,
  notifyScheduleRequestSubmitted,
} from "@/lib/notifications/studio-notifications";

export const runtime = "nodejs";

type PatchBody = {
  weekSchedule?: unknown;
  exception?: unknown;
  deleteException?: unknown;
  dayOffConflictResolution?: unknown;
};

type DayOffConflictResolution = {
  action: "CANCEL_BOOKINGS_AND_SET_OFF";
  bookingIds: string[];
};

type DayOffConflictBooking = {
  id: string;
  clientName: string;
  status: BookingRuntimeStatus;
  timeLabel: string;
  canCancel: boolean;
};

type ActorMode = "SOLO_MASTER" | "STUDIO_ADMIN" | "STUDIO_MASTER";

type ActorContext = {
  mode: ActorMode;
  providerId: string;
  studioProviderId: string | null;
};

type PendingStatus = "PENDING" | "REJECTED" | null;

type ApprovalInfo = {
  mode: ActorMode;
  requestStatus: PendingStatus;
  pendingRequestId: string | null;
  rejectedComment: string | null;
  lastAction?: "APPLIED" | "REQUEST_CREATED" | "REQUEST_UPDATED" | "NO_CHANGES";
};

type RouteResponse = ScheduleEditorSnapshot & {
  approval: ApprovalInfo;
};

type ExceptionWithId = EditorExceptionInput & { id?: string };

function isCancellableStatus(status: BookingRuntimeStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED" || status === "CHANGE_REQUESTED";
}

function isConflictStatus(status: BookingRuntimeStatus): boolean {
  return status !== "REJECTED" && status !== "FINISHED";
}

function parseDayOffConflictResolution(value: unknown): DayOffConflictResolution | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.action !== "CANCEL_BOOKINGS_AND_SET_OFF") return null;
  if (!Array.isArray(record.bookingIds)) return null;
  const bookingIds = record.bookingIds
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => Boolean(item));
  if (bookingIds.length === 0) return null;
  return {
    action: "CANCEL_BOOKINGS_AND_SET_OFF",
    bookingIds,
  };
}

async function listDayOffConflicts(input: {
  providerId: string;
  dateKey: string;
  timezone: string;
}): Promise<DayOffConflictBooking[]> {
  const dayStartUtc = dateFromLocalDateKey(input.dateKey, input.timezone, 0, 0);
  const dayEndUtc = dateFromLocalDateKey(addDaysToDateKey(input.dateKey, 1), input.timezone, 0, 0);
  const now = new Date();
  const rows = await prisma.booking.findMany({
    where: {
      OR: [{ masterProviderId: input.providerId }, { masterProviderId: null, providerId: input.providerId }],
      startAtUtc: { gte: dayStartUtc, lt: dayEndUtc },
      endAtUtc: { gt: now },
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
    },
    select: {
      id: true,
      clientName: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
    },
    orderBy: { startAtUtc: "asc" },
  });

  return rows
    .map((row) => {
      const runtimeStatus = resolveBookingRuntimeStatus({
        status: row.status,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
        now,
      });
      if (!isConflictStatus(runtimeStatus)) return null;
      const timeLabel = row.startAtUtc
        ? new Intl.DateTimeFormat("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: input.timezone,
          }).format(row.startAtUtc)
        : "--:--";
      return {
        id: row.id,
        clientName: row.clientName,
        status: runtimeStatus,
        timeLabel,
        canCancel: isCancellableStatus(runtimeStatus),
      };
    })
    .filter((item): item is DayOffConflictBooking => item !== null);
}

function assertConflictResolution(input: {
  conflicts: DayOffConflictBooking[];
  resolution: DayOffConflictResolution | null;
}): void {
  const nonCancellable = input.conflicts.filter((item) => !item.canCancel);
  if (nonCancellable.length > 0) {
    throw new AppError(
      "На этот день есть записи, которые нельзя отменить автоматически.",
      409,
      "SCHEDULE_DAY_OFF_CONFLICT",
      {
        bookings: input.conflicts,
        nonCancellableCount: nonCancellable.length,
      }
    );
  }

  if (!input.resolution) {
    throw new AppError(
      "На этот день есть записи. Подтвердите их отмену, чтобы сделать день выходным.",
      409,
      "SCHEDULE_DAY_OFF_CONFLICT",
      {
        bookings: input.conflicts,
        nonCancellableCount: 0,
      }
    );
  }

  const requiredIds = new Set(input.conflicts.map((item) => item.id));
  const providedIds = new Set(input.resolution.bookingIds);
  if (
    requiredIds.size !== providedIds.size ||
    Array.from(requiredIds).some((bookingId) => !providedIds.has(bookingId))
  ) {
    throw new AppError(
      "Список записей для отмены устарел. Обновите день и повторите действие.",
      409,
      "SCHEDULE_DAY_OFF_CONFLICT",
      {
        bookings: input.conflicts,
        nonCancellableCount: 0,
      }
    );
  }
}

async function cancelConflictingBookings(input: {
  conflicts: DayOffConflictBooking[];
  req: Request;
}): Promise<void> {
  for (const booking of input.conflicts) {
    await cancelBooking({
      bookingId: booking.id,
      cancelledBy: "PROVIDER",
      reason: "День отмечен выходным в расписании мастера",
    });
    try {
      const fullBooking = await loadBookingWithRelations(booking.id);
      if (fullBooking && fullBooking.status === "REJECTED") {
        await notifyCancelledByMaster(fullBooking);
      }
    } catch (error) {
      logError("PATCH /api/cabinet/master/schedule cancel notification failed", {
        requestId: getRequestId(input.req),
        route: "PATCH /api/cabinet/master/schedule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}

async function resolveTargetProvider(req: Request, userId: string): Promise<ActorContext> {
  const url = new URL(req.url);
  const studioId = url.searchParams.get("studioId")?.trim() ?? "";
  const masterId = url.searchParams.get("masterId")?.trim() ?? "";

  if (!studioId && !masterId) {
    const ownProvider = await getCurrentMasterProviderContext(userId);
    return {
      mode: ownProvider.studioId ? "STUDIO_MASTER" : "SOLO_MASTER",
      providerId: ownProvider.id,
      studioProviderId: ownProvider.studioId,
    };
  }

  if (!studioId || !masterId) {
    throw new AppError("Validation error", 400, "VALIDATION_ERROR");
  }

  await ensureStudioRole({
    studioId,
    userId,
    allowed: [StudioRole.OWNER, StudioRole.ADMIN],
  });

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const master = await prisma.provider.findFirst({
    where: {
      id: masterId,
      type: "MASTER",
      studioId: studio.providerId,
    },
    select: { id: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  return {
    mode: "STUDIO_ADMIN",
    providerId: master.id,
    studioProviderId: studio.providerId,
  };
}

function buildCurrentState(snapshot: ScheduleEditorSnapshot): {
  weekSchedule: DayScheduleDto[];
  exceptions: ExceptionWithId[];
} {
  return {
    weekSchedule: normalizeWeekScheduleInput(snapshot.weekSchedule),
    exceptions: snapshot.exceptions
      .map((item) => ({ ...normalizeExceptionInput(item), id: item.id }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  };
}

function buildNormalizedState(input: {
  weekSchedule: DayScheduleDto[];
  exceptions: ExceptionWithId[];
}): {
  weekSchedule: DayScheduleDto[];
  exceptions: EditorExceptionInput[];
} {
  return {
    weekSchedule: input.weekSchedule,
    exceptions: input.exceptions
      .map((item) => ({
        date: item.date,
        isWorkday: item.isWorkday,
        scheduleMode: item.scheduleMode,
        startTime: item.startTime,
        endTime: item.endTime,
        breaks: item.breaks,
        fixedSlotTimes: item.fixedSlotTimes,
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  };
}

function applyPatchToState(
  snapshot: ScheduleEditorSnapshot,
  body: PatchBody
): {
  weekSchedule: DayScheduleDto[];
  exceptions: EditorExceptionInput[];
} {
  const current = buildCurrentState(snapshot);
  let nextWeek = current.weekSchedule;
  let nextExceptions = [...current.exceptions];

  if (body.weekSchedule !== undefined) {
    nextWeek = normalizeWeekScheduleInput(body.weekSchedule);
  }

  if (body.exception !== undefined) {
    const normalized = normalizeExceptionInput(body.exception);
    const existingIndex = nextExceptions.findIndex((item) => item.date === normalized.date);
    const existingId = existingIndex >= 0 ? nextExceptions[existingIndex].id : undefined;
    const nextRow: ExceptionWithId = { ...normalized, id: existingId };
    if (existingIndex >= 0) {
      nextExceptions[existingIndex] = nextRow;
    } else {
      nextExceptions.push(nextRow);
    }
  }

  if (typeof body.deleteException === "string" && body.deleteException.trim()) {
    const deleteId = body.deleteException.trim();
    nextExceptions = nextExceptions.filter((item) => item.id !== deleteId);
  }

  return buildNormalizedState({
    weekSchedule: nextWeek,
    exceptions: nextExceptions,
  });
}

async function loadStudioMasterStatus(providerId: string): Promise<{
  requestStatus: PendingStatus;
  pendingRequestId: string | null;
  rejectedComment: string | null;
}> {
  const [pending, rejected] = await Promise.all([
    prisma.scheduleChangeRequest.findFirst({
      where: { providerId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.scheduleChangeRequest.findFirst({
      where: { providerId, status: "REJECTED" },
      orderBy: { updatedAt: "desc" },
      select: { comment: true },
    }),
  ]);

  return {
    requestStatus: pending ? "PENDING" : rejected ? "REJECTED" : null,
    pendingRequestId: pending?.id ?? null,
    rejectedComment: rejected?.comment ?? null,
  };
}

async function upsertStudioMasterRequest(input: {
  providerId: string;
  studioProviderId: string;
  payload: ReturnType<typeof toScheduleEditorRequestPayload>;
}): Promise<{ id: string; created: boolean }> {
  const studio = await prisma.studio.findUnique({
    where: { providerId: input.studioProviderId },
    select: { id: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const pending = await prisma.scheduleChangeRequest.findFirst({
    where: { providerId: input.providerId, status: "PENDING" },
    select: { id: true },
  });

  if (pending) {
    await prisma.scheduleChangeRequest.update({
      where: { id: pending.id },
      data: {
        payloadJson: input.payload,
      },
    });
    return { id: pending.id, created: false };
  }

  const created = await prisma.scheduleChangeRequest.create({
    data: {
      studioId: studio.id,
      providerId: input.providerId,
      payloadJson: input.payload,
      status: "PENDING",
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

async function buildResponse(input: {
  providerId: string;
  mode: ActorMode;
  lastAction?: ApprovalInfo["lastAction"];
}): Promise<RouteResponse> {
  const snapshot = await buildScheduleSnapshot(input.providerId);
  const approval: ApprovalInfo = {
    mode: input.mode,
    requestStatus: null,
    pendingRequestId: null,
    rejectedComment: null,
    ...(input.lastAction ? { lastAction: input.lastAction } : {}),
  };

  if (input.mode === "STUDIO_MASTER") {
    const status = await loadStudioMasterStatus(input.providerId);
    approval.requestStatus = status.requestStatus;
    approval.pendingRequestId = status.pendingRequestId;
    approval.rejectedComment = status.rejectedComment;
  }

  return {
    ...snapshot,
    approval,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const actor = await resolveTargetProvider(req, user.id);
    const data = await buildResponse({
      providerId: actor.providerId,
      mode: actor.mode,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/master/schedule failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/master/schedule",
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
    const actor = await resolveTargetProvider(req, user.id);

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || typeof body !== "object") {
      throw new AppError("Invalid body", 400, "INVALID_BODY");
    }

    const currentSnapshot = await buildScheduleSnapshot(actor.providerId);
    const currentState = buildNormalizedState(buildCurrentState(currentSnapshot));
    const nextState = applyPatchToState(currentSnapshot, body);
    const hasChanges = serializeScheduleState(currentState) !== serializeScheduleState(nextState);

    if (!hasChanges) {
      const data = await buildResponse({
        providerId: actor.providerId,
        mode: actor.mode,
        lastAction: "NO_CHANGES",
      });
      return jsonOk(data);
    }

    if (actor.mode === "SOLO_MASTER" && body.exception !== undefined) {
      const normalizedException = normalizeExceptionInput(body.exception);
      if (!normalizedException.isWorkday) {
        const conflicts = await listDayOffConflicts({
          providerId: actor.providerId,
          dateKey: normalizedException.date,
          timezone: currentSnapshot.timezone,
        });
        if (conflicts.length > 0) {
          const resolution = parseDayOffConflictResolution(body.dayOffConflictResolution);
          assertConflictResolution({ conflicts, resolution });
          await cancelConflictingBookings({ conflicts, req });
        }
      }
    }

    if (actor.mode === "STUDIO_MASTER") {
      if (!actor.studioProviderId) {
        throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
      }
      const requestPayload = toScheduleEditorRequestPayload(nextState);
      const requestResult = await upsertStudioMasterRequest({
        providerId: actor.providerId,
        studioProviderId: actor.studioProviderId,
        payload: requestPayload,
      });
      if (requestResult.created) {
        try {
          const createdRequest = await loadScheduleRequestWithRelations(requestResult.id);
          if (createdRequest) {
            await notifyScheduleRequestSubmitted(createdRequest);
          }
        } catch (error) {
          logError("PATCH /api/cabinet/master/schedule request notification failed", {
            requestId: getRequestId(req),
            route: "PATCH /api/cabinet/master/schedule",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      }
      const data = await buildResponse({
        providerId: actor.providerId,
        mode: actor.mode,
        lastAction: requestResult.created ? "REQUEST_CREATED" : "REQUEST_UPDATED",
      });
      return jsonOk(data);
    }

    await applyScheduleSnapshot(actor.providerId, nextState);

    if (actor.mode === "STUDIO_ADMIN" && actor.studioProviderId) {
      try {
        await notifyMasterScheduleUpdatedByStudio({
          providerId: actor.providerId,
          studioProviderId: actor.studioProviderId,
        });
      } catch (error) {
        logError("PATCH /api/cabinet/master/schedule direct-apply notification failed", {
          requestId: getRequestId(req),
          route: "PATCH /api/cabinet/master/schedule",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    const data = await buildResponse({
      providerId: actor.providerId,
      mode: actor.mode,
      lastAction: "APPLIED",
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/cabinet/master/schedule failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/cabinet/master/schedule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

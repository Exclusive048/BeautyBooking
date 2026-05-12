import { StudioRole, SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createFeatureGateError } from "@/lib/billing/guards";
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
  normalizeBookingRules,
  normalizeExceptionInput,
  normalizeHotSlots,
  normalizeSlotStepMin,
  normalizeVisibility,
  normalizeWeekScheduleInput,
  serializeScheduleState,
  toScheduleEditorRequestPayload,
  type BookingRulesDto,
  type DayScheduleDto,
  type EditorExceptionInput,
  type HotSlotsDto,
  type ScheduleEditorSnapshot,
  type VisibilityDto,
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
  /** Single-row exception path used by the legacy editor (studio cabinet). */
  exception?: unknown;
  deleteException?: unknown;
  dayOffConflictResolution?: unknown;
  slotStepMin?: unknown;
  bookingRules?: unknown;
  visibility?: unknown;
  /** `null` = toggle off, object = toggle on + values, omitted = no change. */
  hotSlots?: unknown;
  /** Full-list exception replacement used by the new Exceptions tab. */
  bookingExceptions?: unknown;
  bufferBetweenBookingsMin?: unknown;
};

type SettingsPatch = {
  bookingRules: BookingRulesDto | undefined;
  visibility: VisibilityDto | undefined;
  hotSlots: HotSlotsDto | null | undefined;
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
        note: item.note ?? null,
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  };
}

function readSettingsPatch(snapshot: ScheduleEditorSnapshot, body: PatchBody): SettingsPatch {
  const bookingRules =
    body.bookingRules !== undefined
      ? normalizeBookingRules(body.bookingRules, snapshot.bookingRules)
      : undefined;
  const visibility =
    body.visibility !== undefined ? normalizeVisibility(body.visibility, snapshot.visibility) : undefined;
  let hotSlots: HotSlotsDto | null | undefined;
  if (body.hotSlots === null) {
    hotSlots = null;
  } else if (body.hotSlots !== undefined) {
    hotSlots = normalizeHotSlots(body.hotSlots);
  }
  return { bookingRules, visibility, hotSlots };
}

function settingsChanged(snapshot: ScheduleEditorSnapshot, patch: SettingsPatch): boolean {
  if (patch.bookingRules && JSON.stringify(patch.bookingRules) !== JSON.stringify(snapshot.bookingRules)) {
    return true;
  }
  if (patch.visibility && JSON.stringify(patch.visibility) !== JSON.stringify(snapshot.visibility)) {
    return true;
  }
  if (patch.hotSlots !== undefined && JSON.stringify(patch.hotSlots) !== JSON.stringify(snapshot.hotSlots)) {
    return true;
  }
  return false;
}

function applyPatchToState(
  snapshot: ScheduleEditorSnapshot,
  body: PatchBody
): {
  weekSchedule: DayScheduleDto[];
  exceptions: EditorExceptionInput[];
  slotStepMin: number;
  bufferBetweenBookingsMin: number;
} {
  const current = buildCurrentState(snapshot);
  let nextWeek = current.weekSchedule;
  let nextExceptions = [...current.exceptions];
  let nextSlotStep = snapshot.slotStepMin;
  let nextBuffer = snapshot.bufferBetweenBookingsMin;

  if (body.weekSchedule !== undefined) {
    nextWeek = normalizeWeekScheduleInput(body.weekSchedule);
  }

  // Full-list replacement (new path used by Exceptions tab). Keys earlier
  // legacy single-row mutations are applied on top of this.
  if (body.bookingExceptions !== undefined) {
    if (!Array.isArray(body.bookingExceptions)) {
      throw new AppError("Invalid body", 400, "INVALID_BODY");
    }
    nextExceptions = body.bookingExceptions.map((raw) => {
      const normalized = normalizeExceptionInput(raw);
      // The new path doesn't carry stable IDs from the client; matching by
      // date is sufficient because date is unique per provider.
      return { ...normalized, id: undefined };
    });
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

  if (body.slotStepMin !== undefined) {
    nextSlotStep = normalizeSlotStepMin(body.slotStepMin);
  }

  if (body.bufferBetweenBookingsMin !== undefined) {
    if (typeof body.bufferBetweenBookingsMin !== "number") {
      throw new AppError("Invalid body", 400, "INVALID_BODY");
    }
    nextBuffer = body.bufferBetweenBookingsMin;
  }

  return {
    ...buildNormalizedState({ weekSchedule: nextWeek, exceptions: nextExceptions }),
    slotStepMin: nextSlotStep,
    bufferBetweenBookingsMin: nextBuffer,
  };
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
    const slotStepChanged = nextState.slotStepMin !== currentSnapshot.slotStepMin;
    const bufferChanged =
      nextState.bufferBetweenBookingsMin !== currentSnapshot.bufferBetweenBookingsMin;
    const settingsPatch = readSettingsPatch(currentSnapshot, body);
    const settingsChangedNow = settingsChanged(currentSnapshot, settingsPatch);
    const hasChanges =
      serializeScheduleState(currentState) !== serializeScheduleState(nextState) ||
      slotStepChanged ||
      bufferChanged ||
      settingsChangedNow;

    // Hot Slots are PRO+ only. Frontend hides the toggle for non-PRO plans
    // but the backend re-checks here in case the request was crafted by
    // hand. STUDIO_MASTER never reaches this branch (their flow uses the
    // change-request payload, which doesn't carry hotSlots).
    const hotSlotsTouched =
      settingsPatch.hotSlots !== undefined &&
      JSON.stringify(settingsPatch.hotSlots) !== JSON.stringify(currentSnapshot.hotSlots);
    if (hotSlotsTouched && actor.mode !== "STUDIO_MASTER") {
      const scope =
        actor.mode === "STUDIO_ADMIN" ? SubscriptionScope.STUDIO : SubscriptionScope.MASTER;
      const plan = await getCurrentPlan(user.id, scope);
      if (!plan.features.hotSlots) {
        throw createFeatureGateError("hotSlots", "PRO");
      }
    }

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

    await applyScheduleSnapshot(actor.providerId, {
      weekSchedule: nextState.weekSchedule,
      exceptions: nextState.exceptions,
      slotStepMin: nextState.slotStepMin,
      bufferBetweenBookingsMin: nextState.bufferBetweenBookingsMin,
      bookingRules: settingsPatch.bookingRules,
      visibility: settingsPatch.visibility,
      hotSlots: settingsPatch.hotSlots,
    });

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

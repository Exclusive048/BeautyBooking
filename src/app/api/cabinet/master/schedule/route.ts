import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderContext } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
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

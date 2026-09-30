import { SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createFeatureGateError } from "@/lib/billing/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { resolveScheduleActor, type ScheduleActorMode } from "@/lib/schedule/schedule-actor";
import {
  applyScheduleSnapshotTx,
  buildScheduleSnapshot,
  normalizeBookingRules,
  normalizeExceptionInput,
  normalizeHotSlots,
  normalizeSlotStepMin,
  normalizeVisibility,
  normalizeWeekScheduleInput,
  SCHEDULE_SNAPSHOT_TX_OPTIONS,
  serializeScheduleState,
  type BookingRulesDto,
  type DayScheduleDto,
  type EditorExceptionInput,
  type HotSlotsDto,
  type ScheduleEditorSnapshot,
  type VisibilityDto,
} from "@/lib/schedule/editor";
import { notifyMasterScheduleUpdatedByStudio } from "@/lib/notifications/studio-notifications";
import type { CalendarPaintAction } from "@/lib/schedule/calendar-shared";
import {
  exceptionsToDayChanges,
  submitStudioScheduleChange,
  type ScheduleChangeOutcome,
} from "@/lib/schedule/change-requests";
import { weekSignature } from "@/lib/schedule/patterns";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { updateMasterProfile } from "@/lib/master/profile.service";

export const runtime = "nodejs";

type PatchBody = {
  weekSchedule?: unknown;
  /** Single-row exception path used by the legacy editor (studio cabinet). */
  exception?: unknown;
  deleteException?: unknown;
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

type ActorMode = ScheduleActorMode;

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
      throw new AppError("Проверьте правильность заполнения полей.", 400, "INVALID_BODY");
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
      throw new AppError("Проверьте правильность заполнения полей.", 400, "INVALID_BODY");
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
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
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
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const actor = await resolveScheduleActor(req, user.id);

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || typeof body !== "object") {
      throw new AppError("Проверьте правильность заполнения полей.", 400, "INVALID_BODY");
    }

    const currentSnapshot = await buildScheduleSnapshot(actor.providerId);
    const currentState = buildNormalizedState(buildCurrentState(currentSnapshot));
    const nextState = applyPatchToState(currentSnapshot, body);
    const slotStepChanged = nextState.slotStepMin !== currentSnapshot.slotStepMin;
    const bufferChanged =
      nextState.bufferBetweenBookingsMin !== currentSnapshot.bufferBetweenBookingsMin;
    const settingsPatch = readSettingsPatch(currentSnapshot, body);

    // STUDIO-PAUSE-SPLIT-01: `isPublished` — ЛИЧНАЯ страница мастера, и её
    // видимость решает только он сам. Администратор студии этим полем больше не
    // управляет (его рычаг — пауза в студии, `studioPaused`, раздел «Мастера»),
    // а мастер студии меняет её напрямую, без заявки: заявка согласует рабочее
    // время, своя страница предметом согласования не является (раньше поле
    // молча выпадало из заявки, и переключатель у мастера студии не работал).
    // После обработки поле нейтрализуется в патче — иначе оно считалось бы
    // изменением расписания и порождало пустую заявку.
    if (settingsPatch.visibility) {
      const currentPublished = currentSnapshot.visibility.isPublished;
      if (
        actor.mode === "STUDIO_MASTER" &&
        !actor.studioProfile &&
        settingsPatch.visibility.isPublished !== currentPublished
      ) {
        await updateMasterProfile(actor.providerId, { isPublished: settingsPatch.visibility.isPublished });
      }
      if (actor.mode !== "SOLO_MASTER") {
        settingsPatch.visibility = { ...settingsPatch.visibility, isPublished: currentPublished };
      }
    }

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

    // SCHEDULE-PATTERNS-01 (этап 3, решение владельца 2026-09-28): выходной на
    // день с записями записи НЕ отменяет — перенос и отмена на совести мастера.
    // Прежний принудительный шаг «подтвердите отмену записей» (409
    // `SCHEDULE_DAY_OFF_CONFLICT`, LOGIC-13) снят вместе с отменами внутри
    // записи расписания: у пути больше нет побочных эффектов на записи.
    if (actor.mode === "STUDIO_MASTER") {
      if (!actor.studioProviderId) {
        throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
      }
      // SCHEDULE-STUDIO-PROFILE-CALENDAR: правки копятся в открытой заявке —
      // неделя «Часов» и изменённые «Особые дни» (как правки дней), а не
      // заменяют её целиком. Правила записи и видимость профиля в студии
      // заявкой не согласуются (раньше они молча выпадали из тела заявки).
      const outcomes: ScheduleChangeOutcome[] = [];
      const route = "PATCH /api/cabinet/master/schedule";
      if (weekSignature(nextState.weekSchedule) !== weekSignature(currentState.weekSchedule)) {
        outcomes.push(
          await submitStudioScheduleChange({
            req,
            route,
            providerId: actor.providerId,
            studioProviderId: actor.studioProviderId,
            change: { kind: "week", week: nextState.weekSchedule },
          }),
        );
      }
      const todayKey = toLocalDateKey(new Date(), currentSnapshot.timezone);
      const dayGroups = new Map<string, { action: CalendarPaintAction; dates: string[] }>();
      for (const day of exceptionsToDayChanges(currentState.exceptions, nextState.exceptions, todayKey)) {
        const key = JSON.stringify(day.action);
        const group = dayGroups.get(key) ?? { action: day.action, dates: [] };
        group.dates.push(day.date);
        dayGroups.set(key, group);
      }
      for (const group of dayGroups.values()) {
        outcomes.push(
          await submitStudioScheduleChange({
            req,
            route,
            providerId: actor.providerId,
            studioProviderId: actor.studioProviderId,
            change: { kind: "days", dates: group.dates, action: group.action },
          }),
        );
      }
      const data = await buildResponse({
        providerId: actor.providerId,
        mode: actor.mode,
        lastAction: outcomes.includes("created")
          ? "REQUEST_CREATED"
          : outcomes.some((outcome) => outcome !== "unchanged")
            ? "REQUEST_UPDATED"
            : "NO_CHANGES",
      });
      return jsonOk(data);
    }

    await prisma.$transaction(
      (tx) =>
        applyScheduleSnapshotTx(tx, actor.providerId, {
          weekSchedule: nextState.weekSchedule,
          exceptions: nextState.exceptions,
          slotStepMin: nextState.slotStepMin,
          bufferBetweenBookingsMin: nextState.bufferBetweenBookingsMin,
          bookingRules: settingsPatch.bookingRules,
          visibility: settingsPatch.visibility,
          hotSlots: settingsPatch.hotSlots,
        }),
      SCHEDULE_SNAPSHOT_TX_OPTIONS,
    );

    // Инвалидация — строго после коммита: до него кэш сбрасывать не на что, а
    // откат оставил бы его вычищенным под старые данные.
    await invalidateSlotsForMaster(actor.providerId);

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

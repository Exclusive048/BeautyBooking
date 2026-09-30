import "server-only";

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  loadScheduleRequestWithRelations,
  notifyScheduleRequestSubmitted,
} from "@/lib/notifications/studio-notifications";
import { prisma } from "@/lib/prisma";
import { paintScheduleDaysTx, calendarDayFromPlan } from "@/lib/schedule/calendar";
import type { CalendarPaintAction } from "@/lib/schedule/calendar-shared";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { loadDayPlans } from "@/lib/schedule/day-plans";
import {
  SCHEDULE_SNAPSHOT_TX_OPTIONS,
  isScheduleEditorRequestPayload,
  normalizeExceptionInput,
  normalizeScheduleEditorRequestPayload,
  normalizeWeekScheduleInput,
  parseDateKeyToUtcStart,
  readScheduleExceptionsTx,
  type ScheduleExceptionDto,
} from "@/lib/schedule/editor";
import { applyPatternRequestTx, patternRequestForApproval } from "@/lib/schedule/pattern-apply";
import { loadSchedulePlan, readWeekRepresentation, saveWeekAsPatternTx, weekSignature } from "@/lib/schedule/patterns";
import { isPatternChangeRequestPayload } from "@/lib/schedule/patterns-shared";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import {
  emptyScheduleChanges,
  isEmptyScheduleChanges,
  isScheduleChangesPayload,
  mergeScheduleChange,
  type ReviewDayState,
  type ScheduleChange,
  type ScheduleChangesPayload,
  type ScheduleDayChange,
  type ScheduleRequestReview,
} from "@/lib/schedule/schedule-changes-shared";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * Заявка мастера на расписание В СТУДИИ (профиль в студии правится только
 * через студию). У профиля одна открытая заявка, и с SCHEDULE-STUDIO-PROFILE-
 * CALENDAR правки в ней КОПЯТСЯ (`CHANGES_V1`, `schedule-changes-shared.ts`):
 * неделя из «Часов» или график из окна плюс дни календаря. Уведомление студии —
 * только о новой заявке; правка, которая свела заявку к нулю, её отзывает.
 *
 * Прежние форматы (`EDITOR_V1` — неделя и полный список «Особых дней»,
 * `PATTERN_V1` — график) больше не создаются; открытая заявка такого формата
 * при следующей правке переносится в новый без потери содержимого.
 */

type Db = Prisma.TransactionClient;

type TimezoneRow = { timezone: string };

async function loadTimezone(db: Db, providerId: string): Promise<string> {
  const provider: TimezoneRow | null = await db.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  if (!provider) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  return provider.timezone;
}

function exceptionSignature(item: Omit<ScheduleExceptionDto, "id">): string {
  return JSON.stringify(normalizeExceptionInput(item));
}

/**
 * Разница двух списков «Особых дней» → правки дней календаря. Прошедшие даты
 * не в счёт (одобрение их всё равно пропустит). Фиксированное время дня
 * переносится как «свои часы» с временами приёма.
 */
export function exceptionsToDayChanges(
  current: ReadonlyArray<Omit<ScheduleExceptionDto, "id">>,
  next: ReadonlyArray<Omit<ScheduleExceptionDto, "id">>,
  todayKey: string,
): ScheduleDayChange[] {
  const currentByDate = new Map(current.map((item) => [item.date, item]));
  const nextDates = new Set<string>();
  const changes: ScheduleDayChange[] = [];

  for (const raw of next) {
    const item = normalizeExceptionInput(raw);
    nextDates.add(item.date);
    if (item.date < todayKey) continue;
    const before = currentByDate.get(item.date);
    if (before && exceptionSignature(before) === JSON.stringify(item)) continue;
    let action: CalendarPaintAction;
    if (!item.isWorkday) {
      action = { kind: "off" };
    } else if (item.scheduleMode === "FIXED") {
      action = {
        kind: "hours",
        startTime: item.startTime ?? "00:00",
        endTime: item.endTime ?? "23:55",
        breaks: [],
        fixedSlotTimes: item.fixedSlotTimes,
      };
    } else {
      action = { kind: "hours", startTime: item.startTime ?? "", endTime: item.endTime ?? "", breaks: item.breaks };
    }
    changes.push({ date: item.date, action });
  }
  for (const item of current) {
    if (item.date >= todayKey && !nextDates.has(item.date)) changes.push({ date: item.date, action: { kind: "reset" } });
  }
  return changes.sort((left, right) => left.date.localeCompare(right.date));
}

/** Тело открытой заявки любого формата → набор правок. */
export async function toScheduleChangesPayload(
  db: Db,
  providerId: string,
  raw: unknown,
  now = new Date(),
): Promise<ScheduleChangesPayload> {
  if (isScheduleChangesPayload(raw)) return { ...emptyScheduleChanges(), ...raw };
  if (isPatternChangeRequestPayload(raw)) return { ...emptyScheduleChanges(), pattern: raw.request };
  if (isScheduleEditorRequestPayload(raw)) {
    const normalized = normalizeScheduleEditorRequestPayload(raw);
    const timezone = await loadTimezone(db, providerId);
    const todayKey = toLocalDateKey(now, timezone);
    const [current, currentWeek] = await Promise.all([
      readScheduleExceptionsTx(db, providerId, timezone),
      readWeekRepresentation(db, providerId, todayKey),
    ]);
    // Старый формат нёс неделю ВСЕГДА, даже если менялись только «Особые дни»:
    // совпадает с действующей — это не изменение, студии её не показываем.
    const weekChanged = weekSignature(normalized.weekSchedule) !== weekSignature(currentWeek.week);
    return {
      ...emptyScheduleChanges(),
      week: weekChanged ? normalized.weekSchedule : null,
      days: exceptionsToDayChanges(current, normalized.exceptions, todayKey),
    };
  }
  return emptyScheduleChanges();
}

/** Открытая заявка профиля (в новом формате) — для календаря и окна мастера. */
export async function loadPendingScheduleChanges(providerId: string): Promise<ScheduleChangesPayload | null> {
  const pending = await prisma.scheduleChangeRequest.findFirst({
    where: { providerId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  if (!pending) return null;
  const payload = await toScheduleChangesPayload(prisma, providerId, pending.payloadJson);
  return isEmptyScheduleChanges(payload) ? null : payload;
}

export type ScheduleChangeOutcome = "created" | "updated" | "withdrawn" | "unchanged";

/**
 * Правка мастера на профиле в студии → открытая заявка. Новая заявка
 * создаётся (студии — уведомление), существующая дополняется; правка, после
 * которой в заявке ничего не осталось, заявку отзывает.
 */
export async function submitStudioScheduleChange(input: {
  req: Request;
  route: string;
  providerId: string;
  studioProviderId: string;
  change: ScheduleChange;
  now?: Date;
}): Promise<ScheduleChangeOutcome> {
  const studio = await prisma.studio.findUnique({
    where: { providerId: input.studioProviderId },
    select: { id: true },
  });
  if (!studio) throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  const pending = await prisma.scheduleChangeRequest.findFirst({
    where: { providerId: input.providerId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, payloadJson: true },
  });
  const payload = pending
    ? await toScheduleChangesPayload(prisma, input.providerId, pending.payloadJson, input.now)
    : emptyScheduleChanges();

  // «Как по графику» — изменение, только если у даты в расписании есть своя правка.
  let overriddenDates = new Set<string>();
  if (input.change.kind === "days" && input.change.dates.length > 0) {
    const rows = await prisma.scheduleOverride.findMany({
      where: {
        providerId: input.providerId,
        date: { in: input.change.dates.map((date) => parseDateKeyToUtcStart(date)) },
      },
      select: { date: true },
    });
    overriddenDates = new Set(rows.map((row) => row.date.toISOString().slice(0, 10)));
  }
  const merged = mergeScheduleChange(payload, input.change, { overriddenDates });

  if (isEmptyScheduleChanges(merged)) {
    if (!pending) return "unchanged";
    await prisma.scheduleChangeRequest.delete({ where: { id: pending.id } });
    return "withdrawn";
  }
  const payloadJson = merged as unknown as Prisma.InputJsonValue;
  if (pending) {
    await prisma.scheduleChangeRequest.update({ where: { id: pending.id }, data: { payloadJson } });
    return "updated";
  }

  const created = await prisma.scheduleChangeRequest.create({
    data: { studioId: studio.id, providerId: input.providerId, payloadJson, status: "PENDING" },
    select: { id: true },
  });
  try {
    const createdRequest = await loadScheduleRequestWithRelations(created.id);
    if (createdRequest) await notifyScheduleRequestSubmitted(createdRequest);
  } catch (error) {
    logError(`${input.route} request notification failed`, {
      requestId: getRequestId(input.req),
      route: input.route,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  return "created";
}

/**
 * Одобрение заявки нового формата: неделя или график, затем дни — одной
 * транзакцией. Заявка могла пролежать: прошедшие дни пропускаются, дата начала
 * графика сдвигается на сегодня (`patternRequestForApproval`). Рабочий день
 * палитры, который удалили после отправки, — повод отправить заявку заново.
 */
export async function applyScheduleChangesRequest(providerId: string, raw: unknown, now = new Date()): Promise<void> {
  const timezone = await loadTimezone(prisma, providerId);
  const todayKey = toLocalDateKey(now, timezone);
  const lastKey = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  const payload = await toScheduleChangesPayload(prisma, providerId, raw, now);
  const days = payload.days.filter((day) => day.date >= todayKey && day.date <= lastKey);
  const groups = new Map<string, { action: CalendarPaintAction; dates: string[] }>();
  for (const day of days) {
    const key = JSON.stringify(day.action);
    const group = groups.get(key) ?? { action: day.action, dates: [] };
    group.dates.push(day.date);
    groups.set(key, group);
  }

  await prisma.$transaction(async (tx: Db) => {
    if (payload.week) await saveWeekAsPatternTx(tx, providerId, normalizeWeekScheduleInput(payload.week));
    if (payload.pattern) {
      await applyPatternRequestTx(tx, providerId, patternRequestForApproval(payload.pattern, todayKey), todayKey);
    }
    for (const group of groups.values()) {
      if (group.action.kind === "template") {
        const exists = await tx.scheduleTemplate.count({ where: { id: group.action.templateId, providerId } });
        if (exists === 0) {
          throw new AppError(
            "Рабочий день из заявки удалён. Попросите мастера отправить заявку заново.",
            422,
            "INVALID_REQUEST_PAYLOAD",
          );
        }
      }
      await paintScheduleDaysTx(tx, providerId, group.dates, group.action);
    }
  }, SCHEDULE_SNAPSHOT_TX_OPTIONS);

  await invalidateSlotsForMaster(providerId);
}

/**
 * «Было / стало» для карточки заявки: действующий график и будущие дни заявки —
 * тем же движком, что режет окошки. `null` — у заявки старого формата недели и
 * «Особых дней» своя карточка.
 */
export async function buildScheduleRequestReview(
  providerId: string,
  raw: unknown,
  now = new Date(),
): Promise<ScheduleRequestReview | null> {
  if (!isScheduleChangesPayload(raw) && !isPatternChangeRequestPayload(raw)) return null;
  const payload = await toScheduleChangesPayload(prisma, providerId, raw, now);
  const plan = await loadSchedulePlan(providerId, now);
  const templatesById = new Map(plan.templates.map((template) => [template.id, template]));
  const days = payload.days.filter((day) => day.date >= plan.todayKey);

  const plans =
    days.length > 0
      ? await loadDayPlans({
          providerIds: [providerId],
          fromKey: days[0]!.date,
          toKeyExclusive: addDaysToDateKey(days[days.length - 1]!.date, 1),
          now,
        })
      : new Map();
  const lastKey = addDaysToDateKey(plan.todayKey, SCHEDULE_HORIZON_DAYS);

  return {
    currentPattern: plan.current,
    currentTemplates: plan.templates,
    days: days.map((day) => {
      const current = calendarDayFromPlan(plans.get(providerId)?.get(day.date), day.date, {
        todayKey: plan.todayKey,
        lastKey,
        bookings: 0,
      });
      const before: ReviewDayState = {
        isWorking: current.isWorking,
        start: current.start,
        end: current.end,
        fixed: current.fixed,
        name: current.templateId ? templatesById.get(current.templateId)?.name ?? null : null,
      };
      return { date: day.date, before, after: reviewAfterState(day.action, templatesById) };
    }),
  };
}

function reviewAfterState(
  action: CalendarPaintAction,
  templatesById: Map<string, { name: string | null; startTime: string; endTime: string; scheduleMode: string; fixedSlotTimes: string[] }>,
): ReviewDayState | null {
  if (action.kind === "reset") return null;
  if (action.kind === "off") return { isWorking: false, start: null, end: null, fixed: false, name: null };
  if (action.kind === "hours") {
    const fixedTimes = action.fixedSlotTimes ?? [];
    return fixedTimes.length > 0
      ? { isWorking: true, start: fixedTimes[0]!, end: fixedTimes[fixedTimes.length - 1]!, fixed: true, name: null }
      : { isWorking: true, start: action.startTime, end: action.endTime, fixed: false, name: null };
  }
  const template = templatesById.get(action.templateId);
  if (!template) return { isWorking: true, start: null, end: null, fixed: false, name: null };
  const fixed = template.scheduleMode === "FIXED";
  return {
    isWorking: true,
    start: fixed ? template.fixedSlotTimes[0] ?? null : template.startTime,
    end: fixed ? template.fixedSlotTimes[template.fixedSlotTimes.length - 1] ?? null : template.endTime,
    fixed,
    name: template.name,
  };
}

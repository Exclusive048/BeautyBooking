import "server-only";

import { ProviderType, type Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { prisma } from "@/lib/prisma";
import {
  MAX_PALETTE_DAYS,
  PALETTE_LABEL_MAX,
  isScheduleDayColorKey,
  type CalendarDayDto,
  type CalendarPaintAction,
  type CalendarRequestAction,
  type CalendarStudioDayDto,
  type PaletteDayInput,
  type ScheduleCalendarDto,
  type ScheduleDayColorKey,
} from "@/lib/schedule/calendar-shared";
import { addDaysToDateKey, dateFromLocalDateKey, isDateKey, listDateKeysExclusive } from "@/lib/schedule/dateKey";
import { dayPlanHours, loadDayPlans } from "@/lib/schedule/day-plans";
import {
  SCHEDULE_SNAPSHOT_TX_OPTIONS,
  normalizeExceptionInput,
  parseDateKeyToUtcStart,
  removeScheduleExceptionTx,
  saveScheduleExceptionTx,
} from "@/lib/schedule/editor";
import { normalizeDayTemplateInput } from "@/lib/schedule/pattern-request";
import { loadPeriodsTx, periodTemplateIdOn } from "@/lib/schedule/patterns";
import { ensurePaletteTemplateTx, ensurePatternHistoryTx } from "@/lib/schedule/patterns-core";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import type { DayPlan } from "@/lib/schedule/types";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — календарь расписания на 3 месяца и палитра
 * рабочих дней. Решения владельца 2026-09-28: календарь поверх графика, любой
 * день перекрашивается кистью палитры; палитра у каждого мастера своя, цвета
 * неяркие; записи на днях, ставших выходными, остаются (перенос и отмена — на
 * совести мастера).
 *
 * Правка даты — строка «Особого дня» (`ScheduleOverride`, одна на дату):
 *   - `template` — «в этот день — рабочий день X из палитры» (`TEMPLATE`);
 *   - `off` — выходной (`OFF`);
 *   - `hours` — свои часы на день (`TIME_RANGE`, как прежние «Особые дни»);
 *   - `reset` — «как по графику»: строка снимается.
 * Покраска, совпавшая с графиком (тот же рабочий день, выходной там, где
 * график и так выходной), строку НЕ пишет, а снимает: иначе день молча
 * «приклеился» бы к кисти и перестал следовать графику при его смене.
 *
 * Прошедшие дни и дни дальше горизонта не меняются: прошлое — история, по
 * которой работали, дальше 3 месяцев расписания нет.
 */

type Db = Prisma.TransactionClient;

/** Больше дат за раз не бывает: весь горизонт. */
const MAX_PAINT_DATES = SCHEDULE_HORIZON_DAYS + 1;

/** Записи, которые показываются в календаре: отменённые и неявки не считаются. */
const CANCELLED_STATUSES = ["REJECTED", "CANCELLED", "NO_SHOW"] as const;

function calendarError(message: string): AppError {
  return new AppError(message, 400, "SCHEDULE_PATTERN_INVALID");
}

async function loadTimezone(providerId: string): Promise<string> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  if (!provider) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  return provider.timezone;
}

function nextMonthStart(dateKey: string): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

// ─── Чтение ──────────────────────────────────────────────────────────────────

/**
 * Календарь профиля: с начала текущего месяца до конца месяца, в который
 * попадает горизонт. День считается тем же движком, что режет окошки
 * (`loadDayPlans`), даты — даты салона.
 */
export async function loadScheduleCalendar(providerId: string, now = new Date()): Promise<ScheduleCalendarDto> {
  const self = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      timezone: true,
      masterProfile: { select: { id: true } },
      // Этап 4: профиль того же человека в студии — его рабочие дни личный
      // календарь показывает только для чтения. Только у личного профиля.
      owner: {
        select: {
          providers: {
            where: {
              type: ProviderType.MASTER,
              masterProfile: { is: null },
              studioId: { not: null },
              NOT: { id: providerId },
            },
            select: { id: true, studio: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });
  if (!self) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  const timezone = self.timezone;
  const studioProfile = self.masterProfile ? self.owner?.providers[0] ?? null : null;
  const todayKey = toLocalDateKey(now, timezone);
  const fromKey = `${todayKey.slice(0, 7)}-01`;
  const lastKey = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  const toKeyExclusive = nextMonthStart(lastKey);

  const [plans, bookings] = await Promise.all([
    loadDayPlans({
      providerIds: studioProfile ? [providerId, studioProfile.id] : [providerId],
      fromKey,
      toKeyExclusive,
      now,
    }),
    // Записи ЭТОГО профиля: календарь — расписание профиля, а расписания у
    // профилей мастера раздельные (STUDIO-MASTER-PROFILES).
    prisma.booking.findMany({
      where: {
        AND: [
          masterPerformedBookingWhere(providerId),
          {
            startAtUtc: {
              gte: dateFromLocalDateKey(fromKey, timezone, 0, 0),
              lt: dateFromLocalDateKey(toKeyExclusive, timezone, 0, 0),
            },
            status: { notIn: [...CANCELLED_STATUSES] },
          },
        ],
      },
      select: { startAtUtc: true },
    }),
  ]);

  const bookingsByDate = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const key = toLocalDateKey(booking.startAtUtc, timezone);
    bookingsByDate.set(key, (bookingsByDate.get(key) ?? 0) + 1);
  }

  const providerPlans = plans.get(providerId);
  const days = listDateKeysExclusive(fromKey, toKeyExclusive).map((date) =>
    calendarDayFromPlan(providerPlans?.get(date), date, {
      todayKey,
      lastKey,
      bookings: bookingsByDate.get(date) ?? 0,
    }),
  );

  let studio: ScheduleCalendarDto["studio"] = null;
  if (studioProfile) {
    const studioPlans = plans.get(studioProfile.id);
    const studioDays: Record<string, CalendarStudioDayDto> = {};
    for (const date of listDateKeysExclusive(fromKey, toKeyExclusive)) {
      const day = calendarDayFromPlan(studioPlans?.get(date), date, { todayKey, lastKey, bookings: 0 });
      if (day.isWorking) studioDays[date] = { start: day.start, end: day.end, fixed: day.fixed };
    }
    studio = { name: studioProfile.studio?.name ?? "", days: studioDays };
  }

  return { timezone, pending: null, studio, todayKey, fromKey, lastKey, days };
}

/** День движка → день календаря. Общий для календаря профиля и «Графика команды». */
export function calendarDayFromPlan(
  plan: DayPlan | undefined,
  date: string,
  input: { todayKey: string; lastKey: string; bookings: number },
): CalendarDayDto {
  const beyond = date > input.lastKey;
  const isWorking = !beyond && Boolean(plan?.isWorking);
  const fixed = isWorking && Array.isArray(plan?.fixedStarts);
  const hours = dayPlanHours(plan);
  const fixedStarts = plan?.fixedStarts ?? [];
  return {
    date,
    past: date < input.todayKey,
    beyond,
    isWorking,
    start: isWorking ? (fixed ? fixedStarts[0] ?? null : hours.start) : null,
    end: isWorking ? (fixed ? fixedStarts[fixedStarts.length - 1] ?? null : hours.end) : null,
    fixed,
    templateId: isWorking ? plan?.meta.templateId ?? null : null,
    painted: plan?.meta.source === "override",
    bookings: input.bookings,
  };
}

// ─── Покраска дней ───────────────────────────────────────────────────────────

/** Даты покраски: без повторов, не в прошлом и не дальше горизонта. Общая для покраски и заявки студии. */
export function validateCalendarDates(dates: string[], todayKey: string): string[] {
  return validatePaintDates(dates, todayKey, addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS));
}

function validatePaintDates(dates: string[], todayKey: string, lastKey: string): string[] {
  const unique = Array.from(new Set(dates)).sort();
  if (unique.length === 0 || unique.length > MAX_PAINT_DATES) {
    throw calendarError("Выберите дни в календаре.");
  }
  for (const date of unique) {
    if (!isDateKey(date) || date < todayKey || date > lastKey) {
      throw calendarError("Прошедшие дни и дни дальше 3 месяцев изменить нельзя.");
    }
  }
  return unique;
}

type PaletteTemplateRow = {
  id: string;
  startLocal: string;
  endLocal: string;
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotTimes: string[];
};

/**
 * «В этот день — рабочий день X». Часы и режим копируются и на саму строку:
 * если рабочий день потом удалят (прошлые дни держат ссылку через `SetNull`),
 * прошедший день сохранит свои часы и режим.
 */
async function saveTemplateDayTx(tx: Db, providerId: string, dateKey: string, template: PaletteTemplateRow) {
  const date = parseDateKeyToUtcStart(dateKey);
  const fields = {
    kind: "TEMPLATE" as const,
    isDayOff: false,
    isWorkday: true,
    startLocal: template.startLocal,
    endLocal: template.endLocal,
    templateId: template.id,
    isActive: true,
    scheduleMode: template.scheduleMode,
    fixedSlotTimes: template.scheduleMode === "FIXED" ? template.fixedSlotTimes : [],
    note: null,
  };
  await tx.scheduleOverride.upsert({
    where: { providerId_date: { providerId, date } },
    update: fields,
    create: { providerId, date, ...fields },
  });
  // Перерывы такого дня — перерывы рабочего дня палитры, свои не нужны.
  await tx.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
}

/** Покрасить дни. Инвалидация кэша — после коммита. */
export async function paintScheduleDays(
  providerId: string,
  input: { dates: string[]; action: CalendarPaintAction },
  now = new Date(),
): Promise<void> {
  const timezone = await loadTimezone(providerId);
  const dates = validateCalendarDates(input.dates, toLocalDateKey(now, timezone));
  await prisma.$transaction(
    (tx: Db) => paintScheduleDaysTx(tx, providerId, dates, input.action),
    SCHEDULE_SNAPSHOT_TX_OPTIONS,
  );
  await invalidateSlotsForMaster(providerId);
}

/**
 * Покраска внутри ЧУЖОЙ транзакции (одобрение заявки студии красит дни вместе
 * с графиком — одной транзакцией). Даты — уже проверенные
 * (`validateCalendarDates`); инвалидацию кэша делает вызывающий.
 */
export async function paintScheduleDaysTx(
  tx: Db,
  providerId: string,
  dates: string[],
  action: CalendarPaintAction,
): Promise<void> {
  // Свои часы — тот же нормализатор, что у «Особых дней» (часы, перерывы,
  // фиксированное время).
  const fixed = action.kind === "hours" && (action.fixedSlotTimes?.length ?? 0) > 0;
  const hours =
    action.kind === "hours"
      ? normalizeExceptionInput({
          date: dates[0],
          isWorkday: true,
          scheduleMode: fixed ? "FIXED" : "FLEXIBLE",
          startTime: action.startTime,
          endTime: action.endTime,
          breaks: fixed ? [] : action.breaks,
          fixedSlotTimes: fixed ? action.fixedSlotTimes : [],
        })
      : null;

  // Профиль без графика (перенос недели ещё не прошёл): «как по графику»
  // обязано означать неделю профиля, поэтому она сначала становится периодом.
  await ensurePatternHistoryTx(tx, providerId);
  const periods = await loadPeriodsTx(tx, providerId);

  let template: PaletteTemplateRow | null = null;
  if (action.kind === "template") {
    template = await tx.scheduleTemplate.findFirst({
      where: { id: action.templateId, providerId },
      select: { id: true, startLocal: true, endLocal: true, scheduleMode: true, fixedSlotTimes: true },
    });
    if (!template) throw calendarError("Этот рабочий день удалён. Обновите страницу.");
  }

  for (const date of dates) {
    const scheduled = periodTemplateIdOn(periods, date);
    const sameAsSchedule =
      action.kind === "reset" ||
      (action.kind === "template" && scheduled === action.templateId) ||
      (action.kind === "off" && scheduled === null);
    if (sameAsSchedule) {
      await removeScheduleExceptionTx(tx, providerId, date);
    } else if (action.kind === "template" && template) {
      await saveTemplateDayTx(tx, providerId, date, template);
    } else if (action.kind === "off") {
      await saveScheduleExceptionTx(tx, providerId, {
        date,
        isWorkday: false,
        scheduleMode: "FLEXIBLE",
        startTime: null,
        endTime: null,
        breaks: [],
        fixedSlotTimes: [],
        note: null,
      });
    } else if (hours) {
      await saveScheduleExceptionTx(tx, providerId, { ...hours, date });
    }
  }
}

/**
 * Правка дней профиля в студии — не запись, а строка заявки (мастер меняет
 * расписание в студии только через студию). Те же проверки, что у покраски:
 * даты от сегодня до горизонта, рабочий день — из палитры этого профиля.
 */
export async function validateCalendarRequest(
  providerId: string,
  input: { dates: string[]; action: CalendarRequestAction },
  now = new Date(),
): Promise<string[]> {
  const timezone = await loadTimezone(providerId);
  const dates = validateCalendarDates(input.dates, toLocalDateKey(now, timezone));
  if (input.action.kind === "template") {
    const owned = await prisma.scheduleTemplate.count({ where: { id: input.action.templateId, providerId } });
    if (owned === 0) throw calendarError("Этот рабочий день удалён. Обновите страницу.");
  }
  return dates;
}

// ─── Палитра ─────────────────────────────────────────────────────────────────

function normalizeLabel(raw: string): string {
  const label = raw.trim().replace(/\s+/g, " ");
  if (label.length === 0) throw calendarError("Назовите рабочий день.");
  if (label.length > PALETTE_LABEL_MAX) throw calendarError("Слишком длинное название.");
  return label;
}

function normalizeColor(raw: unknown): ScheduleDayColorKey {
  if (!isScheduleDayColorKey(raw)) throw calendarError("Выберите цвет.");
  return raw;
}

/**
 * Новый рабочий день палитры. Часы существующего дня не меняются никогда:
 * на него ссылаются прошедшие дни, и правка часов переписала бы историю, —
 * другие часы = новый рабочий день и перекраска.
 */
export async function createPaletteDay(providerId: string, input: PaletteDayInput): Promise<string> {
  const label = normalizeLabel(input.label);
  const color = normalizeColor(input.color);
  const definition = normalizeDayTemplateInput(input);
  return prisma.$transaction(async (tx: Db) => {
    const named = await tx.scheduleTemplate.count({ where: { providerId, label: { not: null } } });
    if (named >= MAX_PALETTE_DAYS) {
      throw new AppError(
        `В палитре уже ${MAX_PALETTE_DAYS} рабочих дней — удалите лишний.`,
        409,
        "SCHEDULE_PALETTE_FULL",
      );
    }
    return ensurePaletteTemplateTx(tx, providerId, { ...definition, label, color });
  });
}

async function findOwnTemplate(db: Db, providerId: string, templateId: string) {
  const template = await db.scheduleTemplate.findFirst({
    where: { id: templateId, providerId },
    select: { id: true },
  });
  if (!template) throw new AppError("Рабочий день не найден.", 404, "NOT_FOUND");
  return template;
}

/** Имя и цвет рабочего дня. Часы — только новым днём (см. `createPaletteDay`). */
export async function updatePaletteDay(
  providerId: string,
  templateId: string,
  input: { label?: string; color?: string },
): Promise<void> {
  const data: { label?: string; color?: ScheduleDayColorKey } = {};
  if (input.label !== undefined) data.label = normalizeLabel(input.label);
  if (input.color !== undefined) data.color = normalizeColor(input.color);
  await prisma.$transaction(async (tx: Db) => {
    await findOwnTemplate(tx, providerId, templateId);
    await tx.scheduleTemplate.update({ where: { id: templateId }, data, select: { id: true } });
  });
}

/**
 * Удалить рабочий день из палитры — только если на него не ссылаются ни
 * график (в том числе прошлый: прошлые дни молча стали бы выходными), ни
 * неделя, ни будущий день календаря.
 */
export async function deletePaletteDay(providerId: string, templateId: string, now = new Date()): Promise<void> {
  const timezone = await loadTimezone(providerId);
  const todayStart = parseDateKeyToUtcStart(toLocalDateKey(now, timezone));
  await prisma.$transaction(async (tx: Db) => {
    await findOwnTemplate(tx, providerId, templateId);
    const [patternDays, weeklyDays, futureDays] = await Promise.all([
      tx.schedulePatternDay.count({ where: { templateId } }),
      tx.weeklyScheduleDay.count({ where: { templateId } }),
      tx.scheduleOverride.count({ where: { templateId, date: { gte: todayStart } } }),
    ]);
    if (patternDays > 0 || weeklyDays > 0 || futureDays > 0) {
      throw new AppError(
        "Этот рабочий день стоит в графике или в календаре. Сначала уберите его оттуда.",
        409,
        "SCHEDULE_TEMPLATE_IN_USE",
      );
    }
    await tx.scheduleTemplate.delete({ where: { id: templateId } });
  });
}

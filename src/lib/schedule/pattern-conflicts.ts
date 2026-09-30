import "server-only";

import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { blockingBookingWhere } from "@/lib/deletion/active-bookings";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { patternPosition, type SchedulePatternDto } from "@/lib/schedule/patterns-shared";
import type { DayTemplateDefinition } from "@/lib/schedule/patterns-core";
import { timeToMinutes } from "@/lib/schedule/time";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";

export type PatternConflictReason = "DAY_OFF" | "OUTSIDE_HOURS";

export type PatternConflict = {
  bookingId: string;
  startAtUtc: string;
  endAtUtc: string;
  clientName: string | null;
  reason: PatternConflictReason;
};

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — живые записи профиля, которые новый график
 * оставляет на выходном или вне рабочих часов.
 *
 * Решение владельца (2026-09-28): такие записи ОСТАЮТСЯ — перенос и отмена на
 * совести мастера. Поэтому это не проверка, которая мешает сохранить, а список
 * «на что посмотреть»: пошаговое окно показывает его до применения, ответ на
 * применение — после.
 *
 * Дни с «Особым днём» не считаются: их решает исключение, а не график.
 * Фиксированное время границ часов не имеет (день 00:00–23:55) — такие дни
 * проверяются только на «выходной».
 */
export async function findPatternConflicts(input: {
  providerId: string;
  timezone: string;
  pattern: SchedulePatternDto & { startsOn: string };
  /** Шаблон позиции графика по индексу `pattern.days[i]`. */
  templateFor: (templateRef: string) => DayTemplateDefinition | null;
  /**
   * После `endsOn` расписания нет (график не возвращает прежний): записи в
   * днях после конца — тоже на выходных, вплоть до горизонта.
   */
  afterEndCloses: boolean;
  now?: Date;
}): Promise<PatternConflict[]> {
  const now = input.now ?? new Date();
  const todayKey = toLocalDateKey(now, input.timezone);
  const horizonKey = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  const endKey = input.pattern.endsOn;
  const lastKey = endKey === null || input.afterEndCloses ? horizonKey : endKey;
  const fromUtc = dateFromLocalDateKey(input.pattern.startsOn, input.timezone, 0, 0);
  const toUtc = dateFromLocalDateKey(addDaysToDateKey(lastKey, 1), input.timezone, 0, 0);

  const [bookings, overrides] = await Promise.all([
    prisma.booking.findMany({
      where: {
        AND: [
          masterPerformedBookingWhere(input.providerId),
          blockingBookingWhere(now),
          { startAtUtc: { gte: fromUtc, lt: toUtc } },
        ],
      },
      select: { id: true, startAtUtc: true, endAtUtc: true, clientName: true },
      orderBy: { startAtUtc: "asc" },
    }),
    prisma.scheduleOverride.findMany({
      where: {
        providerId: input.providerId,
        date: { gte: new Date(`${input.pattern.startsOn}T00:00:00.000Z`), lt: new Date(`${addDaysToDateKey(lastKey, 1)}T00:00:00.000Z`) },
      },
      select: { date: true },
    }),
  ]);
  // `ScheduleOverride.date` — UTC-полночь даты салона.
  const overrideKeys = new Set(overrides.map((row) => row.date.toISOString().slice(0, 10)));

  const conflicts: PatternConflict[] = [];
  for (const booking of bookings) {
    if (!booking.startAtUtc || !booking.endAtUtc) continue;
    const dateKey = toLocalDateKey(booking.startAtUtc, input.timezone);
    if (overrideKeys.has(dateKey)) continue;

    const afterEnd = endKey !== null && dateKey > endKey;
    const position = patternPosition(dateKey, input.pattern.anchorOn, input.pattern.cycleDays);
    const ref = afterEnd ? null : input.pattern.days[position] ?? null;
    const template = ref === null ? null : input.templateFor(ref);

    let reason: PatternConflictReason | null = null;
    if (!template) {
      reason = "DAY_OFF";
    } else if (template.scheduleMode === "FLEXIBLE") {
      const start = getLocalTimeParts(booking.startAtUtc, input.timezone);
      const end = getLocalTimeParts(booking.endAtUtc, input.timezone);
      const startMin = start.hour * 60 + start.minute;
      const sameDayEnd = toLocalDateKey(booking.endAtUtc, input.timezone) === dateKey;
      const endMin = sameDayEnd ? end.hour * 60 + end.minute : 24 * 60;
      const open = timeToMinutes(template.startTime);
      const close = timeToMinutes(template.endTime);
      if (open === null || close === null || startMin < open || endMin > close) reason = "OUTSIDE_HOURS";
    }

    if (reason) {
      conflicts.push({
        bookingId: booking.id,
        startAtUtc: booking.startAtUtc.toISOString(),
        endAtUtc: booking.endAtUtc.toISOString(),
        clientName: booking.clientName ?? null,
        reason,
      });
    }
  }
  return conflicts;
}

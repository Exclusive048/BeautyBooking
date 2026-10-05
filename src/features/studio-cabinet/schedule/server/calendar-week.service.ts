import "server-only";

import { BookingStatus, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { dayPlanWorkMinutes, loadDayPlans } from "@/lib/schedule/day-plans";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { buildStudioWeekCell, type StudioWeekCell } from "../lib/week-capacity";
import { parseDateKey } from "../lib/time-grid";

/**
 * MOBILE-STUDIO-C (ops) — неделя календаря студии для приложения
 * (`GET /api/cabinet/studio/calendar/week`): загрузка «мастер × день» по
 * НАСТОЯЩЕМУ графику каждого мастера (план дня движка, `loadDayPlans`).
 * MOBILE-POLISH: веб-неделя (`buildWeekData`) считает ячейки тем же
 * `loadStudioWeekCells` — раньше там было «5 записей = 100%».
 *
 * Записи — только студийные (как у веба), без отменённых и неявок; личные
 * записи мастеров и блокировки студии в загрузку не входят.
 */

const INACTIVE_STATUSES = [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW];

export type StudioScheduleWeek = {
  studioId: string;
  timezone: string;
  todayKey: string;
  from: string;
  to: string;
  days: Array<{ date: string; weekday: number; isToday: boolean }>;
  masters: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    isAvailable: boolean;
    days: StudioWeekCell[];
  }>;
};

/** Понедельник недели, в которую входит дата (календарная арифметика над ключом). */
function mondayOf(dateKey: string): string {
  const weekday = parseDateKey(dateKey).getUTCDay(); // 0 = вс
  return addDaysToDateKey(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * Ячейки «мастер × день» недели с понедельника `from` (ключ даты салона): план
 * дня движка для активных мастеров, студийные записи без отменённых и неявок.
 * Общая для приложения (`loadStudioScheduleWeek`) и веба (`buildWeekData`).
 */
export async function loadStudioWeekCells(input: {
  /** `Studio.id`. */
  studioId: string;
  timezone: string;
  /** Понедельник недели, `YYYY-MM-DD` в поясе салона. */
  from: string;
  masters: Array<{ id: string; active: boolean }>;
  now: Date;
}): Promise<Map<string, StudioWeekCell[]>> {
  const toExclusive = addDaysToDateKey(input.from, 7);
  const weekStart = dateFromLocalDateKey(input.from, input.timezone, 0, 0);
  const weekEnd = dateFromLocalDateKey(toExclusive, input.timezone, 0, 0);
  const activeIds = input.masters.filter((master) => master.active).map((master) => master.id);

  const [bookings, plans] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...studioBookingsWhere(input.studioId),
        startAtUtc: { gte: weekStart, lt: weekEnd },
        status: { notIn: INACTIVE_STATUSES },
      },
      select: { masterProviderId: true, providerId: true, startAtUtc: true, endAtUtc: true },
    }),
    loadDayPlans({ providerIds: activeIds, fromKey: input.from, toKeyExclusive: toExclusive, now: input.now }),
  ]);

  // master → date → { booked, minutes }
  const load = new Map<string, Map<string, { booked: number; minutes: number }>>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const date = toLocalDateKey(booking.startAtUtc, input.timezone);
    const masterId = booking.masterProviderId ?? booking.providerId;
    const byDate = load.get(masterId) ?? new Map<string, { booked: number; minutes: number }>();
    const entry = byDate.get(date) ?? { booked: 0, minutes: 0 };
    entry.booked += 1;
    if (booking.endAtUtc && booking.endAtUtc.getTime() > booking.startAtUtc.getTime()) {
      entry.minutes += Math.round((booking.endAtUtc.getTime() - booking.startAtUtc.getTime()) / 60_000);
    }
    byDate.set(date, entry);
    load.set(masterId, byDate);
  }

  const dates = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(input.from, index));
  const cells = new Map<string, StudioWeekCell[]>();
  for (const master of input.masters) {
    const masterPlans = plans.get(master.id);
    const masterLoad = load.get(master.id);
    cells.set(
      master.id,
      dates.map((date) => {
        const plan = masterPlans?.get(date);
        const entry = masterLoad?.get(date);
        return buildStudioWeekCell({
          date,
          active: master.active,
          isWorking: plan?.isWorking,
          workMinutes: dayPlanWorkMinutes(plan),
          fixedStartsCount: plan?.fixedStarts?.length ?? null,
          booked: entry?.booked ?? 0,
          bookedMinutes: entry?.minutes ?? 0,
        });
      }),
    );
  }
  return cells;
}

export async function loadStudioScheduleWeek(input: {
  studioId: string;
  dateKey?: string;
  now?: Date;
}): Promise<StudioScheduleWeek | null> {
  const now = input.now ?? new Date();
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) return null;

  const timezone = studio.provider.timezone;
  const todayKey = toLocalDateKey(now, timezone);
  const from = mondayOf(input.dateKey ?? todayKey);

  const masters = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: studio.providerId },
    select: { id: true, name: true, avatarUrl: true, studioPaused: true, ownerUserId: true },
    orderBy: { name: "asc" },
  });
  const cells = await loadStudioWeekCells({
    studioId: studio.id,
    timezone,
    from,
    masters: masters.map((master) => ({ id: master.id, active: isStudioMasterActive(master) })),
    now,
  });

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDateKey(from, index);
    return { date, weekday: index + 1, isToday: date === todayKey };
  });

  return {
    studioId: studio.id,
    timezone,
    todayKey,
    from,
    to: addDaysToDateKey(from, 6),
    days,
    masters: masters.map((master) => ({
      id: master.id,
      name: master.name,
      avatarUrl: master.avatarUrl ?? null,
      isAvailable: isStudioMasterActive(master),
      days: cells.get(master.id) ?? [],
    })),
  };
}

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
 * Веб-неделя (`buildWeekData`) считает «5 записей = 100%» и выходным — только
 * неактивного мастера; приложению нужна правда графика, а веб не трогаем.
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
  const toExclusive = addDaysToDateKey(from, 7);
  const weekStart = dateFromLocalDateKey(from, timezone, 0, 0);
  const weekEnd = dateFromLocalDateKey(toExclusive, timezone, 0, 0);

  const [masters, bookings] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: studio.providerId },
      select: { id: true, name: true, avatarUrl: true, studioPaused: true, ownerUserId: true },
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        ...studioBookingsWhere(studio.id),
        startAtUtc: { gte: weekStart, lt: weekEnd },
        status: { notIn: INACTIVE_STATUSES },
      },
      select: { masterProviderId: true, providerId: true, startAtUtc: true, endAtUtc: true },
    }),
  ]);

  const activeIds = masters.filter((master) => isStudioMasterActive(master)).map((master) => master.id);
  const plans = await loadDayPlans({ providerIds: activeIds, fromKey: from, toKeyExclusive: toExclusive, now });

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDateKey(from, index);
    return { date, weekday: index + 1, isToday: date === todayKey };
  });

  // master → date → { booked, minutes }
  const load = new Map<string, Map<string, { booked: number; minutes: number }>>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const date = toLocalDateKey(booking.startAtUtc, timezone);
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

  return {
    studioId: studio.id,
    timezone,
    todayKey,
    from,
    to: addDaysToDateKey(from, 6),
    days,
    masters: masters.map((master) => {
      const active = isStudioMasterActive(master);
      const masterPlans = plans.get(master.id);
      const masterLoad = load.get(master.id);
      return {
        id: master.id,
        name: master.name,
        avatarUrl: master.avatarUrl ?? null,
        isAvailable: active,
        days: days.map(({ date }) => {
          const plan = masterPlans?.get(date);
          const entry = masterLoad?.get(date);
          return buildStudioWeekCell({
            date,
            active,
            isWorking: plan?.isWorking,
            workMinutes: dayPlanWorkMinutes(plan),
            fixedStartsCount: plan?.fixedStarts?.length ?? null,
            booked: entry?.booked ?? 0,
            bookedMinutes: entry?.minutes ?? 0,
          });
        }),
      };
    }),
  };
}

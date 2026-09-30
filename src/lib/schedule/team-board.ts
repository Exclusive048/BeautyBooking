import "server-only";

import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { prisma } from "@/lib/prisma";
import { calendarDayFromPlan } from "@/lib/schedule/calendar";
import { TEAM_BOARD_DAYS, type TeamBoardDto } from "@/lib/schedule/calendar-shared";
import { addDaysToDateKey, dateFromLocalDateKey, isDateKey, listDateKeysExclusive } from "@/lib/schedule/dateKey";
import { loadDayPlans } from "@/lib/schedule/day-plans";
import { loadSchedulePlan } from "@/lib/schedule/patterns";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — «График команды»: мастера студии × дни.
 *
 * Решение владельца 2026-09-28: у студии — доска смен команды поверх тех же
 * графиков и календарей, что у каждого мастера (своя палитра у каждого).
 * Доска только ЧИТАЕТ: правка дня идёт тем же календарём мастера
 * (`/api/cabinet/master/schedule/calendar?studioId&masterId`), график —
 * тем же пошаговым окном, поэтому второго писателя нет.
 *
 * Дни — тем же движком (`loadDayPlans`, одним пакетом на всю команду); даты
 * — даты студии (мастер студии живёт в её поясе, STUDIO-MASTER-TZ-01).
 * Записи — профиля в студии (исполнитель), как в календаре профиля.
 */

const CANCELLED_STATUSES = ["REJECTED", "CANCELLED", "NO_SHOW"] as const;

/** Сколько недель истории можно пролистать назад. */
const HISTORY_DAYS = 28;

export async function loadStudioTeamBoard(
  studioProviderId: string,
  fromRaw: string | null,
  now = new Date(),
): Promise<TeamBoardDto> {
  const studio = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { timezone: true },
  });
  if (!studio) throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  const todayKey = toLocalDateKey(now, studio.timezone);
  const lastKey = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  const minFromKey = addDaysToDateKey(todayKey, -HISTORY_DAYS);
  const maxFromKey = addDaysToDateKey(lastKey, -(TEAM_BOARD_DAYS - 1));
  const requested = fromRaw && isDateKey(fromRaw) ? fromRaw : todayKey;
  const fromKey = requested < minFromKey ? minFromKey : requested > maxFromKey ? maxFromKey : requested;
  const toKeyExclusive = addDaysToDateKey(fromKey, TEAM_BOARD_DAYS);
  const dates = listDateKeysExclusive(fromKey, toKeyExclusive);

  const masters = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: studioProviderId, ...STUDIO_ACTIVE_MASTER_WHERE },
    select: { id: true, name: true, avatarUrl: true, timezone: true },
    orderBy: { name: "asc" },
  });
  const ids = masters.map((master) => master.id);
  if (ids.length === 0) return { todayKey, fromKey, lastKey, minFromKey, dates, masters: [] };

  const [plans, bookings, schedulePlans] = await Promise.all([
    loadDayPlans({ providerIds: ids, fromKey, toKeyExclusive, now }),
    prisma.booking.findMany({
      where: {
        AND: [
          masterPerformedBookingWhere(ids),
          {
            startAtUtc: {
              gte: dateFromLocalDateKey(fromKey, studio.timezone, 0, 0),
              lt: dateFromLocalDateKey(toKeyExclusive, studio.timezone, 0, 0),
            },
            status: { notIn: [...CANCELLED_STATUSES] },
          },
        ],
      },
      select: { startAtUtc: true, masterProviderId: true, providerId: true },
    }),
    // Графики и палитры — по мастеру: команда студии — единицы-десятки человек.
    Promise.all(ids.map((id) => loadSchedulePlan(id, now))),
  ]);

  const bookingsByMasterDate = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const performer = booking.masterProviderId ?? booking.providerId;
    const key = `${performer}:${toLocalDateKey(booking.startAtUtc, studio.timezone)}`;
    bookingsByMasterDate.set(key, (bookingsByMasterDate.get(key) ?? 0) + 1);
  }

  return {
    todayKey,
    fromKey,
    lastKey,
    minFromKey,
    dates,
    masters: masters.map((master, index) => ({
      id: master.id,
      name: master.name,
      avatarUrl: master.avatarUrl ?? null,
      timezone: master.timezone,
      plan: schedulePlans[index]!,
      days: dates.map((date) =>
        calendarDayFromPlan(plans.get(master.id)?.get(date), date, {
          todayKey,
          lastKey,
          bookings: bookingsByMasterDate.get(`${master.id}:${date}`) ?? 0,
        }),
      ),
    })),
  };
}

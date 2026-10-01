import "server-only";

import { prisma } from "@/lib/prisma";
import { listBookableSlots } from "@/lib/schedule/bookable-window";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { formatLocalHm, toLocalDateKey } from "@/lib/schedule/timezone";

export type FreeSlotsToday = {
  /** Сколько окошек на сегодня клиент может забронировать прямо сейчас. */
  count: number;
  /** Время первого из них в поясе салона («10:00») или `null`. */
  firstFreeAt: string | null;
};

/**
 * DEV-SCENARIO-01 (решение владельца 2026-10-01: «считай как у клиента») —
 * плитка «Свободно сегодня» в расписании мастера.
 *
 * Раньше плитка считала 30-минутные куски рабочего окна от текущей МИНУТЫ, без
 * шага окошек, длины услуги и «минимум за N часов»: мастер видел «3 окошка,
 * после 18:10», а клиент в ту же минуту — «На сегодня свободных окошек не
 * осталось». Теперь окошки берутся тем же путём, что видит клиент на странице
 * записи (`listBookableSlots` без операторского окна), для самой короткой из
 * включённых услуг мастера: у неё окошек больше всего, то есть это ответ на
 * «можно ли сегодня к вам записаться хоть на что-то». Нет услуг — записаться
 * нельзя, окошек 0.
 */
export async function countClientFreeSlotsToday(masterId: string, now: Date): Promise<FreeSlotsToday> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: {
      id: true,
      timezone: true,
      minBookingHoursAhead: true,
      services: {
        where: { isEnabled: true, isActive: true },
        orderBy: [{ durationMin: "asc" }, { id: "asc" }],
        take: 1,
        select: { id: true, durationMin: true },
      },
    },
  });
  const service = master?.services[0];
  if (!master || !service) return { count: 0, firstFreeAt: null };

  const todayKey = toLocalDateKey(now, master.timezone);
  const result = await listBookableSlots({
    provider: {
      id: master.id,
      timezone: master.timezone,
      minBookingHoursAhead: master.minBookingHoursAhead,
    },
    serviceId: service.id,
    durationMinutes: service.durationMin,
    fromKey: todayKey,
    toKeyExclusive: addDaysToDateKey(todayKey, 1),
    now,
  });
  if (!result.ok || result.slots.length === 0) return { count: 0, firstFreeAt: null };

  const first = new Date(result.slots[0]!.startAtUtc);
  return { count: result.slots.length, firstFreeAt: formatLocalHm(first, master.timezone) };
}

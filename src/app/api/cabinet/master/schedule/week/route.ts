import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { loadMasterBookingItems } from "@/lib/master/booking-items.service";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { getMasterScheduleWeek } from "@/lib/master/schedule.service";
import { parseIsoDateKey } from "@/lib/master/schedule-utils";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, isDateKey, parseDateKeyToUtc } from "@/lib/schedule/dateKey";
import { minutesToTime } from "@/lib/schedule/time";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/master/schedule/week";

const querySchema = z.object({
  from: z
    .string()
    .trim()
    // Ключ обязан быть настоящей датой: «2026-02-31» `Date` молча превратил бы в 3 марта.
    .refine((value) => isDateKey(value) && addDaysToDateKey(value, 0) === value, "Укажите дату в формате ГГГГ-ММ-ДД.")
    .optional(),
});

/** Понедельник недели дня салона (неделя в кабинете — с понедельника). */
function mondayOf(dateKey: string): string {
  const weekday = parseDateKeyToUtc(dateKey).getUTCDay();
  return addDaysToDateKey(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

function toHm(interval: { startMin: number; endMin: number }): { start: string; end: string } {
  return { start: minutesToTime(interval.startMin), end: minutesToTime(interval.endMin) };
}

/**
 * MOBILE-MASTER-C — неделя расписания мастера (`/cabinet/master/schedule`,
 * `getMasterScheduleWeek`) в JSON: семь дней с `from` (дата салона; без него —
 * понедельник текущей недели салона). У дня — рабочие часы, перерывы и
 * «Фиксированное время» из плана движка (`HH:MM`, время салона), выходной,
 * блокировки и записи (кроме отменённых, отклонённых и неявок) единой формы
 * элемента. Записи и блоки выбираются по суткам салона (rule 17).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const workProfiles = await getMasterWorkProfiles(user.id);
    const masterId = workProfiles.personalId;

    const provider = await prisma.provider.findUnique({
      where: { id: masterId },
      select: { timezone: true },
    });
    if (!provider) return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");

    const now = new Date();
    const todayKey = toLocalDateKey(now, provider.timezone);
    const fromKey = query.from ?? mondayOf(todayKey);
    // Сервис недели строит дни из полуночи процесса — даём ему её для даты салона.
    const weekStart = parseIsoDateKey(fromKey)!;

    const week = await getMasterScheduleWeek({ masterId, weekStart, workProfiles, now });

    const bookingIds = week.days.flatMap((day) => day.bookings.map((booking) => booking.id));
    const items = await loadMasterBookingItems({ ids: bookingIds, workProfileIds: workProfiles.allIds, now });
    const itemById = new Map(items.map((item) => [item.id, item]));

    return ok(
      {
        timezone: week.timezone,
        from: fromKey,
        to: week.days[week.days.length - 1]?.iso ?? addDaysToDateKey(fromKey, 6),
        todayKey,
        showWorkContext: week.showWorkContext,
        hourRange: week.hourRange,
        kpi: week.kpi,
        days: week.days.map((day) => ({
          date: day.iso,
          weekday: day.weekDay.weekday,
          isToday: day.weekDay.isToday,
          isOff: day.isOff,
          workingIntervals: day.workingIntervals.map(toHm),
          breaks: day.breaks.map(toHm),
          fixedStarts: day.fixedStarts,
          timeBlocks: day.timeBlocks.map((block) => ({
            id: block.id,
            type: block.type,
            note: block.note,
            startAtUtc: block.startAtUtc.toISOString(),
            endAtUtc: block.endAtUtc.toISOString(),
          })),
          bookings: day.bookings.flatMap((booking) => {
            const item = itemById.get(booking.id);
            return item ? [item] : [];
          }),
        })),
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить расписание. Попробуйте ещё раз.",
    });
  }
}

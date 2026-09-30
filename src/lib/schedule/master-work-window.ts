import { prisma } from "@/lib/prisma";
import type { MasterWorkWindow } from "@/lib/bookings/policy-enforcement";
import { dayPlanHours } from "@/lib/schedule/day-plans";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { timeToMinutes } from "@/lib/schedule/time";
import type { DayPlan } from "@/lib/schedule/types";

/**
 * LOGIC-03 — резолвер рабочего окна мастера для guard'а рабочих часов
 * (`assertWithinMasterWorkHours`): запись из кабинета студии, студийный
 * перенос, перенос по запросу стороны, «окошко освободилось».
 *
 * SCHEDULE-PATTERNS-01 (этап 1): окно — это `DayPlan` движка, тот же, по
 * которому режутся окошки: шаблон недели, «Особый день» на дату, перерывы
 * даты, горизонт расписания. До этого часы резолвер читал сам — недельную
 * строку и исключение, с собственным запасным «Пн–Сб 10–19» для мастера без
 * расписания, которого у движка нет (движок такой день закрывает). Перерывы
 * уже брались из движка (BOOKING-FLOW-AUDIT-RESIDUALS), часы — нет, то есть
 * guard и окошки могли расходиться. Теперь источник один, и график с
 * чередованием или датами (этап 2) guard получает без правок.
 *
 * Дата — дата САЛОНА мастера (`resolveSalonLocalParts(...).dateKey`).
 */
export async function resolveMasterWorkWindow(
  masterProviderId: string,
  dateKey: string,
): Promise<MasterWorkWindow> {
  const provider = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { timezone: true },
  });
  if (!provider) return CLOSED_WINDOW;
  const plan = await ScheduleEngine.getDayPlan({
    masterId: masterProviderId,
    date: dateKey,
    timezone: provider.timezone,
  });
  return workWindowFromDayPlan(plan);
}

const CLOSED_WINDOW: MasterWorkWindow = { isActive: false, startMinutes: null, endMinutes: null };

/** Окно guard'а из плана дня: границы дня и перерывы в минутах от полуночи салона. */
export function workWindowFromDayPlan(plan: DayPlan | undefined): MasterWorkWindow {
  const hours = dayPlanHours(plan);
  const startMinutes = hours.start ? timeToMinutes(hours.start) : null;
  const endMinutes = hours.end ? timeToMinutes(hours.end) : null;
  if (!plan || startMinutes === null || endMinutes === null) return CLOSED_WINDOW;

  const breaks: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (const item of plan.breaks) {
    const breakStart = timeToMinutes(item.start);
    const breakEnd = timeToMinutes(item.end);
    if (breakStart === null || breakEnd === null || breakEnd <= breakStart) continue;
    breaks.push({ startMinutes: breakStart, endMinutes: breakEnd });
  }

  const window = { isActive: true, startMinutes, endMinutes };
  return breaks.length > 0 ? { ...window, breaks } : window;
}

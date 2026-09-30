import "server-only";

import { prisma } from "@/lib/prisma";
import { listDateKeysExclusive } from "@/lib/schedule/dateKey";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { createScheduleContexts } from "@/lib/schedule/engine-context";
import { timeToMinutes } from "@/lib/schedule/time";
import type { DayPlan } from "@/lib/schedule/types";

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — ЕДИНСТВЕННЫЙ способ спросить «работает ли
 * профиль в эти дни и в какие часы» за пределами движка окошек.
 *
 * До этого дашборд мастера (часы на сегодня), дашборд студии (кто работает
 * сегодня), загрузка недели в «Мастерах», аналитика (ёмкость), советник и
 * guard рабочих часов читали недельную таблицу сами. Каждый — со своей копией
 * правила, и ни один — с «Особыми днями»: выходной или отпуск на сегодня
 * дашборды не видели. Для графиков с чередованием и датами (этап 2) такие
 * копии стали бы неправдой целиком, поэтому все читатели идут сюда, а прямое
 * чтение таблиц расписания вне `lib/schedule/` сторожит
 * `schedule/day-plans-readers.test.ts`.
 *
 * Считается тем же движком (`ScheduleEngine.computeDayPlan`), что режет
 * окошки: шаблон недели, исключение даты, перерывы даты, фиксированное время,
 * горизонт расписания. Даты — даты САЛОНА каждого профиля (его `timezone`).
 */
export async function loadDayPlans(input: {
  providerIds: string[];
  fromKey: string;
  toKeyExclusive: string;
  now?: Date;
}): Promise<Map<string, Map<string, DayPlan>>> {
  const result = new Map<string, Map<string, DayPlan>>();
  const providerIds = Array.from(new Set(input.providerIds));
  const dateKeys = listDateKeysExclusive(input.fromKey, input.toKeyExclusive);
  if (providerIds.length === 0 || dateKeys.length === 0) return result;

  const providers = await prisma.provider.findMany({
    where: { id: { in: providerIds } },
    select: { id: true, timezone: true },
  });
  const contexts = await createScheduleContexts({
    providers,
    range: { fromKey: input.fromKey, toKeyExclusive: input.toKeyExclusive },
    now: input.now,
  });

  for (const provider of providers) {
    const ctx = contexts.get(provider.id);
    if (!ctx) continue;
    const plans = new Map<string, DayPlan>();
    for (const dateKey of dateKeys) {
      plans.set(dateKey, ScheduleEngine.computeDayPlan(ctx, dateKey));
    }
    result.set(provider.id, plans);
  }
  return result;
}

/** Границы рабочего дня: начало первого отрезка и конец последнего. */
export function dayPlanHours(plan: DayPlan | undefined): { start: string | null; end: string | null } {
  if (!plan?.isWorking || plan.workingIntervals.length === 0) return { start: null, end: null };
  return {
    start: plan.workingIntervals[0].start,
    end: plan.workingIntervals[plan.workingIntervals.length - 1].end,
  };
}

/**
 * Рабочие минуты дня: отрезки минус перерывы внутри них. День в режиме
 * «Фиксированное время» хранится как 00:00–23:55, его ёмкость в минутах
 * бессмысленна — `null`, пусть вызывающий решит, как такой день считать.
 */
export function dayPlanWorkMinutes(plan: DayPlan | undefined): number | null {
  if (!plan?.isWorking) return 0;
  if (plan.fixedStarts) return null;
  let total = 0;
  for (const interval of plan.workingIntervals) {
    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    if (start === null || end === null || end <= start) continue;
    let minutes = end - start;
    for (const pause of plan.breaks) {
      const pauseStart = timeToMinutes(pause.start);
      const pauseEnd = timeToMinutes(pause.end);
      if (pauseStart === null || pauseEnd === null) continue;
      const overlap = Math.min(end, pauseEnd) - Math.max(start, pauseStart);
      if (overlap > 0) minutes -= overlap;
    }
    total += Math.max(0, minutes);
  }
  return total;
}

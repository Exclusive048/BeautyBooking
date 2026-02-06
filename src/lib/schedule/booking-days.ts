import type { DayPlan } from "@/lib/schedule/types";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";

export type BookingDayItem = { date: string };

export async function findWorkingDays(input: {
  fromKey: string;
  limit: number;
  maxScan: number;
  getDayPlan: (dateKey: string) => Promise<DayPlan>;
}): Promise<{ days: BookingDayItem[]; nextFrom: string }> {
  const days: BookingDayItem[] = [];
  let cursor = input.fromKey;
  let scanned = 0;

  while (scanned < input.maxScan && days.length < input.limit) {
    const plan = await input.getDayPlan(cursor);
    if (plan.isWorking && plan.meta.reason !== "out_of_publish_horizon") {
      days.push({ date: cursor });
    }
    cursor = addDaysToDateKey(cursor, 1);
    scanned += 1;
  }

  const last = days[days.length - 1]?.date;
  const nextFrom = last ? addDaysToDateKey(last, 1) : cursor;
  return { days, nextFrom };
}

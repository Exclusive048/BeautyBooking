import "server-only";

import { latestBookableUtc } from "@/lib/bookings/policy-enforcement";
import { listBookableSlots } from "@/lib/schedule/bookable-window";
import { addDaysToDateKey, compareDateKeys, listDateKeysInclusive } from "@/lib/schedule/dateKey";
import { loadDayPlans } from "@/lib/schedule/day-plans";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { BookableDayStatus, BookableDaysSummary } from "@/lib/schedule/bookable-days-shared";

type SlotsInput = Parameters<typeof listBookableSlots>[0];

export type BookableDaysResult =
  | { ok: true; data: BookableDaysSummary }
  | { ok: false; status: number; code?: string; message: string };

function minKey(a: string, b: string): string {
  return compareDateKeys(a, b) <= 0 ? a : b;
}

/**
 * BOOKING-DATE-CALENDAR — сводка окна записи по дням для календаря выбора даты:
 * в какие дни у исполнителя есть свободное время.
 *
 * Окошки считает тот же `listBookableSlots`, что отдаёт время одного дня, с теми
 * же правилами окна записи, поэтому «день со свободным временем» в календаре —
 * ровно день, в котором выдача дня не пуста. Всё окно идёт одной страницей
 * (`wholeRange`), дни ложатся в общий слот-кэш, и выбор дня после сводки — уже
 * попадание в кэш.
 *
 * Статус дня без окошек различает выходной (`off`: движок дня не открывает —
 * график, «Особый день», горизонт расписания) и занятый рабочий день (`busy`):
 * оператору ручной записи это объясняет пустой день. План дня считает тот же
 * движок (`loadDayPlans`, инв. #47).
 *
 * Окно — `firstDate…lastDate` в датах САЛОНА: не раньше сегодня, не дальше
 * запрошенного конца, «максимума вперёд» (для оператора — только если он задан)
 * и горизонта расписания. Дни вне окна в `days` не входят.
 */
export async function listBookableDays(
  input: Omit<SlotsInput, "limit" | "wholeRange">,
): Promise<BookableDaysResult> {
  const { provider, now } = input;
  const timeZone = provider.timezone;
  const todayKey = toLocalDateKey(now, timeZone);

  const firstDate = compareDateKeys(input.fromKey, todayKey) < 0 ? todayKey : input.fromKey;

  let lastDate = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  if (input.toKeyExclusive) lastDate = minKey(lastDate, addDaysToDateKey(input.toKeyExclusive, -1));
  const maxWindow = input.operatorWindow ? input.operatorMaxWindow : input.windowPolicy;
  if (maxWindow) lastDate = minKey(lastDate, toLocalDateKey(latestBookableUtc(maxWindow, now), timeZone));

  if (compareDateKeys(lastDate, firstDate) < 0) {
    return { ok: true, data: { timezone: timeZone, firstDate, lastDate: firstDate, days: [] } };
  }

  const toKeyExclusive = addDaysToDateKey(lastDate, 1);
  const [bookable, plans] = await Promise.all([
    listBookableSlots({ ...input, fromKey: firstDate, toKeyExclusive, wholeRange: true }),
    loadDayPlans({ providerIds: [provider.id], fromKey: firstDate, toKeyExclusive, now }),
  ]);
  if (!bookable.ok) return bookable;

  const freeDates = new Set(bookable.slots.map((slot) => toLocalDateKey(slot.startAtUtc, timeZone)));
  const providerPlans = plans.get(provider.id);

  const days = listDateKeysInclusive(firstDate, lastDate).map((date) => {
    let status: BookableDayStatus;
    if (freeDates.has(date)) status = "free";
    else {
      const plan = providerPlans?.get(date);
      status = plan?.isWorking && plan.workingIntervals.length > 0 ? "busy" : "off";
    }
    return { date, status };
  });

  return { ok: true, data: { timezone: timeZone, firstDate, lastDate, days } };
}

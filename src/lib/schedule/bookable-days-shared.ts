/**
 * BOOKING-DATE-CALENDAR — форма сводки дней записи (`?days=1` у
 * `/api/masters/{id}/availability` и `/api/public/providers/{id}/slots`).
 * Без серверных зависимостей: её читают календари записи в браузере.
 */

/** `free` — есть свободное время; `busy` — рабочий день без окошек; `off` — выходной. */
export type BookableDayStatus = "free" | "busy" | "off";

export type BookableDay = { date: string; status: BookableDayStatus };

export type BookableDaysSummary = {
  /** Пояс салона — даты в `days` и границы окна в нём. */
  timezone: string;
  /** Первая дата окна записи `YYYY-MM-DD` (включительно). */
  firstDate: string;
  /** Последняя дата окна записи `YYYY-MM-DD` (включительно). */
  lastDate: string;
  days: BookableDay[];
};

const STATUS_RANK: Record<BookableDayStatus, number> = { off: 0, busy: 1, free: 2 };

/**
 * «Любой мастер» студии: день свободен, если свободен хоть у одного мастера;
 * рабочий без окошек — если хоть у одного рабочий; окно — объединение окон.
 */
export function mergeBookableDays(summaries: BookableDaysSummary[]): BookableDaysSummary | null {
  if (summaries.length === 0) return null;
  const byDate = new Map<string, BookableDayStatus>();
  let firstDate = summaries[0].firstDate;
  let lastDate = summaries[0].lastDate;
  for (const summary of summaries) {
    if (summary.firstDate < firstDate) firstDate = summary.firstDate;
    if (summary.lastDate > lastDate) lastDate = summary.lastDate;
    for (const day of summary.days) {
      const current = byDate.get(day.date);
      if (!current || STATUS_RANK[day.status] > STATUS_RANK[current]) byDate.set(day.date, day.status);
    }
  }
  const days = Array.from(byDate, ([date, status]) => ({ date, status })).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  return { timezone: summaries[0].timezone, firstDate, lastDate, days };
}

/** Первая дата со свободным временем не раньше `fromKey`, иначе `null`. */
export function firstFreeDate(summary: BookableDaysSummary | null, fromKey?: string): string | null {
  if (!summary) return null;
  for (const day of summary.days) {
    if (fromKey && day.date < fromKey) continue;
    if (day.status === "free") return day.date;
  }
  return null;
}

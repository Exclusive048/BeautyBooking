import type { BreakDto, DayScheduleDto, ScheduleExceptionDto } from "@/lib/schedule/editor-shared";

/**
 * Helpers for the new Exceptions and Breaks tabs. All formatting is in
 * Russian and the helpers are deterministic — they take in the raw
 * snapshot shapes and produce display-ready strings/groups. The split
 * between "render" data (here) and "save" data (editor types) keeps the
 * tabs from leaking presentation concerns into the API.
 */

/** ISO date key (YYYY-MM-DD) → millis at UTC midnight. */
function dateKeyToUtc(dateKey: string): number {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  return Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function formatRussianDate(dateKey: string): { day: number; month: string } {
  const [, monthRaw, dayRaw] = dateKey.split("-");
  return {
    day: Number(dayRaw),
    month: MONTHS_GENITIVE[Number(monthRaw) - 1] ?? "",
  };
}

export type ExceptionGroup = {
  /** Stable group identifier (first row's id when present, otherwise the date span). */
  id: string;
  /** All ScheduleOverride rows that belong to this group, sorted by date. */
  rows: ScheduleExceptionDto[];
  kind: "OFF" | "TIME_RANGE";
  note: string | null;
  startDate: string;
  endDate: string;
  startLocal: string | null;
  endLocal: string | null;
};

/**
 * Groups consecutive same-attribute exceptions into a single visual range.
 *
 * Two adjacent rows merge only if every attribute matches:
 * `(kind, note, isWorkday, startLocal, endLocal)`. So "1 мая (праздник)"
 * and "2 мая (отпуск)" stay as two separate cards even when the dates are
 * touching — different intent, different label.
 */
export function groupConsecutiveExceptions(exceptions: ScheduleExceptionDto[]): ExceptionGroup[] {
  if (exceptions.length === 0) return [];
  const sorted = exceptions.slice().sort((left, right) => left.date.localeCompare(right.date));
  const groups: ExceptionGroup[] = [];

  for (const row of sorted) {
    const last = groups.at(-1);
    const sameAttrs =
      last &&
      last.kind === (row.isWorkday ? "TIME_RANGE" : "OFF") &&
      (last.note ?? null) === (row.note ?? null) &&
      last.startLocal === row.startTime &&
      last.endLocal === row.endTime;

    const nextDay = last
      ? new Date(dateKeyToUtc(last.endDate) + DAY_MS).toISOString().slice(0, 10)
      : null;
    const consecutive = nextDay !== null && nextDay === row.date;

    if (last && sameAttrs && consecutive) {
      last.endDate = row.date;
      last.rows.push(row);
      continue;
    }

    groups.push({
      id: row.id,
      rows: [row],
      kind: row.isWorkday ? "TIME_RANGE" : "OFF",
      note: row.note ?? null,
      startDate: row.date,
      endDate: row.date,
      startLocal: row.startTime,
      endLocal: row.endTime,
    });
  }

  return groups;
}

/**
 * "1 мая · Не работаю" / "1-3 мая · Не работаю" / "12 мая · 10:00–14:00"
 *
 * Date label uses Russian genitive months. When start and end share the
 * same month, only the first day's number is plain ("1-3 мая"); when
 * they span months, both halves carry their month ("28 апреля – 2 мая").
 */
export function formatExceptionRange(group: ExceptionGroup): string {
  const start = formatRussianDate(group.startDate);
  const end = formatRussianDate(group.endDate);
  const dateLabel =
    group.startDate === group.endDate
      ? `${start.day} ${start.month}`
      : start.month === end.month
        ? `${start.day}–${end.day} ${end.month}`
        : `${start.day} ${start.month} – ${end.day} ${end.month}`;

  const action =
    group.kind === "OFF"
      ? "Не работаю"
      : `${group.startLocal ?? "—"}–${group.endLocal ?? "—"}`;

  return `${dateLabel} · ${action}`;
}

const DAY_SHORT_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/**
 * Formats a sorted array of weekday indexes (0=Mon … 6=Sun) into a compact
 * label.
 *
 * - Continuous run: "Пн-Пт", "Сб-Вс"
 * - Single day: "Сб"
 * - Non-continuous: comma-list "Пн, Ср, Пт"
 *
 * Treats Sat+Sun ([5,6]) as a continuous "Сб-Вс" but does NOT wrap around
 * the week boundary (no "Пт-Пн").
 */
export function formatDaysOfWeek(days: number[]): string {
  if (days.length === 0) return "";
  const sorted = days.slice().sort((left, right) => left - right);
  const allConsecutive = sorted.every((value, index) =>
    index === 0 ? true : value === sorted[index - 1] + 1
  );
  if (sorted.length === 1) {
    return DAY_SHORT_LABELS[sorted[0]] ?? "";
  }
  if (allConsecutive) {
    return `${DAY_SHORT_LABELS[sorted[0]]}-${DAY_SHORT_LABELS[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((day) => DAY_SHORT_LABELS[day]).filter(Boolean).join(", ");
}

export type RecurringBreakGroup = {
  id: string;
  /** Stable signature derived from time + title, used as React key. */
  signature: string;
  title: string | null;
  startLocal: string;
  endLocal: string;
  daysOfWeek: number[];
};

/**
 * Walks the 7-day weekSchedule and groups breaks across days by
 * `(start, end, title)`. The Breaks tab renders one card per group; the
 * underlying storage stays as per-day template breaks (single source of
 * truth shared with the Hours tab).
 */
export function groupRecurringBreaks(weekSchedule: DayScheduleDto[]): RecurringBreakGroup[] {
  const bySignature = new Map<string, RecurringBreakGroup>();

  for (const day of weekSchedule) {
    if (!day.isWorkday) continue;
    for (const breakRow of day.breaks) {
      const signature = `${breakRow.start}|${breakRow.end}|${breakRow.title ?? ""}`;
      const existing = bySignature.get(signature);
      if (existing) {
        existing.daysOfWeek.push(day.dayOfWeek);
        continue;
      }
      bySignature.set(signature, {
        id: signature,
        signature,
        title: breakRow.title ?? null,
        startLocal: breakRow.start,
        endLocal: breakRow.end,
        daysOfWeek: [day.dayOfWeek],
      });
    }
  }

  return Array.from(bySignature.values()).sort((left, right) =>
    left.startLocal.localeCompare(right.startLocal)
  );
}

/**
 * Returns a copy of the weekSchedule with `breakRows` appended to every
 * matched day's break list (sorted, deduplicated by `(start, end, title)`).
 */
export function appendRecurringBreak(
  weekSchedule: DayScheduleDto[],
  daysOfWeek: number[],
  breakRow: BreakDto
): DayScheduleDto[] {
  const target = new Set(daysOfWeek);
  return weekSchedule.map((day) => {
    if (!target.has(day.dayOfWeek)) return day;
    const exists = day.breaks.some(
      (existing) =>
        existing.start === breakRow.start &&
        existing.end === breakRow.end &&
        (existing.title ?? null) === (breakRow.title ?? null)
    );
    if (exists) return day;
    const breaks = [...day.breaks, breakRow].sort((left, right) =>
      left.start.localeCompare(right.start)
    );
    return { ...day, breaks };
  });
}

/**
 * Returns a copy of the weekSchedule with the matching break removed from
 * every day in the group's `daysOfWeek`. Used when the Breaks tab deletes
 * a recurring break group — N rows disappear in one PATCH.
 */
export function removeRecurringBreak(
  weekSchedule: DayScheduleDto[],
  group: RecurringBreakGroup
): DayScheduleDto[] {
  const target = new Set(group.daysOfWeek);
  return weekSchedule.map((day) => {
    if (!target.has(day.dayOfWeek)) return day;
    const breaks = day.breaks.filter(
      (existing) =>
        !(
          existing.start === group.startLocal &&
          existing.end === group.endLocal &&
          (existing.title ?? null) === (group.title ?? null)
        )
    );
    if (breaks.length === day.breaks.length) return day;
    return { ...day, breaks };
  });
}

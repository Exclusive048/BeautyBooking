import { timeToMinutes } from "@/lib/schedule/time";

/**
 * SCHEDULE-FLEX-DATE-NAV — свободные окошки дня для расписания мастера и
 * календаря студии: «свободно с 10:00 до 12:30 — 2 часа 30 мин».
 *
 * Чистая функция без запросов и без `server-only`: её зовут сборщики данных
 * расписания на сервере, а клиент только форматирует готовый ответ. Время —
 * минуты от полуночи САЛОНА (rule 17, salon-tz): вход и выход в одной зоне,
 * пересчёта зон здесь нет.
 *
 * Это ПРОМЕЖУТКИ, а не окошки записи: сколько уместится, решает длительность
 * услуги (её видит человек по подписи «— 1 час»). Поэтому правила движка
 * повторены ровно там, где они меняют границы промежутка:
 *   - запись занимает своё время плюс паузу мастера с обеих сторон
 *     (`buildSlotsForDay`, `slots.ts` — та же форма «буфер вокруг записи»);
 *   - перерыв дня и блокировка времени — жёсткие, без паузы;
 *   - промежуток короче самой короткой услуги профиля в него не поместит
 *     ничего и не показывается;
 *   - сегодня время до «сейчас» не продать — левый край промежутка не раньше.
 * День «Фиксированное время» промежутков не имеет: свободны те выбранные
 * мастером начала, с которых самая короткая услуга помещается до занятого.
 */

export type MinuteRange = { startMin: number; endMin: number };

export type FreeWindowsDay = {
  /** Свободные промежутки по возрастанию. */
  windows: MinuteRange[];
  /** День «Фиксированное время»: свободные начала (минуты); иначе `null`. */
  freeStarts: number[] | null;
};

const DAY_MINUTES = 24 * 60;
/** Самая короткая ступень сетки длительностей (`SERVICE_DURATION_OPTIONS`). */
export const FREE_WINDOW_FALLBACK_MIN = 15;

function clampRange(range: MinuteRange): MinuteRange | null {
  const start = Math.max(0, Math.min(DAY_MINUTES, Math.round(range.startMin)));
  // Запись через полночь салона в минутах дня кончается «раньше» начала —
  // для этого дня она занимает время до конца суток.
  const rawEnd = range.endMin <= range.startMin ? DAY_MINUTES : range.endMin;
  const end = Math.max(0, Math.min(DAY_MINUTES, Math.round(rawEnd)));
  return end > start ? { startMin: start, endMin: end } : null;
}

/** Склеивает пересекающиеся и касающиеся отрезки; вход не обязан быть упорядочен. */
export function mergeRanges(ranges: readonly MinuteRange[]): MinuteRange[] {
  const sorted = ranges
    .map(clampRange)
    .filter((range): range is MinuteRange => range !== null)
    .sort((a, b) => a.startMin - b.startMin);
  const merged: MinuteRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, range.endMin);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function subtract(base: MinuteRange, busy: readonly MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  let cursor = base.startMin;
  for (const range of busy) {
    if (range.endMin <= cursor) continue;
    if (range.startMin >= base.endMin) break;
    if (range.startMin > cursor) out.push({ startMin: cursor, endMin: range.startMin });
    cursor = Math.max(cursor, range.endMin);
    if (cursor >= base.endMin) break;
  }
  if (cursor < base.endMin) out.push({ startMin: cursor, endMin: base.endMin });
  return out;
}

export function computeFreeWindows(input: {
  isWorking: boolean;
  workingIntervals: readonly MinuteRange[];
  breaks: readonly MinuteRange[];
  /** День «Фиксированное время»: выбранные начала `HH:MM`; иначе `null`. */
  fixedStarts: readonly string[] | null;
  /** Записи дня (минуты салона); конец ≤ начала — запись через полночь. */
  bookings: readonly MinuteRange[];
  /** Блокировки времени дня. */
  blocks: readonly MinuteRange[];
  /** Пауза мастера между записями (`bufferBetweenBookingsMin`). */
  bufferMin: number;
  /** Самая короткая услуга профиля; промежуток короче не показывается. */
  minDurationMin: number;
  /**
   * Сегодня — минута «сейчас» в поясе салона: время до неё не предлагается.
   * Прошедший день — `DAY_MINUTES` (ничего); будущий — `null`.
   */
  nowMinute: number | null;
}): FreeWindowsDay {
  if (!input.isWorking) return { windows: [], freeStarts: input.fixedStarts ? [] : null };

  const buffer = Math.max(0, Math.round(input.bufferMin));
  const minDuration = Math.max(1, Math.round(input.minDurationMin) || FREE_WINDOW_FALLBACK_MIN);
  const busy = mergeRanges([
    ...input.bookings.map((range) => {
      const clamped = clampRange(range);
      return clamped
        ? { startMin: clamped.startMin - buffer, endMin: clamped.endMin + buffer }
        : { startMin: 0, endMin: 0 };
    }),
    ...input.blocks,
    ...input.breaks,
  ]);
  const earliest = input.nowMinute === null ? 0 : Math.max(0, input.nowMinute);

  if (input.fixedStarts) {
    const freeStarts = input.fixedStarts
      .map((value) => timeToMinutes(value))
      .filter((value): value is number => value !== null)
      .filter((start) => start >= earliest && start + minDuration <= DAY_MINUTES)
      .filter((start) => !busy.some((range) => start < range.endMin && start + minDuration > range.startMin))
      .sort((a, b) => a - b);
    return { windows: [], freeStarts };
  }

  const windows: MinuteRange[] = [];
  for (const interval of mergeRanges(input.workingIntervals)) {
    for (const gap of subtract(interval, busy)) {
      const start = Math.max(gap.startMin, earliest);
      if (gap.endMin - start >= minDuration) windows.push({ startMin: start, endMin: gap.endMin });
    }
  }
  return { windows, freeStarts: null };
}

/** Сумма свободных минут дня (для KPI); у дня «Фиксированное время» — 0. */
export function freeWindowsMinutes(day: FreeWindowsDay): number {
  return day.windows.reduce((sum, window) => sum + (window.endMin - window.startMin), 0);
}

/** Число окошек дня: промежутков либо свободных фиксированных начал. */
export function freeWindowsCount(day: FreeWindowsDay): number {
  return day.freeStarts ? day.freeStarts.length : day.windows.length;
}

/** «07:00», «24:00» — минута дня салона в подписи (без пересчёта зон). */
export function minuteLabel(minute: number): string {
  const total = Math.max(0, Math.min(DAY_MINUTES, Math.round(minute)));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Минута «сейчас» для дня `dateKey` относительно сегодняшнего дня салона:
 * прошедший — `DAY_MINUTES`, сегодня — `nowMinuteOfToday`, будущий — `null`.
 */
export function nowMinuteForDay(dateKey: string, todayKey: string, nowMinuteOfToday: number): number | null {
  if (dateKey < todayKey) return DAY_MINUTES;
  if (dateKey === todayKey) return nowMinuteOfToday;
  return null;
}

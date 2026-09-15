import { addWeeks, getWeekStart, parseIsoDateKey, toIsoDateKey } from "@/lib/master/schedule-utils";

/**
 * PWA-UX-BATCH-01 — состояние вида расписания, общее для контролов и тела.
 *
 * Вид (`?view=day|week`) — решение сервера (страница читает параметр, а без
 * него выводит вид из устройства — `resolveDefaultScheduleView`), поэтому
 * смена вида идёт через `router.push`. Выбранный день (`?day=`) — чисто
 * клиентское состояние: все семь колонок недели уже на странице, переключение
 * между ними не требует ответа сервера, и URL правится через
 * `history.replaceState` (Next синхронизирует с ним `useSearchParams`).
 * Один резолвер на оба потребителя, чтобы подпись периода в контролах и
 * колонка в теле не могли разойтись.
 */
export type ScheduleView = "day" | "week";

export const SCHEDULE_VIEW_PARAM = "view";
export const SCHEDULE_DAY_PARAM = "day";

export function parseScheduleView(value: string | null | undefined): ScheduleView | null {
  return value === "day" || value === "week" ? value : null;
}

/** Iso-ключи семи дней недели от понедельника `weekStartIso`. */
export function listWeekIsos(weekStartIso: string): string[] {
  const start = parseIsoDateKey(weekStartIso);
  if (!start) return [];
  const isos: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    isos.push(toIsoDateKey(d));
  }
  return isos;
}

/**
 * День, который показывает day-view: `?day=` если он внутри недели, иначе
 * сегодняшний день (в зоне мастера), если он в этой неделе, иначе понедельник.
 */
export function resolveSelectedDayIso(input: {
  dayParam: string | null;
  weekStartIso: string;
  todayIso: string;
}): string {
  const isos = listWeekIsos(input.weekStartIso);
  if (input.dayParam && isos.includes(input.dayParam)) return input.dayParam;
  if (isos.includes(input.todayIso)) return input.todayIso;
  return isos[0] ?? input.weekStartIso;
}

export function weekStartIsoOf(iso: string): string | null {
  const date = parseIsoDateKey(iso);
  return date ? toIsoDateKey(getWeekStart(date)) : null;
}

export function shiftWeekIso(weekStartIso: string, weeks: number): string | null {
  const date = parseIsoDateKey(weekStartIso);
  return date ? toIsoDateKey(addWeeks(date, weeks)) : null;
}

/**
 * Обновить `?day=` без обращения к серверу (Next следит за history API).
 *
 * 🔴 Состояние — `null`, НЕ `window.history.state`. Патч Next над
 * `replaceState` считает вызов СВОИМ, если у `data` есть `__NA` (а он есть у
 * каждой записи, которую Next создал сам), и тогда НЕ синхронизирует URL с
 * роутером — адресная строка меняется, `useSearchParams` нет, и чипы дней /
 * стрелки в дневном виде «не работают» (найдено живым прогоном
 * PWA-UX-BATCH-01). С `null` Next сам копирует внутреннее состояние и
 * применяет URL к роутеру.
 */
export function replaceDayInUrl(iso: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(SCHEDULE_DAY_PARAM, iso);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

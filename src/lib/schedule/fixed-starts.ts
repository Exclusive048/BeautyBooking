import { normalizeFixedSlotTimes } from "@/lib/schedule/editor-shared";

type ScheduleModeValue = "FLEXIBLE" | "FIXED";

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — единственное правило «режим дня → начала
 * окошек» для движка. Неделя и исключение хранят режим одинаково
 * (`scheduleMode` + `fixedSlotTimes`), поэтому и разбираются одной функцией.
 *
 * Возвращает выбранные начала (`HH:MM`, по возрастанию, без дублей), если день
 * в режиме «Фиксированное время», и `null` для обычного дня. Пустой массив —
 * тоже фиксированный день: времён не выбрано, окошек нет (так было и у
 * прежнего фильтра в `bookable-window.ts`).
 *
 * Режим `null` бывает только у исключения, записанного до появления колонки:
 * тогда режим выводится из самих времён — дословно правило прежнего фильтра.
 */
export function fixedStartsForMode(input: {
  scheduleMode: ScheduleModeValue | null | undefined;
  fixedSlotTimes: unknown;
}): string[] | null {
  const times = normalizeFixedSlotTimes(input.fixedSlotTimes);
  const mode = input.scheduleMode ?? (times.length > 0 ? "FIXED" : "FLEXIBLE");
  return mode === "FIXED" ? times : null;
}

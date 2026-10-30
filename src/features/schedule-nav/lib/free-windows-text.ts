import { minuteLabel, type MinuteRange } from "@/lib/schedule/free-windows";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.schedule.freeWindows;

/**
 * SCHEDULE-FLEX-DATE-NAV — подписи свободных окошек: одна форма для окна
 * «Свободные окошки», выгрузки и списка недели на телефоне. Время — минуты
 * дня САЛОНА (rule 17), пересчёта зон здесь нет.
 */

export type FreeWindowsDayItem = {
  dateKey: string;
  isOff: boolean;
  /** День прошёл (по часам салона) — в окно и выгрузку не попадает. */
  past: boolean;
  windows: MinuteRange[];
  /** День «Фиксированное время»: свободные начала; иначе `null`. */
  freeStarts: number[] | null;
};

export type FreeWindowsSection = {
  id: string;
  /** Подпись секции (имя мастера в студии); `null` — одна секция без подписи. */
  title: string | null;
  days: FreeWindowsDayItem[];
};

/** «с 10:00 до 12:30 — 2 часа 30 мин; …» либо «свободно в 10:00, 15:00»; нет свободного — `null`. */
export function freeWindowsDayLine(day: Pick<FreeWindowsDayItem, "windows" | "freeStarts">): string | null {
  if (day.freeStarts) {
    return day.freeStarts.length > 0 ? T.freeStarts(day.freeStarts.map(minuteLabel).join(", ")) : null;
  }
  if (day.windows.length === 0) return null;
  return day.windows
    .map((window) =>
      T.window(minuteLabel(window.startMin), minuteLabel(window.endMin), UI_FMT.durationLabel(window.endMin - window.startMin)),
    )
    .join("; ");
}

/** Текст выгрузки: только будущие рабочие дни со свободным временем, с меткой пояса. */
export function buildFreeWindowsText(input: {
  sections: FreeWindowsSection[];
  periodLabel: string;
  zoneLabel: string;
}): string {
  const lines = [T.textTitle(input.periodLabel)];
  if (input.zoneLabel) lines.push(T.textZone(input.zoneLabel));
  for (const section of input.sections) {
    const dayLines = section.days
      .filter((day) => !day.past && !day.isOff)
      .flatMap((day) => {
        const line = freeWindowsDayLine(day);
        return line ? [`${UI_FMT.dateKey(day.dateKey, "weekdayDayMonthShort")}: ${line}`] : [];
      });
    if (dayLines.length === 0) continue;
    lines.push("");
    if (section.title) lines.push(section.title);
    lines.push(...dayLines);
  }
  return lines.join("\n");
}

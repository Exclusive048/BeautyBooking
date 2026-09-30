import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import {
  patternPosition,
  type DayTemplateDto,
  type SchedulePatternDto,
} from "@/lib/schedule/patterns-shared";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

/** Пн…Вс — позиции недельного графика (позиция 0 = понедельник). */
export const WEEKDAY_SHORT: readonly string[] = [
  T.week.days.mon,
  T.week.days.tue,
  T.week.days.wed,
  T.week.days.thu,
  T.week.days.fri,
  T.week.days.sat,
  T.week.days.sun,
];

/** «N рабочих подряд, затем M выходных» — если график именно такой. */
export function cycleWorkOff(days: ReadonlyArray<string | null>): { work: number; off: number } | null {
  const work = days.findIndex((day) => day === null);
  if (work <= 0) return null;
  const rest = days.slice(work);
  if (rest.some((day) => day !== null)) return null;
  return { work, off: rest.length };
}

/**
 * «Каждый раз по-разному — отмечу дни сам» (этап 3): график из одного
 * выходного дня, рабочие дни ставятся в календаре.
 */
export function isManualPattern(pattern: Pick<SchedulePatternDto, "kind" | "cycleDays" | "days">): boolean {
  return pattern.kind === "CYCLE" && pattern.cycleDays === 1 && pattern.days[0] === null;
}

/** Короткое описание графика: «2 через 2 · 10:00–20:00». */
export function summarizePattern(pattern: SchedulePatternDto, templates: readonly DayTemplateDto[]): string {
  if (isManualPattern(pattern)) return T.plan.manualSummary;
  let head: string;
  if (pattern.days.every((day) => day === null)) {
    head = T.plan.allDaysOff;
  } else if (pattern.kind === "WEEK") {
    head = T.plan.weekdaysSummary(weekdayRanges(pattern.days.map((day) => day !== null)));
  } else if (pattern.kind === "WEEKS") {
    // «Недели чередуются: Пн–Чт / Чт–Вс» — какие дни, а не только сколько недель.
    const weeks = Array.from({ length: pattern.cycleDays / 7 }, (_, week) =>
      weekdayRanges(pattern.days.slice(week * 7, week * 7 + 7).map((day) => day !== null)) || T.plan.allDaysOff,
    );
    head = T.plan.weeksDaysSummary(weeks.join(" / "));
  } else {
    const split = cycleWorkOff(pattern.days);
    head = split ? T.plan.cycleSummary(split.work, split.off) : T.plan.customCycleSummary(pattern.cycleDays);
  }

  const ids = Array.from(new Set(pattern.days.filter((day): day is string => day !== null)));
  const used = ids.map((id) => templates.find((item) => item.id === id)).filter((item) => item !== undefined);
  if (used.length === 0) return head;
  // Разные часы у рабочих дней (у недели — например, короткая суббота):
  // часы первого дня ввели бы в заблуждение.
  const signatures = new Set(
    used.map((item) => (item.scheduleMode === "FIXED" ? "FIXED" : `${item.startTime}-${item.endTime}`)),
  );
  if (signatures.size > 1) return `${head} · ${T.plan.mixedHoursSummary}`;
  const template = used[0];
  const hours =
    template.scheduleMode === "FIXED"
      ? T.plan.fixedSummary
      : T.plan.hoursSummary(template.startTime, template.endTime);
  return `${head} · ${hours}`;
}

/**
 * Рабочие дни недели коротко: подряд три и больше — диапазоном («Пн–Пт»),
 * остальные через запятую («Пн, Ср, Пт»). Позиция 0 — понедельник.
 */
export function weekdayRanges(mask: readonly boolean[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < 7) {
    if (!mask[index]) {
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < 7 && mask[end + 1]) end += 1;
    if (end - index >= 2) {
      parts.push(`${WEEKDAY_SHORT[index]}–${WEEKDAY_SHORT[end]}`);
    } else {
      for (let day = index; day <= end; day += 1) parts.push(WEEKDAY_SHORT[day]!);
    }
    index = end + 1;
  }
  return parts.join(", ");
}

export type PreviewDay = { dateKey: string; working: boolean };

/**
 * Раскладка «рабочий / выходной» по датам — для предпросмотра в окне. Та же
 * формула, что у движка (`patternPosition`); после `endsOn` дни выходные.
 */
export function previewPatternDays(input: {
  anchorOn: string;
  days: ReadonlyArray<unknown | null>;
  fromKey: string;
  count: number;
  endsOn: string | null;
}): PreviewDay[] {
  return Array.from({ length: input.count }, (_, offset) => {
    const dateKey = addDaysToDateKey(input.fromKey, offset);
    if (input.endsOn !== null && dateKey > input.endsOn) return { dateKey, working: false };
    const position = patternPosition(dateKey, input.anchorOn, input.days.length);
    return { dateKey, working: input.days[position] !== null && input.days[position] !== undefined };
  });
}

/** Позиция недели (0 = Пн) для даты. */
export function weekdayIndex(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

/** Дата-ключ как календарная дата для подписи («28 сент.»): у ключа нет пояса. */
export function dateKeyIso(dateKey: string): string {
  return `${dateKey}T12:00:00.000Z`;
}

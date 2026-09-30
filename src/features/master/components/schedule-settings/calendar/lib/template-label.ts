import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import type { DayTemplateDto } from "@/lib/schedule/patterns-shared";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.calendar;
const MANUAL_DAY_LABEL = UI_TEXT.cabinetMaster.scheduleSettings.wizard.hours.manualDayLabel;

/** Часы рабочего дня палитры подписью: «10:00–20:00» или «фикс. время». */
export function templateHoursLabel(template: Pick<DayTemplateDto, "scheduleMode" | "startTime" | "endTime">): string {
  return template.scheduleMode === "FIXED" ? T.fixedLabel : T.customHours(template.startTime, template.endTime);
}

/**
 * Рабочий день, который создало окно в режиме «Каждый раз по-разному», — им
 * календарь открывается сразу после применения. Последний по порядку: окно
 * переиспользует день с тем же именем и часами, а при других часах создаёт новый.
 */
export function manualDayTemplateId(snapshot: ScheduleEditorSnapshot): string | null {
  const days = snapshot.schedulePlan.templates.filter((item) => item.inPalette && item.name === MANUAL_DAY_LABEL);
  return days.at(-1)?.id ?? null;
}

/** Имя рабочего дня для кисти: имя от мастера, иначе часы. */
export function templateDisplayName(template: DayTemplateDto): string {
  return template.name ?? templateHoursLabel(template);
}

import type { ScheduleOverrideKind } from "@prisma/client";
import type { ScheduleBreakInterval } from "@/lib/domain/schedule";
import type { ScheduleOverrideConfig } from "@/lib/schedule/rule-engine";
import { fixedStartsForMode } from "@/lib/schedule/fixed-starts";
import { toLocalDateKey } from "@/lib/schedule/timezone";

type OverrideRow = {
  date: Date;
  kind: ScheduleOverrideKind;
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  templateId: string | null;
  isActive: boolean | null;
  note: string | null;
  reason: string | null;
  scheduleMode: "FLEXIBLE" | "FIXED" | null;
  fixedSlotTimes: string[];
};

/** Рабочий день из палитры в том виде, в каком его читает движок. */
export type TemplateInfo = {
  startLocal: string;
  endLocal: string;
  breaks: ScheduleBreakInterval[];
  /** SCHEDULE-PATTERNS-01 (этап 2): режим записи — свойство шаблона. */
  fixedStarts: string[] | null;
};

export function toScheduleOverrideConfigs(
  rows: OverrideRow[],
  input?: {
    timezone?: string;
    templatesById?: Map<string, TemplateInfo>;
    breaksByDateKey?: Map<string, ScheduleBreakInterval[]>;
  }
): ScheduleOverrideConfig[] {
  const timezone = input?.timezone ?? "Europe/Moscow";
  const templatesById = input?.templatesById ?? new Map<string, TemplateInfo>();
  const breaksByDateKey = input?.breaksByDateKey ?? new Map<string, ScheduleBreakInterval[]>();

  return rows.map((row) => {
    const dateKey = toLocalDateKey(row.date, timezone);
    const overrideBreaks = breaksByDateKey.get(dateKey);

    if (row.kind === "OFF" || row.isDayOff) {
      return {
        date: row.date,
        kind: "OFF",
        startLocal: null,
        endLocal: null,
        note: row.note ?? row.reason ?? null,
      };
    }

    if (row.kind === "TEMPLATE") {
      if (row.isActive === false) {
        return {
          date: row.date,
          kind: "OFF",
          startLocal: null,
          endLocal: null,
          note: row.note ?? row.reason ?? null,
        };
      }
      const template = row.templateId ? templatesById.get(row.templateId) ?? null : null;
      if (template) {
        // «В этот день — рабочий день X из палитры»: часы, перерывы и режим —
        // шаблона. Режим исключения строки учитывается только у старых строк,
        // где шаблон режима ещё не нёс.
        return {
          date: row.date,
          kind: "TIME_RANGE",
          startLocal: template.startLocal,
          endLocal: template.endLocal,
          breaks: template.breaks,
          fixedStarts: template.fixedStarts ?? fixedStartsForMode(row),
          templateId: row.templateId,
          note: row.note ?? row.reason ?? null,
        };
      }
    }

    return {
      date: row.date,
      kind: "TIME_RANGE",
      startLocal: row.startLocal ?? null,
      endLocal: row.endLocal ?? null,
      breaks: overrideBreaks,
      fixedStarts: fixedStartsForMode(row),
      note: row.note ?? row.reason ?? null,
    };
  });
}

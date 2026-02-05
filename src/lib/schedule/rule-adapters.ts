import type { Prisma, ScheduleBreakKind, ScheduleOverrideKind, ScheduleRuleKind } from "@prisma/client";
import type { DayOfWeek, ScheduleBreakInterval } from "@/lib/domain/schedule";
import type {
  ScheduleOverrideConfig,
  ScheduleRuleConfig,
  ScheduleRulePayload,
} from "@/lib/schedule/rule-engine";
import { parseScheduleRulePayload } from "@/lib/schedule/rule-engine";
import { toLocalDateKey } from "@/lib/schedule/timezone";

type ActiveRuleRecord = {
  kind: ScheduleRuleKind;
  timezone: string;
  anchorDate: Date | null;
  payloadJson: Prisma.JsonValue;
  isActive: boolean;
};

type WeeklyRow = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
};

type BreakRow = {
  kind: ScheduleBreakKind;
  dayOfWeek: number | null;
  date: Date | null;
  startLocal: string;
  endLocal: string;
};

type OverrideRow = {
  date: Date;
  kind: ScheduleOverrideKind;
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  note: string | null;
  reason: string | null;
};

function fallbackTimezone(input: string | null | undefined): string {
  const value = typeof input === "string" ? input.trim() : "";
  return value.length > 0 ? value : "Europe/Moscow";
}

function buildWeeklyFallbackPayload(input: {
  weeklyRows: WeeklyRow[];
  breakRows: BreakRow[];
}): ScheduleRulePayload | null {
  const rowsByDay = new Map<number, WeeklyRow[]>();
  for (const row of input.weeklyRows) {
    const list = rowsByDay.get(row.dayOfWeek) ?? [];
    list.push(row);
    rowsByDay.set(row.dayOfWeek, list);
  }

  const weekly = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const rows = rowsByDay.get(dayOfWeek) ?? [];
    const first = rows[0] ?? null;
    const breaks: ScheduleBreakInterval[] = input.breakRows
      .filter((item) => item.kind === "WEEKLY" && item.dayOfWeek === dayOfWeek && !item.date)
      .map((item) => ({
        startLocal: item.startLocal,
        endLocal: item.endLocal,
      }));

    return {
      dayOfWeek: dayOfWeek as DayOfWeek,
      isWorkday: first !== null,
      startLocal: first?.startLocal ?? null,
      endLocal: first?.endLocal ?? null,
      breaks,
    };
  });

  const hasAnyWorkday = weekly.some((item) => item.isWorkday);
  if (!hasAnyWorkday) return null;
  return { weekly };
}

export function buildScheduleRuleConfig(input: {
  providerTimezone: string | null | undefined;
  activeRule: ActiveRuleRecord | null;
  weeklyRows: WeeklyRow[];
  breakRows: BreakRow[];
}): ScheduleRuleConfig | null {
  const timezone = fallbackTimezone(input.activeRule?.timezone ?? input.providerTimezone);
  if (input.activeRule?.isActive) {
    const parsed = parseScheduleRulePayload(input.activeRule.kind, input.activeRule.payloadJson);
    if (parsed) {
      return {
        kind: input.activeRule.kind,
        timezone,
        anchorDate: input.activeRule.anchorDate ?? null,
        payload: parsed,
      };
    }
  }

  const fallbackPayload = buildWeeklyFallbackPayload({
    weeklyRows: input.weeklyRows,
    breakRows: input.breakRows,
  });
  if (!fallbackPayload) return null;

  return {
    kind: "WEEKLY",
    timezone,
    anchorDate: null,
    payload: fallbackPayload,
  };
}

export function toScheduleOverrideConfigs(rows: OverrideRow[]): ScheduleOverrideConfig[] {
  return rows.map((row) => ({
    date: row.date,
    kind: row.kind === "OFF" || row.isDayOff ? "OFF" : "TIME_RANGE",
    startLocal: row.startLocal ?? null,
    endLocal: row.endLocal ?? null,
    note: row.note ?? row.reason ?? null,
  }));
}

export function buildDateBreaksMap(
  rows: BreakRow[],
  timezone: string
): Map<string, ScheduleBreakInterval[]> {
  const map = new Map<string, ScheduleBreakInterval[]>();
  for (const row of rows) {
    if (!row.date) continue;
    const key = toLocalDateKey(row.date, timezone);
    const list = map.get(key) ?? [];
    list.push({
      startLocal: row.startLocal,
      endLocal: row.endLocal,
    });
    map.set(key, list);
  }
  return map;
}

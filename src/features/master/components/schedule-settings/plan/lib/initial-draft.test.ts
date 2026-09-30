import { describe, expect, it } from "vitest";
import { patternPosition, type SchedulePatternDto, type SchedulePlanDto } from "@/lib/schedule/patterns-shared";
import { initialDraft } from "./initial-draft";

/**
 * SCHEDULE-PATTERNS-01 — пошаговое окно, открытое заново, продолжает
 * действующий график (найдено живой проверкой 2026-09-28: «2 через 2»
 * сдвигался на сегодня, чередование недель сбрасывалось к Пн–Пт, автопродление
 * выключалось).
 *
 * @probe 2026-09-28 — в `initialDraft` возвращено прежнее `firstDay: todayKey`:
 * покраснел «2 через 2 — та же раскладка» (первый рабочий день 2026-09-30
 * вместо 2026-10-03, и 01.10 из выходного стал рабочим). Возвращено — зелёный.
 * @probe 2026-09-28 — `weeksDays` снова `[...WORKDAYS_MASK, ...WORKDAYS_MASK]`:
 * покраснел «чередование недель» (вторая неделя Пн–Пт вместо Чт–Вс).
 */

const TEMPLATE = {
  id: "t1",
  name: null,
  color: "1" as const,
  startTime: "11:00",
  endTime: "20:00",
  breaks: [],
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
  inPalette: true,
  inUse: true,
};

function plan(todayKey: string, current: SchedulePatternDto | null): SchedulePlanDto {
  return {
    todayKey,
    current,
    upcoming: [],
    configuredUntil: current?.endsOn ?? null,
    hasSchedule: current !== null,
    templates: [TEMPLATE],
  };
}

describe("окно графика открывается с действующего графика", () => {
  it("2 через 2 — та же раскладка, первый рабочий день — ближайшее начало блока", () => {
    const current: SchedulePatternDto = {
      kind: "CYCLE",
      cycleDays: 4,
      anchorOn: "2026-09-29",
      startsOn: "2026-09-28",
      endsOn: "2026-12-29",
      days: ["t1", "t1", null, null],
    };
    // 30.09 — второй рабочий день блока (позиция 1).
    const draft = initialDraft(plan("2026-09-30", current));
    expect(draft.kind).toBe("CYCLE");
    expect(draft.cyclePreset).toBe("2x2");
    expect(draft.firstDay).toBe("2026-10-03");
    // Раскладка не сдвинулась: позиции всех дат совпадают со старой датой отсчёта.
    for (const date of ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10"]) {
      expect(patternPosition(date, draft.firstDay, 4)).toBe(patternPosition(date, current.anchorOn, 4));
    }
    expect(draft.autoExtend).toBe(false);
    expect(draft.endsOn).toBe("2026-12-29");
  });

  it("чередование недель — дни каждой недели и какая неделя сейчас", () => {
    const current: SchedulePatternDto = {
      kind: "WEEKS",
      cycleDays: 14,
      anchorOn: "2026-09-28",
      startsOn: "2026-09-28",
      endsOn: null,
      days: ["t1", "t1", "t1", "t1", null, null, null, null, null, null, "t1", "t1", "t1", "t1"],
    };
    const draft = initialDraft(plan("2026-10-07", current));
    expect(draft.weeksCount).toBe(2);
    expect(draft.weeksDays).toEqual([
      true, true, true, true, false, false, false,
      false, false, false, true, true, true, true,
    ]);
    // 07.10 — среда второй недели.
    expect(draft.currentWeek).toBe(2);
    expect(draft.autoExtend).toBe(true);
  });

  it("без графика — значения по умолчанию: автопродление выключено, до горизонта", () => {
    const draft = initialDraft(plan("2026-09-28", null));
    expect(draft.kind).toBe("WEEK");
    expect(draft.firstDay).toBe("2026-09-28");
    expect(draft.autoExtend).toBe(false);
    expect(draft.endsOn).toBe("2026-12-29");
    expect(draft.currentWeek).toBe(1);
  });
});

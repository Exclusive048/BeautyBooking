import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAY_HOURS,
  buildPatternTemplates,
  dayHoursFromTemplate,
  dayHoursToTemplate,
  suggestNextBreak,
  validateDayHours,
  type DayHoursDraft,
} from "./day-hours";

/**
 * SCHEDULE-BREAKS-MANY (2026-10-29): перерывов в дне сколько угодно, проверка
 * повторяет серверную `normalizeBreaks` — иначе сервер молча выбросил бы
 * перерыв, и сохранённое разошлось бы с введённым.
 *
 * @probe 2026-10-29: в `validateDayHours` условие `item.start <= draft.startTime`
 * заменено на `<` — покраснел «перерыв, касающийся начала дня, — ошибка»
 * (пришло `null`); проверка пересечений снята — покраснел «пересечение».
 */

const day = (patch: Partial<DayHoursDraft>): DayHoursDraft => ({ ...DEFAULT_DAY_HOURS, breaks: [], ...patch });

describe("часы рабочего дня (SCHEDULE-PATTERNS-01, этап 3)", () => {
  it("одинаковые часы — один рабочий день, позиции ссылаются на него", () => {
    const weekday = day({});
    const saturday = day({ endTime: "16:00" });
    const { templates, days } = buildPatternTemplates([weekday, weekday, weekday, weekday, weekday, saturday, null]);
    expect(templates).toHaveLength(2);
    expect(days).toEqual([0, 0, 0, 0, 0, 1, null]);
    expect(templates[1]?.endTime).toBe("16:00");
  });

  it("одни и те же перерывы в разном порядке — один рабочий день", () => {
    const a = day({ breaks: [{ start: "12:00", end: "12:30" }, { start: "15:00", end: "15:30" }] });
    const b = day({ breaks: [{ start: "15:00", end: "15:30" }, { start: "12:00", end: "12:30" }] });
    expect(buildPatternTemplates([a, b]).templates).toHaveLength(1);
  });

  it("фиксированное время — день 00:00–23:55 с отсортированными временами без повторов", () => {
    expect(dayHoursToTemplate(day({ mode: "FIXED", fixedTimes: ["16:00", "10:00", "16:00"] }))).toEqual({
      startTime: "00:00",
      endTime: "23:55",
      breaks: [],
      scheduleMode: "FIXED",
      fixedSlotTimes: ["10:00", "16:00"],
    });
  });

  it("несколько перерывов уходят все и по порядку", () => {
    const template = dayHoursToTemplate(
      day({
        startTime: "06:30",
        endTime: "18:20",
        breaks: [
          { start: "13:00", end: "14:00" },
          { start: "07:40", end: "07:50" },
          { start: "16:00", end: "16:15" },
        ],
      }),
    );
    expect(template.breaks).toEqual([
      { start: "07:40", end: "07:50", title: null },
      { start: "13:00", end: "14:00", title: null },
      { start: "16:00", end: "16:15", title: null },
    ]);
  });

  it("перерывы рабочего дня возвращаются в черновик все", () => {
    const draft = dayHoursFromTemplate({
      id: "t",
      name: null,
      color: "1",
      startTime: "09:00",
      endTime: "18:00",
      breaks: [
        { start: "11:00", end: "11:15", title: null },
        { start: "14:00", end: "15:00", title: null },
      ],
      scheduleMode: "FLEXIBLE",
      fixedSlotTimes: [],
      inPalette: false,
      inUse: true,
    });
    expect(draft.breaks).toEqual([
      { start: "11:00", end: "11:15" },
      { start: "14:00", end: "15:00" },
    ]);
  });

  describe("проверка", () => {
    it("без ошибок: без перерывов, несколько перерывов, перерывы встык", () => {
      expect(validateDayHours(day({}))).toBeNull();
      expect(
        validateDayHours(
          day({
            breaks: [
              { start: "12:00", end: "12:30" },
              { start: "12:30", end: "13:00" },
              { start: "16:00", end: "16:30" },
            ],
          }),
        ),
      ).toBeNull();
    });

    it("конец дня раньше начала", () => {
      expect(validateDayHours(day({ endTime: "09:00" }))).toBe("invalidRange");
    });

    it("перерыв вне дня, касающийся начала или конца, или с концом раньше начала — ошибка", () => {
      expect(validateDayHours(day({ breaks: [{ start: "09:00", end: "11:00" }] }))).toBe("breakOutside");
      expect(validateDayHours(day({ breaks: [{ start: "10:00", end: "11:00" }] }))).toBe("breakOutside");
      expect(validateDayHours(day({ breaks: [{ start: "19:00", end: "20:00" }] }))).toBe("breakOutside");
      expect(validateDayHours(day({ breaks: [{ start: "15:00", end: "14:00" }] }))).toBe("breakOutside");
    });

    it("пересечение", () => {
      expect(
        validateDayHours(
          day({
            breaks: [
              { start: "14:00", end: "15:00" },
              { start: "13:00", end: "14:30" },
            ],
          }),
        ),
      ).toBe("breakOverlap");
    });

    it("фиксированное время без времён приёма", () => {
      expect(validateDayHours(day({ mode: "FIXED", fixedTimes: [] }))).toBe("noFixedTimes");
    });
  });

  describe("«Добавить перерыв» предлагает", () => {
    it("первый — 14:00 на час", () => {
      expect(suggestNextBreak(day({}))).toEqual({ start: "14:00", end: "15:00" });
    });

    it("следующий — через час после последнего, на полчаса", () => {
      expect(suggestNextBreak(day({ breaks: [{ start: "14:00", end: "15:00" }] }))).toEqual({
        start: "16:00",
        end: "16:30",
      });
    });

    it("не помещается после последнего — первое свободное место дня", () => {
      const draft = day({ startTime: "09:00", endTime: "13:00", breaks: [{ start: "11:00", end: "12:30" }] });
      const next = suggestNextBreak(draft);
      expect(next).toEqual({ start: "09:15", end: "09:45" });
      expect(validateDayHours({ ...draft, breaks: [...draft.breaks, next] })).toBeNull();
    });

    it("предложенный перерыв всегда проходит проверку, пока в дне есть место", () => {
      let draft = day({ startTime: "06:30", endTime: "18:20" });
      for (let i = 0; i < 6; i += 1) {
        draft = { ...draft, breaks: [...draft.breaks, suggestNextBreak(draft)] };
        expect(validateDayHours(draft)).toBeNull();
      }
      expect(draft.breaks).toHaveLength(6);
    });
  });
});

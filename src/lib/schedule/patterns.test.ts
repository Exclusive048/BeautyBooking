import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  normalizePatternInput,
  periodTemplateIdOn,
  planPeriodWrite,
  planScheduleEnd,
  weekSignature,
  type PeriodWriteOp,
} from "@/lib/schedule/patterns";
import { buildDefaultWeekSchedule } from "@/lib/schedule/editor-shared";
import type { SchedulePatternDto } from "@/lib/schedule/patterns-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — писатель графиков.
 *
 * Главное свойство: периоды одного профиля не пересекаются ни до, ни после
 * записи, и прошлое не переписывается — у старого периода остаётся часть до
 * нового и (если новый не бессрочный) часть после него.
 *
 * @probe 2026-09-28: в `planPeriodWrite` убрана ветка правого остатка
 * (`keepRight` при `keepLeft`) — красное «летний график внутри бессрочной
 * недели: неделя до и после». Возвращено — зелёный.
 */

const week = (id: string, startsOn: string | null, endsOn: string | null) => ({
  id,
  kind: "WEEK" as const,
  cycleDays: 7,
  anchorOn: "2024-01-01",
  startsOn,
  endsOn,
  days: ["t1", "t1", "t1", "t1", "t1", null, null],
});

const twoByTwo = (startsOn: string, endsOn: string | null): SchedulePatternDto & { startsOn: string } => ({
  kind: "CYCLE",
  cycleDays: 4,
  anchorOn: startsOn,
  startsOn,
  endsOn,
  days: ["t2", "t2", null, null],
});

function summarize(ops: PeriodWriteOp[]): string[] {
  return ops.map((op) =>
    op.op === "create"
      ? `create ${op.period.kind} ${op.period.startsOn ?? "∞"}…${op.period.endsOn ?? "∞"}`
      : op.op === "delete"
        ? `delete ${op.id}`
        : op.op === "trimEnd"
          ? `trimEnd ${op.id} → ${op.endsOn}`
          : op.op === "setEnd"
            ? `setEnd ${op.id} → ${op.endsOn ?? "∞"}`
            : `trimStart ${op.id} → ${op.startsOn}`,
  );
}

describe("planPeriodWrite", () => {
  it("бессрочный новый график с даты: старая неделя кончается накануне", () => {
    const ops = planPeriodWrite([week("w", null, null)], twoByTwo("2026-10-01", null));
    expect(summarize(ops)).toEqual(["trimEnd w → 2026-09-30", "create CYCLE 2026-10-01…∞"]);
  });

  it("по умолчанию после конца нового графика ничего: старое с даты начала уходит", () => {
    // Решение владельца: расписание кончается там, где его настроили.
    const ops = planPeriodWrite(
      [week("w", null, null), week("later", "2026-12-01", null)],
      twoByTwo("2026-10-01", "2026-10-31"),
    );
    expect(summarize(ops)).toEqual([
      "trimEnd w → 2026-09-30",
      "delete later",
      "create CYCLE 2026-10-01…2026-10-31",
    ]);
  });

  it("летний график внутри бессрочной недели: неделя до и после (вернуть прежний)", () => {
    const ops = planPeriodWrite([week("w", null, null)], twoByTwo("2026-06-01", "2026-08-31"), {
      resumePrevious: true,
    });
    expect(summarize(ops)).toEqual([
      "trimEnd w → 2026-05-31",
      "create WEEK 2026-09-01…∞",
      "create CYCLE 2026-06-01…2026-08-31",
    ]);
    // Остаток после — копия старого графика: те же дни и точка отсчёта.
    const tail = ops[1];
    expect(tail.op === "create" && tail.period.days).toEqual(week("w", null, null).days);
    expect(tail.op === "create" && tail.period.anchorOn).toBe("2024-01-01");
  });

  it("период, целиком накрытый новым, удаляется", () => {
    const ops = planPeriodWrite(
      [week("a", null, "2026-09-30"), week("b", "2026-10-01", "2026-10-10")],
      twoByTwo("2026-10-01", "2026-10-31"),
    );
    expect(summarize(ops)).toEqual(["delete b", "create CYCLE 2026-10-01…2026-10-31"]);
  });

  it("период, начинающийся внутри нового и уходящий дальше, сдвигает начало", () => {
    const ops = planPeriodWrite([week("b", "2026-10-05", null)], twoByTwo("2026-10-01", "2026-10-20"), {
      resumePrevious: true,
    });
    expect(summarize(ops)).toEqual(["trimStart b → 2026-10-21", "create CYCLE 2026-10-01…2026-10-20"]);
  });

  it("с возвратом прежнего периоды вне нового не трогаются", () => {
    const ops = planPeriodWrite(
      [week("past", null, "2026-09-01"), week("future", "2026-12-01", null)],
      twoByTwo("2026-10-01", "2026-10-31"),
      { resumePrevious: true },
    );
    expect(summarize(ops)).toEqual(["create CYCLE 2026-10-01…2026-10-31"]);
  });

  it("повторная правка в тот же день заменяет сегодняшний период, а не режет его", () => {
    const ops = planPeriodWrite(
      [week("hist", null, "2026-09-27"), week("today", "2026-09-28", null)],
      { ...week("x", "2026-09-28", null), startsOn: "2026-09-28" },
    );
    expect(summarize(ops)).toEqual(["delete today", "create WEEK 2026-09-28…∞"]);
  });
});

describe("periodTemplateIdOn (этап 3: «как по графику» в календаре)", () => {
  const periods: SchedulePatternDto[] = [
    { kind: "WEEK", cycleDays: 7, anchorOn: "2024-01-01", startsOn: null, endsOn: "2026-10-04", days: ["w", "w", "w", "w", "w", null, null] },
    { kind: "CYCLE", cycleDays: 4, anchorOn: "2026-10-05", startsOn: "2026-10-05", endsOn: "2026-10-31", days: ["c", "c", null, null] },
  ];

  it("день графика — рабочий день его позиции", () => {
    expect(periodTemplateIdOn(periods, "2026-10-01")).toBe("w"); // чт
    expect(periodTemplateIdOn(periods, "2026-10-03")).toBeNull(); // сб
    expect(periodTemplateIdOn(periods, "2026-10-05")).toBe("c");
    expect(periodTemplateIdOn(periods, "2026-10-07")).toBeNull();
    expect(periodTemplateIdOn(periods, "2026-10-09")).toBe("c");
  });

  it("после конца настроенного расписания — выходной", () => {
    expect(periodTemplateIdOn(periods, "2026-11-01")).toBeNull();
  });
});

describe("normalizePatternInput", () => {
  const TODAY = "2026-09-28";
  const base = {
    kind: "CYCLE" as const,
    cycleDays: 4,
    anchorOn: "2026-10-01",
    startsOn: "2026-10-01",
    endsOn: null,
    days: ["t", "t", null, null],
  };

  it("принимает корректный 2 через 2", () => {
    expect(normalizePatternInput(base, TODAY)).toMatchObject({ cycleDays: 4, endsOn: null });
  });

  it("неделя хранится от общего понедельника", () => {
    const out = normalizePatternInput(
      { ...base, kind: "WEEK", cycleDays: 7, anchorOn: "2026-09-28", days: Array(7).fill("t") },
      TODAY,
    );
    expect(out.anchorOn).toBe("2024-01-01");
  });

  it.each([
    ["начало в прошлом", { startsOn: "2026-09-27" }],
    ["конец раньше начала", { endsOn: "2026-09-30" }],
    ["дальше 3 месяцев", { endsOn: "2027-01-15" }],
    ["длина цикла больше 28", { cycleDays: 29, days: Array(29).fill(null) }],
    ["дней меньше длины цикла", { days: ["t"] }],
    ["неделя не с понедельника", { kind: "WEEK" as const, cycleDays: 7, anchorOn: "2026-09-30", days: Array(7).fill("t") }],
    ["чередование из 10 дней", { kind: "WEEKS" as const, cycleDays: 10, anchorOn: "2026-09-28", days: Array(10).fill("t") }],
  ])("отклоняет: %s", (_, patch) => {
    expect(() => normalizePatternInput({ ...base, ...patch }, TODAY)).toThrow();
  });
});

describe("weekSignature", () => {
  it("выходные дни не зависят от спрятанных в них часов", () => {
    const a = buildDefaultWeekSchedule();
    const b = buildDefaultWeekSchedule().map((day) =>
      day.isWorkday ? day : { ...day, startTime: "11:00", endTime: "12:00" },
    );
    expect(weekSignature(a)).toBe(weekSignature(b));
  });

  it("изменённые часы рабочего дня меняют подпись", () => {
    const a = buildDefaultWeekSchedule();
    const b = a.map((day) => (day.dayOfWeek === 0 ? { ...day, endTime: "19:00" } : day));
    expect(weekSignature(a)).not.toBe(weekSignature(b));
  });
});

/**
 * MOBILE-POLISH — «Настроено до»: дата позже нынешнего конца продлевает
 * расписание одним вызовом (раньше — только `null`, потом дата).
 *
 * @probe 2026-10-04: в `planScheduleEnd` убрана ветка продления — красные
 * «продлить одним вызовом» и «итог как у двух шагов». Возвращено — зелёный.
 */
describe("planScheduleEnd", () => {
  const today = "2026-10-04";

  /** Применить план к периодам в памяти — сравнить итог, а не набор шагов. */
  function apply(
    periods: Array<ReturnType<typeof week>>,
    ops: PeriodWriteOp[],
  ): Array<{ id: string; startsOn: string | null; endsOn: string | null }> {
    let next = periods.map((period) => ({ id: period.id, startsOn: period.startsOn, endsOn: period.endsOn }));
    let created = 0;
    for (const op of ops) {
      if (op.op === "delete") next = next.filter((period) => period.id !== op.id);
      else if (op.op === "setEnd" || op.op === "trimEnd")
        next = next.map((period) => (period.id === op.id ? { ...period, endsOn: op.endsOn } : period));
      else if (op.op === "trimStart")
        next = next.map((period) => (period.id === op.id ? { ...period, startsOn: op.startsOn } : period));
      else next.push({ id: `new${(created += 1)}`, startsOn: op.period.startsOn, endsOn: op.period.endsOn });
    }
    return next.sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""));
  }

  it("укоротить: как раньше", () => {
    expect(summarize(planScheduleEnd([week("w", null, "2026-12-01")], "2026-11-01", today))).toEqual([
      "setEnd w → 2026-11-01",
    ]);
  });

  it("продлить одним вызовом: конец последнего периода переходит на дату", () => {
    const periods = [week("a", null, "2026-10-09"), week("b", "2026-10-10", "2026-10-31")];
    expect(summarize(planScheduleEnd(periods, "2026-12-01", today))).toEqual(["setEnd b → 2026-12-01"]);
  });

  it("итог как у двух шагов (`null`, потом дата)", () => {
    const periods = [week("a", null, "2026-10-09"), week("b", "2026-10-10", "2026-10-31")];
    const oneCall = apply(periods, planScheduleEnd(periods, "2026-12-01", today));
    const step1 = apply(periods, planScheduleEnd(periods, null, today));
    const afterStep1 = periods.map((period) => ({ ...period, ...step1.find((row) => row.id === period.id) }));
    const twoSteps = apply(afterStep1, planScheduleEnd(afterStep1, "2026-12-01", today));
    expect(oneCall).toEqual(twoSteps);
    expect(oneCall.at(-1)).toEqual({ id: "b", startsOn: "2026-10-10", endsOn: "2026-12-01" });
  });

  it("та же дата — ничего не делать", () => {
    expect(planScheduleEnd([week("w", null, "2026-11-01")], "2026-11-01", today)).toEqual([]);
  });

  it("`null` — последний период бессрочный; уже бессрочный — без шагов", () => {
    expect(summarize(planScheduleEnd([week("w", null, "2026-11-01")], null, today))).toEqual(["setEnd w → ∞"]);
    expect(planScheduleEnd([week("w", null, null)], null, today)).toEqual([]);
  });

  it("кончился вчера — продлевается сам (прошлое не задето)", () => {
    expect(summarize(planScheduleEnd([week("w", null, "2026-10-03")], "2026-11-01", today))).toEqual([
      "setEnd w → 2026-11-01",
    ]);
  });

  it("кончился давно — продолжение копией с сегодня, прошлое не переписывается", () => {
    const ops = planScheduleEnd([week("w", "2026-08-01", "2026-09-01")], "2026-11-01", today);
    expect(summarize(ops)).toEqual(["create WEEK 2026-10-04…2026-11-01"]);
    const created = ops[0];
    expect(created?.op === "create" && created.period.anchorOn).toBe("2024-01-01");
    expect(summarize(planScheduleEnd([week("w", "2026-08-01", "2026-09-01")], null, today))).toEqual([
      "create WEEK 2026-10-04…∞",
    ]);
  });

  it("дата раньше начала следующего периода — тот удаляется, прежний не продлевается", () => {
    const periods = [week("a", null, "2026-10-09"), week("b", "2026-10-20", null)];
    expect(summarize(planScheduleEnd(periods, "2026-10-15", today))).toEqual(["delete b"]);
  });

  it("проверка дат прежняя", () => {
    expect(() => planScheduleEnd([], "2026-11-01", today)).toThrow("Сначала настройте график.");
    expect(() => planScheduleEnd([week("w", null, null)], "2026-10-03", today)).toThrow("Проверьте дату окончания.");
    expect(() => planScheduleEnd([week("w", null, null)], "2027-03-01", today)).toThrow(
      "Расписание можно настроить не дальше чем на 3 месяца вперёд.",
    );
  });
});

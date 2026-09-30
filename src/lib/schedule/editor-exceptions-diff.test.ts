import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — «Особые дни» в снапшоте пишутся РАЗНИЦЕЙ.
 *
 * Снапшот настроек отправляет полный список исключений при сохранении ЛЮБОЙ
 * вкладки (роут собирает его из БД). Раньше каждое исключение переписывалось
 * заново как `TIME_RANGE` без шаблона — и день, покрашенный в календаре
 * рабочим днём палитры (`TEMPLATE`), терял связь с ним, а режим
 * «Фиксированное время» — вовсе. Теперь пишется только изменившаяся дата.
 *
 * @probe 2026-09-28: в `applyScheduleSnapshotTx` снята проверка «вид не
 *        изменился» (каждое исключение снова уходит в `saveScheduleExceptionTx`)
 *        → «неизменённые дни не переписываются» красный: upsert вызван дважды.
 */

const calls = vi.hoisted(() => ({
  upserts: [] as unknown[],
  deletes: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/schedule/slotsCache", () => ({ invalidateSlotsForMaster: vi.fn() }));
vi.mock("@/lib/schedule/patterns", () => ({
  saveWeekAsPatternTx: vi.fn(async () => undefined),
  readWeekRepresentation: vi.fn(),
  loadSchedulePlan: vi.fn(),
}));

import { applyScheduleSnapshotTx } from "@/lib/schedule/editor";

const TEMPLATE_ROW = {
  id: "ov-template",
  date: new Date("2026-10-05T00:00:00.000Z"),
  kind: "TEMPLATE",
  isDayOff: false,
  isWorkday: true,
  startLocal: "09:00",
  endLocal: "15:00",
  scheduleMode: "FIXED",
  fixedSlotTimes: ["09:00", "12:00"],
  note: null,
  template: {
    startLocal: "00:00",
    endLocal: "23:55",
    scheduleMode: "FIXED",
    fixedSlotTimes: ["09:00", "12:00"],
    breaks: [],
  },
};

const OFF_ROW = {
  id: "ov-off",
  date: new Date("2026-10-07T00:00:00.000Z"),
  kind: "OFF",
  isDayOff: true,
  isWorkday: false,
  startLocal: null,
  endLocal: null,
  scheduleMode: null,
  fixedSlotTimes: [],
  note: null,
  template: null,
};

function tx() {
  return {
    provider: {
      findUnique: async () => ({ timezone: "Europe/Moscow" }),
      update: async () => ({}),
    },
    discountRule: { findUnique: async () => null },
    scheduleOverride: {
      findMany: async () => [TEMPLATE_ROW, OFF_ROW],
      upsert: async (args: unknown) => {
        calls.upserts.push(args);
        return {};
      },
      deleteMany: async (args: unknown) => {
        calls.deletes.push(args);
        return { count: 1 };
      },
    },
    scheduleBreak: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
    },
  } as never;
}

const WEEK = Array.from({ length: 7 }, (_, index) => ({
  dayOfWeek: index,
  isWorkday: index < 5,
  startTime: "10:00",
  endTime: "19:00",
  breaks: [],
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
}));

// Вид, в котором снапшот отдаёт эти строки (`readScheduleExceptionsTx`).
const TEMPLATE_DTO = {
  date: "2026-10-05",
  isWorkday: true,
  scheduleMode: "FIXED" as const,
  startTime: "00:00",
  endTime: "23:55",
  breaks: [],
  fixedSlotTimes: ["09:00", "12:00"],
  note: null,
};
const OFF_DTO = {
  date: "2026-10-07",
  isWorkday: false,
  scheduleMode: "FLEXIBLE" as const,
  startTime: null,
  endTime: null,
  breaks: [],
  fixedSlotTimes: [],
  note: null,
};

beforeEach(() => {
  calls.upserts.length = 0;
  calls.deletes.length = 0;
});

describe("SCHEDULE-PATTERNS-01 · «Особые дни» в снапшоте пишутся разницей", () => {
  it("неизменённые дни не переписываются — покрашенный рабочий день палитры сохраняет связь", async () => {
    await applyScheduleSnapshotTx(tx(), "prov-1", { weekSchedule: WEEK, exceptions: [TEMPLATE_DTO, OFF_DTO] });
    expect(calls.upserts).toEqual([]);
    expect(calls.deletes).toEqual([]);
  });

  it("изменённый день пишется, остальные — нет", async () => {
    await applyScheduleSnapshotTx(tx(), "prov-1", {
      weekSchedule: WEEK,
      exceptions: [TEMPLATE_DTO, { ...OFF_DTO, isWorkday: true, startTime: "11:00", endTime: "16:00" }],
    });
    expect(calls.upserts).toHaveLength(1);
    expect(JSON.stringify(calls.upserts[0])).toContain("11:00");
  });

  it("убранный из списка день снимается", async () => {
    await applyScheduleSnapshotTx(tx(), "prov-1", { weekSchedule: WEEK, exceptions: [TEMPLATE_DTO] });
    expect(calls.upserts).toEqual([]);
    expect(calls.deletes.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls.deletes)).toContain("2026-10-07");
  });

  it("список не передан — правки дат не трогаются вовсе (календарь пишет их сам)", async () => {
    await applyScheduleSnapshotTx(tx(), "prov-1", { weekSchedule: WEEK });
    expect(calls.upserts).toEqual([]);
    expect(calls.deletes).toEqual([]);
  });
});

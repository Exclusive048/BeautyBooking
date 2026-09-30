import { describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — перенос недели в график не меняет НИ ОДНОГО
 * дня (решение владельца: у действующих мастеров ничего не меняется).
 *
 * Одна и та же неделя считается движком дважды: как неделя профиля без
 * графика (прежний путь) и как график, который из неё сделал
 * `ensurePatternHistoryTx`. Планы 8 недель вперёд обязаны совпасть день в
 * день — включая выходные, перерывы и день «Фиксированное время» (у недели
 * режим на строке дня, у графика — на шаблоне, и перенос создаёт для него
 * отдельный шаблон).
 *
 * @probe 2026-09-28: в `ensurePatternHistoryTx` фиксированный день перенесён
 * со старым шаблоном (без режима на шаблоне) — красное: фиксированный
 * четверг стал сеткой 00:00–23:55.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  providers: [{ id: "m1", timezone: "Europe/Moscow" }] as Row[],
  weekly: [] as Row[],
  templates: [] as Row[],
  patterns: [] as Row[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findMany: vi.fn(async () => db.providers) },
    weeklyScheduleConfig: { findMany: vi.fn(async () => db.weekly) },
    scheduleTemplate: { findMany: vi.fn(async () => db.templates) },
    schedulePattern: { findMany: vi.fn(async () => db.patterns) },
    scheduleOverride: { findMany: vi.fn(async () => []) },
    scheduleBreak: { findMany: vi.fn(async () => []) },
  },
}));

import { loadDayPlans } from "@/lib/schedule/day-plans";
import { ensurePatternHistoryTx } from "@/lib/schedule/patterns-core";
import type { Prisma } from "@prisma/client";

const FULL_DAY = {
  providerId: "m1",
  id: "t-full",
  startLocal: "10:00",
  endLocal: "20:00",
  scheduleMode: "FLEXIBLE",
  fixedSlotTimes: [],
  breaks: [{ startLocal: "14:00", endLocal: "15:00", sortOrder: 0 }],
};
const FIXED_RANGE = {
  providerId: "m1",
  id: "t-fixed-range",
  startLocal: "00:00",
  endLocal: "23:55",
  scheduleMode: "FLEXIBLE",
  fixedSlotTimes: [],
  breaks: [],
};

// Пн–Ср — полный день с обедом, Чт — фиксированное время 10:00/13:00/16:00,
// Пт — полный день, Сб–Вс — выходные.
const WEEK_DAYS = [
  { weekday: 1, templateId: "t-full", isActive: true, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
  { weekday: 2, templateId: "t-full", isActive: true, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
  { weekday: 3, templateId: "t-full", isActive: true, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
  {
    weekday: 4,
    templateId: "t-fixed-range",
    isActive: true,
    scheduleMode: "FIXED",
    fixedSlotTimes: ["10:00", "13:00", "16:00"],
  },
  { weekday: 5, templateId: "t-full", isActive: true, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
  { weekday: 6, templateId: null, isActive: false, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
  { weekday: 7, templateId: null, isActive: false, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
];

/** Двойник транзакции ровно под то, что делает перенос. */
function fakeTx(): Prisma.TransactionClient {
  const templatesById = new Map([FULL_DAY, FIXED_RANGE].map((t) => [t.id, t]));
  return {
    schedulePattern: {
      count: async () => db.patterns.length,
      create: async ({ data }: { data: Row }) => {
        const days = (data.days as { createMany: { data: Row[] } }).createMany.data;
        db.patterns.push({ providerId: "m1", ...data, days });
        return { id: "p1" };
      },
    },
    weeklyScheduleConfig: {
      findUnique: async () => ({
        days: WEEK_DAYS.map((day) => ({
          ...day,
          template: day.templateId ? templatesById.get(day.templateId) ?? null : null,
        })),
      }),
    },
    scheduleTemplate: {
      findUnique: async () => null,
      create: async ({ data }: { data: Row }) => {
        const id = `t-auto-${db.templates.length}`;
        db.templates.push({
          providerId: "m1",
          id,
          startLocal: data.startLocal,
          endLocal: data.endLocal,
          scheduleMode: data.scheduleMode,
          fixedSlotTimes: data.fixedSlotTimes,
          breaks: [],
        });
        return { id };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

const NOW = new Date("2026-09-28T06:00:00Z");

async function plans() {
  const result = await loadDayPlans({
    providerIds: ["m1"],
    fromKey: "2026-09-28",
    toKeyExclusive: "2026-11-23",
    now: NOW,
  });
  return Array.from(result.get("m1")?.entries() ?? []).map(([key, plan]) => [
    key,
    { isWorking: plan.isWorking, intervals: plan.workingIntervals, breaks: plan.breaks, fixed: plan.fixedStarts ?? null },
  ]);
}

describe("перенос недели в график", () => {
  it("не меняет ни одного дня на 8 недель вперёд", async () => {
    db.weekly = [{ providerId: "m1", days: WEEK_DAYS }];
    db.templates = [FULL_DAY, FIXED_RANGE];
    db.patterns = [];
    const before = await plans();

    await ensurePatternHistoryTx(fakeTx(), "m1");
    expect(db.patterns).toHaveLength(1);
    const after = await plans();

    expect(after).toEqual(before);
    // Не вакуумно: в окне есть и рабочие, и выходные, и фиксированные дни.
    const flags = before.map(([, plan]) => plan as { isWorking: boolean; fixed: string[] | null });
    expect(flags.some((plan) => plan.isWorking && plan.fixed === null)).toBe(true);
    expect(flags.some((plan) => plan.fixed !== null)).toBe(true);
    expect(flags.some((plan) => !plan.isWorking)).toBe(true);
  });
});

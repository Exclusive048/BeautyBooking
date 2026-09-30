import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LOGIC-12 — снапшот расписания применяется атомарно.
 *
 * `applyScheduleSnapshot` был четырьмя независимыми шагами, и самый
 * чувствительный из них — `saveWeekSchedule` — внутри себя делает
 * `deleteMany` + `createMany`. Обрыв между ними (таймаут пула, рестарт пода,
 * сетевой сбой) оставлял мастера с НУЛЁМ `WeeklyScheduleDay`, а
 * `buildWeeklyRule` при отсутствии рабочих дней возвращает `null` — то есть
 * мастер молча исчезал из выдачи слотов и переставал принимать записи. В UI
 * это выглядело как «просто не сохранилось». Соседняя
 * `applyProviderAndDiscountRule` в том же файле транзакцию имела, с
 * комментарием «so a half-applied state is impossible».
 *
 * Предмет теста: (1) все записи идут через ОДИН транзакционный клиент;
 * (2) при ошибке в середине наружу не просачивается ни одна запись мимо
 * транзакции; (3) инвалидация кэша — строго после коммита.
 */

const state = vi.hoisted(() => ({
  failOnWeeklyCreate: false,
  txCalls: 0,
}));

const spies = vi.hoisted(() => ({
  writesOutsideTx: vi.fn(),
  writesInsideTx: vi.fn(),
  invalidate: vi.fn(),
  transactionOptions: vi.fn(),
}));

/** Клиент транзакции: любая запись помечается как «внутри». */
function txClient() {
  const write = (name: string) => async (...args: unknown[]) => {
    spies.writesInsideTx(name, ...args);
    // SCHEDULE-PATTERNS-01: неделя пишется графиком — сбой вбрасывается в
    // запись периода, самый чувствительный шаг (до него прежний период уже
    // обрезан).
    if (name === "schedulePattern.create" && state.failOnWeeklyCreate) {
      throw new Error("connection reset");
    }
    return { id: "x", count: 0 };
  };
  const model = (name: string) => ({
    upsert: write(`${name}.upsert`),
    update: write(`${name}.update`),
    create: write(`${name}.create`),
    createMany: write(`${name}.createMany`),
    deleteMany: write(`${name}.deleteMany`),
    delete: write(`${name}.delete`),
    findUnique: async () => ({ id: "cfg-1", timezone: "Europe/Moscow", days: [] }),
    findFirst: async () => null,
    findMany: async () => [],
    count: async () => 0,
  });
  return {
    weeklyScheduleConfig: model("weeklyScheduleConfig"),
    weeklyScheduleDay: model("weeklyScheduleDay"),
    scheduleTemplate: model("scheduleTemplate"),
    scheduleTemplateBreak: model("scheduleTemplateBreak"),
    scheduleOverride: model("scheduleOverride"),
    scheduleBreak: model("scheduleBreak"),
    schedulePattern: model("schedulePattern"),
    provider: model("provider"),
    discountRule: model("discountRule"),
  };
}

/** Корневой клиент: любая ЗАПИСЬ через него — это запись мимо транзакции. */
function rootModel(name: string) {
  const write = (op: string) => async () => {
    spies.writesOutsideTx(`${name}.${op}`);
    return { id: "x", count: 0 };
  };
  return {
    upsert: write("upsert"),
    update: write("update"),
    create: write("create"),
    createMany: write("createMany"),
    deleteMany: write("deleteMany"),
    delete: write("delete"),
    findUnique: async () => ({ id: "cfg-1", timezone: "Europe/Moscow", days: [] }),
    findFirst: async () => null,
    findMany: async () => [],
    count: async () => 0,
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
      state.txCalls += 1;
      spies.transactionOptions(options);
      return fn(txClient());
    },
    weeklyScheduleConfig: rootModel("weeklyScheduleConfig"),
    weeklyScheduleDay: rootModel("weeklyScheduleDay"),
    scheduleTemplate: rootModel("scheduleTemplate"),
    scheduleTemplateBreak: rootModel("scheduleTemplateBreak"),
    scheduleOverride: rootModel("scheduleOverride"),
    scheduleBreak: rootModel("scheduleBreak"),
    schedulePattern: rootModel("schedulePattern"),
    provider: rootModel("provider"),
    discountRule: rootModel("discountRule"),
  },
}));

vi.mock("@/lib/schedule/slotsCache", () => ({
  invalidateSlotsForMaster: async (...args: unknown[]) => {
    spies.invalidate(...args);
  },
}));

vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import { applyScheduleSnapshot } from "@/lib/schedule/editor";

const WEEK = Array.from({ length: 7 }, (_, index) => ({
  dayOfWeek: index,
  isWorkday: index < 5,
  startTime: "10:00",
  endTime: "19:00",
  breaks: [],
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
}));

beforeEach(() => {
  state.failOnWeeklyCreate = false;
  state.txCalls = 0;
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe("LOGIC-12 · снапшот пишется одной транзакцией", () => {
  it("ни одна запись не уходит мимо транзакции", async () => {
    await applyScheduleSnapshot("prov-1", {
      weekSchedule: WEEK,
      exceptions: [],
      slotStepMin: 30,
    });

    expect(state.txCalls).toBe(1);
    expect(spies.writesInsideTx).toHaveBeenCalled();
    // Ключевое: раньше `saveWeekSchedule` и `saveException` писали корневым
    // клиентом, то есть каждый шаг коммитился сам по себе.
    expect(spies.writesOutsideTx).not.toHaveBeenCalled();
  });

  it("бюджет транзакции больше дефолтных 5 с — внутри циклы, длину которых задаёт пользователь", async () => {
    await applyScheduleSnapshot("prov-1", { weekSchedule: WEEK, exceptions: [] });

    const options = spies.transactionOptions.mock.calls[0]?.[0] as { timeout?: number };
    expect(options?.timeout ?? 5000).toBeGreaterThan(5000);
  });

  it("падение в середине не оставляет записей вне транзакции и не трогает кэш", async () => {
    state.failOnWeeklyCreate = true;

    await expect(
      applyScheduleSnapshot("prov-1", { weekSchedule: WEEK, exceptions: [] }),
    ).rejects.toThrow("connection reset");

    expect(spies.writesOutsideTx).not.toHaveBeenCalled();
    // Инвалидация кэша при откате означала бы сброс под старые данные.
    expect(spies.invalidate).not.toHaveBeenCalled();
  });

  it("кэш инвалидируется ПОСЛЕ коммита, а не внутри", async () => {
    await applyScheduleSnapshot("prov-1", { weekSchedule: WEEK, exceptions: [] });
    expect(spies.invalidate).toHaveBeenCalledWith("prov-1");
  });
});

const SRC = join(process.cwd(), "src");

describe("LOGIC-12 · писатели не имеют доступа к корневому клиенту", () => {
  it("во внутренних writer-хелперах не осталось прямых `prisma.` записей", () => {
    const source = readFileSync(join(SRC, "lib/schedule/editor.ts"), "utf8");
    const writers = source.slice(
      source.indexOf("async function saveWeekSchedule"),
      source.indexOf("export async function buildScheduleSnapshot"),
    );
    // Читатели снапшота (`buildScheduleSnapshot`) корневой клиент используют
    // законно — они вне этого среза.
    expect(writers).not.toMatch(/await prisma\./);
    expect(writers).toMatch(/tx: Prisma\.TransactionClient/);
  });

  it("SCHEDULE-PATTERNS-01: писатель графиков пишет только транзакционным клиентом", () => {
    // Неделя «Часов» пишется графиком (`saveWeekAsPatternTx`), то есть тот же
    // снапшот продолжается в `patterns.ts` / `patterns-core.ts`. Корневой
    // клиент там допустим только в чтении для кабинета (`loadSchedulePlan`).
    const patterns = readFileSync(join(SRC, "lib/schedule/patterns.ts"), "utf8");
    const writers = patterns.slice(0, patterns.indexOf("// ─── Чтение для кабинета"));
    expect(writers.length).toBeGreaterThan(0);
    expect(writers).not.toMatch(/\bprisma\./);

    const core = readFileSync(join(SRC, "lib/schedule/patterns-core.ts"), "utf8");
    expect(core).not.toMatch(/from "@\/lib\/prisma"/);
  });
});

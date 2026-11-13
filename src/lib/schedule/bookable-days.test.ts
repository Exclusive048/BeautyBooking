import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SLOTS-RANGE-CLAMP + BOOKING-DATE-CALENDAR — окно записи длиннее 60 дней и
 * сводка дней календаря на настоящем движке (Prisma и кэш — двойники).
 *
 * График — «2 через 2» с 9 до 20 у мастера в студии (случай владельца
 * 2026-11-13): рабочие дни дают окошки, выходные — нет, ни на одном пути.
 *
 * @probe 2026-11-13 — возвращены прежний предел 60 дней И ветка отказа
 * (конец дальше предела → 400 «Слишком большой диапазон дат.»): покраснели
 * «конец окна дальше 60 дней — не ошибка», «конец дальше горизонта —
 * прижимается, а не 400» и сводка на 92 дня. Только предел 60 без ветки
 * отказа — краснеет одна сводка (окно молча режется до 60 дней). Статус
 * «busy» без плана дня (всегда `off`): покраснел «рабочий день без окошек —
 * busy».
 */

const prismaMock = vi.hoisted(() => ({
  provider: { findUnique: vi.fn(), findMany: vi.fn() },
  service: { findMany: vi.fn() },
  masterService: { findMany: vi.fn() },
  booking: { findMany: vi.fn() },
  timeBlock: { findMany: vi.fn(), aggregate: vi.fn() },
  weeklyScheduleConfig: { findUnique: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  scheduleTemplate: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleOverride: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleBreak: { findMany: vi.fn(), aggregate: vi.fn() },
  schedulePattern: { findMany: vi.fn(), aggregate: vi.fn() },
  $transaction: vi.fn(),
}));
const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key: string, value: unknown) => void store.set(key, value)),
  del: vi.fn(async (key: string) => void store.delete(key)),
  delByPattern: vi.fn(async () => undefined),
  claimLock: vi.fn(async () => ({ status: "acquired" })),
  sAdd: vi.fn(async () => true),
  sMembers: vi.fn(async () => []),
}));

import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { listBookableDays } from "@/lib/schedule/bookable-days";
import { firstFreeDate, mergeBookableDays } from "@/lib/schedule/bookable-days-shared";

const TZ = "Asia/Yekaterinburg";
// 2026-11-13 13:00 по Екатеринбургу.
const NOW = new Date("2026-11-13T08:00:00Z");
const PROVIDER = { id: "p1", timezone: TZ, minBookingHoursAhead: 2 };

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  prismaMock.provider.findUnique.mockResolvedValue({
    id: "p1",
    type: "MASTER",
    studioId: "studioProv",
    timezone: TZ,
    bufferBetweenBookingsMin: 0,
    slotStepMin: 15,
    owner: { providers: [{ id: "p1" }, { id: "personal" }] },
  });
  prismaMock.provider.findMany.mockResolvedValue([{ id: "p1", timezone: TZ }]);
  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.masterService.findMany.mockResolvedValue([
    {
      durationOverrideMin: null,
      isEnabled: true,
      service: { id: "s1", providerId: "studioProv", durationMin: 60, isEnabled: true, isActive: true },
    },
  ]);
  prismaMock.$transaction.mockResolvedValue([
    { _max: { updatedAt: new Date(1750000000000) }, _count: 0 },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null }, _count: 0 },
    { _max: { updatedAt: null }, _count: 1 },
  ]);
  prismaMock.weeklyScheduleConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyScheduleConfig.findMany.mockResolvedValue([]);
  prismaMock.scheduleTemplate.findMany.mockResolvedValue([
    {
      id: "t1",
      providerId: "p1",
      startLocal: "09:00",
      endLocal: "20:00",
      scheduleMode: "FLEXIBLE",
      fixedSlotTimes: [],
      breaks: [],
    },
  ]);
  // «2 через 2» с сегодняшнего дня: 13, 14 — работа, 15, 16 — выходные…
  prismaMock.schedulePattern.findMany.mockResolvedValue([
    {
      providerId: "p1",
      startsOn: "2026-11-13",
      endsOn: null,
      anchorOn: "2026-11-13",
      cycleDays: 4,
      days: [
        { position: 0, templateId: "t1" },
        { position: 1, templateId: "t1" },
        { position: 2, templateId: null },
        { position: 3, templateId: null },
      ],
    },
  ]);
  prismaMock.scheduleOverride.findMany.mockResolvedValue([]);
  prismaMock.scheduleBreak.findMany.mockResolvedValue([]);
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.timeBlock.findMany.mockResolvedValue([]);
});

describe("окно окошек длиннее 60 дней (SLOTS-RANGE-CLAMP)", () => {
  it("конец окна дальше 60 дней — не ошибка", async () => {
    const result = await listAvailabilitySlotsPaginated("p1", "s1", 60, {
      fromKey: "2026-11-13",
      toKeyExclusive: "2027-02-12", // 91 день — «Сколько окошек вперёд» 91
      limit: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("конец дальше горизонта — прижимается, а не 400", async () => {
    const result = await listAvailabilitySlotsPaginated("p1", "s1", 60, {
      fromKey: "2026-11-13",
      toKeyExclusive: "2027-12-31",
      limit: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("конец раньше начала — по-прежнему 400", async () => {
    const result = await listAvailabilitySlotsPaginated("p1", "s1", 60, {
      fromKey: "2026-11-13",
      toKeyExclusive: "2026-11-10",
    });
    expect(result.ok).toBe(false);
  });

  it("«2 через 2»: рабочий день — окошки с 9:00, выходной — пусто", async () => {
    const working = await listAvailabilitySlotsPaginated("p1", "s1", 60, { fromKey: "2026-11-17", limit: 1 });
    const off = await listAvailabilitySlotsPaginated("p1", "s1", 60, { fromKey: "2026-11-15", limit: 1 });
    if (!working.ok || !off.ok) throw new Error("expected ok");
    expect(working.data.slots.length).toBeGreaterThan(0);
    expect(working.data.slots[0]?.label).toBe("2026-11-17 09:00");
    expect(off.data.slots).toEqual([]);
  });
});

describe("сводка дней календаря (BOOKING-DATE-CALENDAR)", () => {
  it("рабочие дни графика — free, остальные — off; окно — до 92 дней вперёд", async () => {
    const result = await listBookableDays({
      provider: PROVIDER,
      serviceId: "s1",
      durationMinutes: 60,
      fromKey: "2026-11-13",
      now: NOW,
      operatorWindow: true,
      allStarts: true,
    });
    if (!result.ok) throw new Error(result.message);
    const { firstDate, lastDate, days } = result.data;
    expect(firstDate).toBe("2026-11-13");
    expect(lastDate).toBe("2027-02-13");
    expect(days).toHaveLength(93);
    const status = Object.fromEntries(days.map((day) => [day.date, day.status]));
    expect(status["2026-11-13"]).toBe("free");
    expect(status["2026-11-14"]).toBe("free");
    expect(status["2026-11-15"]).toBe("off");
    expect(status["2026-11-16"]).toBe("off");
    expect(status["2026-11-17"]).toBe("free");
    expect(status["2027-02-10"]).toBe("free");
    // Прочитано одним проходом, а не страницами по 14 дней.
    expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
  });

  it("рабочий день без окошек — busy", async () => {
    // Весь рабочий день 17-го занят одной записью.
    prismaMock.booking.findMany.mockResolvedValue([
      { startAtUtc: new Date("2026-11-17T04:00:00Z"), endAtUtc: new Date("2026-11-17T15:00:00Z") },
    ]);
    const result = await listBookableDays({
      provider: PROVIDER,
      serviceId: "s1",
      durationMinutes: 60,
      fromKey: "2026-11-17",
      toKeyExclusive: "2026-11-19",
      now: NOW,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.data.days).toEqual([
      { date: "2026-11-17", status: "busy" },
      { date: "2026-11-18", status: "free" },
    ]);
  });

  it("«Максимум вперёд» клиента обрезает окно", async () => {
    const result = await listBookableDays({
      provider: PROVIDER,
      serviceId: "s1",
      durationMinutes: 60,
      fromKey: "2026-11-13",
      now: NOW,
      windowPolicy: { minBookingHoursAhead: 2, maxBookingDaysAhead: 10 },
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.data.lastDate).toBe("2026-11-23");
    expect(result.data.days.at(-1)?.date).toBe("2026-11-23");
  });

  it("начало за окном — пустая сводка, а не ошибка", async () => {
    const result = await listBookableDays({
      provider: PROVIDER,
      serviceId: "s1",
      durationMinutes: 60,
      fromKey: "2026-12-20",
      toKeyExclusive: "2026-12-20",
      now: NOW,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.data.days).toEqual([]);
  });
});

describe("сводка «любого мастера»", () => {
  const a = {
    timezone: TZ,
    firstDate: "2026-11-13",
    lastDate: "2026-11-15",
    days: [
      { date: "2026-11-13", status: "off" as const },
      { date: "2026-11-14", status: "busy" as const },
      { date: "2026-11-15", status: "off" as const },
    ],
  };
  const b = {
    timezone: TZ,
    firstDate: "2026-11-14",
    lastDate: "2026-11-16",
    days: [
      { date: "2026-11-14", status: "free" as const },
      { date: "2026-11-15", status: "busy" as const },
      { date: "2026-11-16", status: "off" as const },
    ],
  };

  it("день свободен, если свободен у кого-то; окно — объединение", () => {
    const merged = mergeBookableDays([a, b]);
    expect(merged?.firstDate).toBe("2026-11-13");
    expect(merged?.lastDate).toBe("2026-11-16");
    expect(merged?.days).toEqual([
      { date: "2026-11-13", status: "off" },
      { date: "2026-11-14", status: "free" },
      { date: "2026-11-15", status: "busy" },
      { date: "2026-11-16", status: "off" },
    ]);
    expect(firstFreeDate(merged)).toBe("2026-11-14");
    expect(firstFreeDate(merged, "2026-11-15")).toBeNull();
  });
});

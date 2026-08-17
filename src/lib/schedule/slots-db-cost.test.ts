import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-04 — публичный `/slots` делал 13 запросов к БД ДО чтения слот-кэша:
 * `provider.findUnique` + `createScheduleContext` (10 round-trip'ов, из них
 * пятиоператорная транзакция ТОЛЬКО ради `scheduleVersion`, то есть ради ключа
 * кэша) + `booking.findMany` + `loadTimeBlockRanges`. Кэш экономил CPU и не
 * экономил БД: при попадании выполнялись ровно те же тринадцать запросов.
 *
 * Пин фиксирует три вещи, каждую с обратной стороной (тест обязан краснеть,
 * если фикс снять):
 *   1. полное попадание в кэш = один запрос (`provider.findUnique`);
 *   2. промах по-прежнему грузит контекст, брони и блокировки — иначе п.1
 *      проходил бы вакуумно (например, из-за раннего выхода);
 *   3. `scheduleVersion` идёт через кэш, а `invalidateSlotsForMaster` его
 *      сбрасывает — это и есть замена «живому» пересчёту версии.
 */

const prismaMock = vi.hoisted(() => ({
  provider: { findUnique: vi.fn() },
  booking: { findMany: vi.fn() },
  timeBlock: { findMany: vi.fn(), aggregate: vi.fn() },
  weeklyScheduleConfig: { findUnique: vi.fn(), aggregate: vi.fn() },
  scheduleTemplate: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleOverride: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleBreak: { findMany: vi.fn(), aggregate: vi.fn() },
  $transaction: vi.fn(),
}));

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  delByPattern: vi.fn(async (pattern: string) => {
    const prefix = pattern.replace(/\*$/, "");
    for (const key of Array.from(store.keys())) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }),
  claimLock: vi.fn(async () => ({ status: "acquired" })),
  // PERF-21: учёт живых слот-ключей мастера. Здесь он настоящий (тот же
  // `store`), потому что от него зависит и запись значения, и путь сброса.
  sAdd: vi.fn(async (key: string, member: string) => {
    const existing = (store.get(key) as string[] | undefined) ?? [];
    if (!existing.includes(member)) store.set(key, [...existing, member]);
    return true;
  }),
  sMembers: vi.fn(async (key: string) => (store.get(key) as string[] | undefined) ?? []),
}));

vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/schedule/available-today-recompute-enqueue", () => ({
  enqueueAvailableTodayRecompute: vi.fn(),
}));

import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { buildSlotsCacheKey, invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { buildScheduleVersionCacheKey } from "@/lib/schedule/schedule-version-cache";
import { resolvePublishedUntilLocal } from "@/lib/schedule/publish-horizon";

const PROVIDER_ID = "prov_1";
const SERVICE_ID = "svc_1";
const TIMEZONE = "Asia/Yekaterinburg";
const DURATION_MIN = 60;
const BUFFER_MIN = 0;
const SLOT_STEP_MIN = 30;
const SCHEDULE_VERSION = "1750000000000:0";
const FROM_KEY = "2026-09-01";
const PAGE_SIZE = 3;

function primeProvider(): void {
  prismaMock.provider.findUnique.mockResolvedValue({
    id: PROVIDER_ID,
    timezone: TIMEZONE,
    bufferBetweenBookingsMin: BUFFER_MIN,
    slotStepMin: SLOT_STEP_MIN,
  });
}

function primeScheduleVersionCache(): void {
  store.set(buildScheduleVersionCacheKey(PROVIDER_ID), {
    value: SCHEDULE_VERSION,
    updatedAtIso: new Date(1750000000000).toISOString(),
  });
}

function primeSlotCacheForDays(dateKeys: string[]): void {
  const publishedUntilLocal = resolvePublishedUntilLocal({
    changeAtUtc: null,
    nowUtc: new Date(),
    timeZone: TIMEZONE,
  });
  for (const dateKey of dateKeys) {
    const key = buildSlotsCacheKey({
      masterId: PROVIDER_ID,
      dateKey,
      serviceId: SERVICE_ID,
      serviceDuration: DURATION_MIN,
      bufferMin: BUFFER_MIN,
      slotStepMin: SLOT_STEP_MIN,
      timeZone: TIMEZONE,
      scheduleVersion: SCHEDULE_VERSION,
      publishedUntilLocal,
    });
    store.set(key, [
      {
        startAtUtc: new Date(`${dateKey}T05:00:00.000Z`),
        endAtUtc: new Date(`${dateKey}T06:00:00.000Z`),
        label: "10:00",
      },
    ]);
  }
}

function primeEmptyScheduleReads(): void {
  // PERF-18: провайдер из транзакции версии убран. PERF-19: пятым агрегатом
  // добавлен `TimeBlock` (метка времени + счётчик строк).
  prismaMock.$transaction.mockResolvedValue([
    { _max: { updatedAt: new Date(1750000000000) } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null } },
    { _max: { updatedAt: null }, _count: 0 },
  ]);
  prismaMock.weeklyScheduleConfig.findUnique.mockResolvedValue(null);
  prismaMock.scheduleTemplate.findMany.mockResolvedValue([]);
  prismaMock.scheduleOverride.findMany.mockResolvedValue([]);
  prismaMock.scheduleBreak.findMany.mockResolvedValue([]);
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.timeBlock.findMany.mockResolvedValue([]);
}

function dbCallCount(): number {
  return (
    prismaMock.provider.findUnique.mock.calls.length +
    prismaMock.booking.findMany.mock.calls.length +
    prismaMock.timeBlock.findMany.mock.calls.length +
    prismaMock.weeklyScheduleConfig.findUnique.mock.calls.length +
    prismaMock.scheduleTemplate.findMany.mock.calls.length +
    prismaMock.scheduleOverride.findMany.mock.calls.length +
    prismaMock.scheduleBreak.findMany.mock.calls.length +
    prismaMock.$transaction.mock.calls.length
  );
}

describe("PERF-04 · слот-кэш экономит обращения к БД, а не только CPU", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    primeProvider();
    primeEmptyScheduleReads();
  });

  it("полное попадание в кэш стоит одного запроса — только чтение провайдера", async () => {
    primeScheduleVersionCache();
    primeSlotCacheForDays(["2026-09-01", "2026-09-02", "2026-09-03"]);

    const result = await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: FROM_KEY,
      limit: PAGE_SIZE,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.slots).toHaveLength(3);

    expect(prismaMock.provider.findUnique).toHaveBeenCalledTimes(1);
    expect(dbCallCount()).toBe(1);

    // Именно те запросы, которые аудит считал безусловными.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.weeklyScheduleConfig.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.scheduleTemplate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.scheduleOverride.findMany).not.toHaveBeenCalled();
    expect(prismaMock.scheduleBreak.findMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
    expect(prismaMock.timeBlock.findMany).not.toHaveBeenCalled();
  });

  it("промах по-прежнему грузит контекст, брони и блокировки", async () => {
    primeScheduleVersionCache();
    // Ни одного дня в кэше — предыдущий тест не должен проходить вакуумно.

    const result = await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: FROM_KEY,
      limit: PAGE_SIZE,
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.weeklyScheduleConfig.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.timeBlock.findMany).toHaveBeenCalledTimes(1);
    expect(dbCallCount()).toBeGreaterThan(1);
  });

  it("частичный промах читает брони и блокировки только за непокрытые дни", async () => {
    primeScheduleVersionCache();
    // Первые два дня в кэше, третий — нет: окно запроса должно начаться с него.
    primeSlotCacheForDays(["2026-09-01", "2026-09-02"]);

    await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: FROM_KEY,
      limit: PAGE_SIZE,
    });

    expect(prismaMock.scheduleOverride.findMany).toHaveBeenCalledTimes(1);
    const overrideWhere = prismaMock.scheduleOverride.findMany.mock.calls[0][0].where as {
      date: { gte: Date; lt: Date };
    };
    // 2026-09-03, а не 2026-09-01.
    expect(overrideWhere.date.gte.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(overrideWhere.date.lt.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("scheduleVersion резолвится через кэш: транзакция за версией идёт один раз, дальше — нет", async () => {
    await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: FROM_KEY,
      limit: PAGE_SIZE,
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(store.has(buildScheduleVersionCacheKey(PROVIDER_ID))).toBe(true);

    prismaMock.$transaction.mockClear();
    await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: FROM_KEY,
      limit: PAGE_SIZE,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("invalidateSlotsForMaster сбрасывает и слоты, и кэш версии", async () => {
    primeScheduleVersionCache();
    primeSlotCacheForDays(["2026-09-01"]);
    expect(store.has(buildScheduleVersionCacheKey(PROVIDER_ID))).toBe(true);

    await invalidateSlotsForMaster(PROVIDER_ID);

    expect(store.has(buildScheduleVersionCacheKey(PROVIDER_ID))).toBe(false);
    expect(Array.from(store.keys()).filter((key) => key.startsWith(`slots:${PROVIDER_ID}:`))).toHaveLength(0);
  });
});

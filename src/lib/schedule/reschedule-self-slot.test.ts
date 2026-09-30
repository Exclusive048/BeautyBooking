import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RESCHEDULE-SELF-SLOT (2026-09-15) — при переносе окно САМОЙ брони не
 * считается занятым.
 *
 * Клиент, записанный на 10:00 с 90-минутной услугой, не мог перенестись на
 * 10:30 при пустом дне: пикер не предлагал слот, потому что `booking.findMany`
 * в `listAvailabilitySlotsPaginated` забирал и его собственную бронь, а
 * запись переноса (`ensureNoConflictsExcluding`) её как раз исключает — то
 * есть сервер принял бы то, чего интерфейс не даёт выбрать.
 *
 * Пин фиксирует три свойства:
 *   1. с `excludeBookingId` запрос броней несёт `id: { not }`;
 *   2. общий слот-кэш ОБХОДИТСЯ — ни чтения (иначе исключение не имело бы
 *      эффекта на прогретом дне), ни записи (иначе следующий клиент получил
 *      бы занятое окно как свободное), ни single-flight;
 *   3. без параметра поведение прежнее — контроль, что п.2 не вакуумен.
 *
 * @probe убран `...(excludeBookingId ? { id: { not } } : {})` из `where` →
 * кейс 1 красный; убран `if (bypassCache) continue` перед записью → кейс 2
 * красный («кэш не пишется»).
 */

const prismaMock = vi.hoisted(() => ({
  provider: { findUnique: vi.fn() },
  booking: { findMany: vi.fn() },
  timeBlock: { findMany: vi.fn(), aggregate: vi.fn() },
  weeklyScheduleConfig: { findUnique: vi.fn(), aggregate: vi.fn() },
  scheduleTemplate: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleOverride: { findMany: vi.fn(), aggregate: vi.fn() },
  scheduleBreak: { findMany: vi.fn(), aggregate: vi.fn() },
  schedulePattern: { findMany: vi.fn(), aggregate: vi.fn() },
  $transaction: vi.fn(),
}));

const store = vi.hoisted(() => new Map<string, unknown>());
const cacheSet = vi.hoisted(() => vi.fn(async (key: string, value: unknown) => {
  store.set(key, value);
}));
const claimLock = vi.hoisted(() => vi.fn(async () => ({ status: "acquired" })));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: cacheSet,
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  delByPattern: vi.fn(async () => undefined),
  claimLock,
  sAdd: vi.fn(async () => true),
  sMembers: vi.fn(async () => []),
}));

vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/schedule/available-today-recompute-enqueue", () => ({
  enqueueAvailableTodayRecompute: vi.fn(),
}));

import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { buildSlotsCacheKey } from "@/lib/schedule/slotsCache";
import { buildScheduleVersionCacheKey } from "@/lib/schedule/schedule-version-cache";
import { resolvePublishedUntilLocal } from "@/lib/schedule/publish-horizon";

const PROVIDER_ID = "prov_1";
const SERVICE_ID = "svc_1";
const TIMEZONE = "Asia/Yekaterinburg";
const DURATION_MIN = 60;
const SCHEDULE_VERSION = "1750000000000:0";
const DAY = "2026-09-21";

function slotCacheKey(dateKey: string): string {
  return buildSlotsCacheKey({
    masterId: PROVIDER_ID,
    dateKey,
    serviceId: SERVICE_ID,
    serviceDuration: DURATION_MIN,
    bufferMin: 0,
    slotStepMin: 30,
    timeZone: TIMEZONE,
    scheduleVersion: SCHEDULE_VERSION,
    publishedUntilLocal: resolvePublishedUntilLocal({
      changeAtUtc: null,
      nowUtc: new Date(),
      timeZone: TIMEZONE,
    }),
  });
}

describe("RESCHEDULE-SELF-SLOT · окно переносимой брони не занято, кэш обходится", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    prismaMock.provider.findUnique.mockResolvedValue({
      id: PROVIDER_ID,
      timezone: TIMEZONE,
      bufferBetweenBookingsMin: 0,
      slotStepMin: 30,
    });
    prismaMock.$transaction.mockResolvedValue([
      { _max: { updatedAt: new Date(1750000000000) } },
      { _max: { updatedAt: null } },
      { _max: { updatedAt: null } },
      { _max: { updatedAt: null } },
      { _max: { updatedAt: null }, _count: 0 },
      { _max: { updatedAt: null }, _count: 0 },
    ]);
    prismaMock.weeklyScheduleConfig.findUnique.mockResolvedValue(null);
    prismaMock.scheduleTemplate.findMany.mockResolvedValue([]);
    prismaMock.scheduleOverride.findMany.mockResolvedValue([]);
    prismaMock.scheduleBreak.findMany.mockResolvedValue([]);
    prismaMock.schedulePattern.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.timeBlock.findMany.mockResolvedValue([]);
    store.set(buildScheduleVersionCacheKey(PROVIDER_ID), {
      value: SCHEDULE_VERSION,
      updatedAtIso: new Date(1750000000000).toISOString(),
    });
    // День прогрет — без исключения он отдался бы из кэша без единого запроса броней.
    store.set(slotCacheKey(DAY), []);
  });

  it("с excludeBookingId брони читаются из БД с `id: { not }`, прогретый кэш игнорируется", async () => {
    const result = await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: DAY,
      limit: 1,
      excludeBookingId: "bk_moving",
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
    const where = prismaMock.booking.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.id).toEqual({ not: "bk_moving" });
  });

  it("выдача без одной брони не пишется в общий кэш и не берёт single-flight", async () => {
    store.delete(slotCacheKey(DAY));
    const setCallsBefore = cacheSet.mock.calls.length;

    await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: DAY,
      limit: 1,
      excludeBookingId: "bk_moving",
    });

    const slotWrites = cacheSet.mock.calls
      .slice(setCallsBefore)
      .filter(([key]) => typeof key === "string" && key.startsWith("slots:"));
    expect(slotWrites).toHaveLength(0);
    expect(store.has(slotCacheKey(DAY))).toBe(false);
    expect(claimLock).not.toHaveBeenCalled();
  });

  it("контроль: без параметра прогретый день отдаётся из кэша, брони не читаются", async () => {
    const result = await listAvailabilitySlotsPaginated(PROVIDER_ID, SERVICE_ID, DURATION_MIN, {
      fromKey: DAY,
      limit: 1,
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });
});

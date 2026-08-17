import { describe, it, expect, beforeEach, vi } from "vitest";

const cacheGet = vi.hoisted(() => vi.fn());
const cacheSet = vi.hoisted(() => vi.fn());
const cacheDel = vi.hoisted(() => vi.fn());
const cacheDelByPattern = vi.hoisted(() => vi.fn());
const cacheSAdd = vi.hoisted(() => vi.fn());
const cacheSMembers = vi.hoisted(() => vi.fn());
const invalidateAdvisorCache = vi.hoisted(() => vi.fn());
const invalidateScheduleVersion = vi.hoisted(() => vi.fn());
const enqueueAvailableTodayRecompute = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache/cache", () => ({
  get: cacheGet,
  set: cacheSet,
  del: cacheDel,
  delByPattern: cacheDelByPattern,
  sAdd: cacheSAdd,
  sMembers: cacheSMembers,
}));

vi.mock("@/lib/advisor/cache", () => ({
  invalidateAdvisorCache,
}));

vi.mock("@/lib/schedule/schedule-version-cache", () => ({
  invalidateScheduleVersion,
}));

vi.mock("@/lib/schedule/available-today-recompute-enqueue", () => ({
  enqueueAvailableTodayRecompute,
}));

import {
  buildSlotsCacheKey,
  getBookingDateKeys,
  invalidateSlotsForDateKeys,
  invalidateSlotsForMaster,
  setCachedSlotsForDate,
} from "@/lib/schedule/slotsCache";

describe("schedule/slotsCache", () => {
  beforeEach(() => {
    cacheGet.mockReset();
    cacheSet.mockReset();
    cacheDel.mockReset();
    cacheDelByPattern.mockReset();
    cacheSAdd.mockReset();
    cacheSAdd.mockResolvedValue(true);
    cacheSMembers.mockReset();
    cacheSMembers.mockResolvedValue([]);
    invalidateAdvisorCache.mockReset();
    invalidateScheduleVersion.mockReset();
    enqueueAvailableTodayRecompute.mockReset();
  });

  it("builds a stable cache key", () => {
    const key = buildSlotsCacheKey({
      masterId: "m1",
      dateKey: "2026-03-03",
      serviceId: "s1",
      serviceDuration: 60,
      bufferMin: 10,
      slotStepMin: 30,
      timeZone: "UTC",
      scheduleVersion: "v1",
      publishedUntilLocal: "2026-04-01",
    });
    expect(key).toBe("slots:m1:2026-03-03:s1:60:10:30:UTC:v1:2026-04-01");
  });

  it("stores slots and registers index", async () => {
    cacheGet.mockResolvedValueOnce(null);
    await setCachedSlotsForDate({
      key: "slots:m1:2026-03-03:s1:60:0:UTC:v1:2026-04-01",
      masterId: "m1",
      dateKey: "2026-03-03",
      slots: [],
    });

    expect(cacheSet).toHaveBeenCalledWith(
      "slots:m1:2026-03-03:s1:60:0:UTC:v1:2026-04-01",
      [],
      120
    );
    expect(cacheSet).toHaveBeenCalledWith("slotsIndex:m1:2026-03-03", [
      "slots:m1:2026-03-03:s1:60:0:UTC:v1:2026-04-01",
    ], 120);
  });

  it("invalidates via index when available", async () => {
    cacheGet.mockResolvedValueOnce([
      "slots:m1:2026-03-03:s1:60:0:UTC:v1:2026-04-01",
      "slots:m1:2026-03-03:s2:60:0:UTC:v1:2026-04-01",
    ]);

    await invalidateSlotsForDateKeys("m1", ["2026-03-03"]);

    expect(cacheDel).toHaveBeenCalledTimes(3);
    expect(cacheDel).toHaveBeenCalledWith("slotsIndex:m1:2026-03-03");
  });

  it("falls back to pattern delete when index is missing", async () => {
    cacheGet.mockResolvedValueOnce(null);
    await invalidateSlotsForDateKeys("m1", ["2026-03-03"]);
    expect(cacheDelByPattern).toHaveBeenCalledWith("slots:m1:2026-03-03:*");
  });

  /**
   * PERF-21 — `delByPattern` обходит ВЕСЬ keyspace (`SCAN MATCH` фильтрует
   * уже выбранные ключи), поэтому сброс кэша мастера стоил тысячи
   * round-trip'ов ради десятка своих ключей. Учёт живых ключей во множестве
   * `slotsKeyset:<master>` делает сброс точечным; пустой ответ означает «учёта
   * нет» и уводит в прежний перебор — направление ошибки в сторону полноты.
   */
  describe("PERF-21 · сброс кэша мастера идёт по учёту, а не перебором keyspace", () => {
    it("удаляет учтённые ключи и не сканирует keyspace", async () => {
      cacheSMembers.mockResolvedValueOnce([
        "slots:m1:2026-03-03:s1:60:0:30:UTC:v1:2026-04-01",
        "slots:m1:2026-03-04:s1:60:0:30:UTC:v1:2026-04-01",
      ]);

      await invalidateSlotsForMaster("m1");

      expect(cacheDel).toHaveBeenCalledWith("slots:m1:2026-03-03:s1:60:0:30:UTC:v1:2026-04-01");
      expect(cacheDel).toHaveBeenCalledWith("slots:m1:2026-03-04:s1:60:0:30:UTC:v1:2026-04-01");
      expect(cacheDel).toHaveBeenCalledWith("slotsKeyset:m1");
      expect(cacheDelByPattern).not.toHaveBeenCalled();
    });

    it("без учёта возвращается к полному перебору — иначе инвалидация пропала бы", async () => {
      cacheSMembers.mockResolvedValueOnce([]);

      await invalidateSlotsForMaster("m1");

      expect(cacheDelByPattern).toHaveBeenCalledWith("slots:m1:*");
    });

    it("запись слотов регистрируется в учёте до самого значения", async () => {
      cacheGet.mockResolvedValueOnce(null);

      await setCachedSlotsForDate({
        key: "slots:m1:2026-03-03:s1:60:0:30:UTC:v1:2026-04-01",
        masterId: "m1",
        dateKey: "2026-03-03",
        slots: [],
      });

      expect(cacheSAdd).toHaveBeenCalledWith(
        "slotsKeyset:m1",
        "slots:m1:2026-03-03:s1:60:0:30:UTC:v1:2026-04-01",
        120,
      );
      expect(cacheSAdd.mock.invocationCallOrder[0]).toBeLessThan(cacheSet.mock.invocationCallOrder[0]);
    });

    it("не пишет значение, если учесть ключ не удалось", async () => {
      // Иначе появился бы слот-ключ, о котором множество не знает, и быстрый
      // путь сброса прошёл бы мимо него.
      cacheSAdd.mockResolvedValueOnce(false);

      await setCachedSlotsForDate({
        key: "slots:m1:2026-03-03:s1:60:0:30:UTC:v1:2026-04-01",
        masterId: "m1",
        dateKey: "2026-03-03",
        slots: [],
      });

      expect(cacheSet).not.toHaveBeenCalled();
    });
  });

  it("calculates booking date keys across days", () => {
    const keys = getBookingDateKeys(
      new Date("2026-03-03T23:00:00Z"),
      new Date("2026-03-04T01:00:00Z"),
      "UTC"
    );
    expect(keys).toEqual(["2026-03-03", "2026-03-04"]);
  });
});

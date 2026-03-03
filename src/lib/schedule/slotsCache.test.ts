const cacheGet = vi.hoisted(() => vi.fn());
const cacheSet = vi.hoisted(() => vi.fn());
const cacheDel = vi.hoisted(() => vi.fn());
const cacheDelByPattern = vi.hoisted(() => vi.fn());
const invalidateAdvisorCache = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache/cache", () => ({
  get: cacheGet,
  set: cacheSet,
  del: cacheDel,
  delByPattern: cacheDelByPattern,
}));

vi.mock("@/lib/advisor/cache", () => ({
  invalidateAdvisorCache,
}));

import {
  buildSlotsCacheKey,
  getBookingDateKeys,
  invalidateSlotsForDateKeys,
  setCachedSlotsForDate,
} from "@/lib/schedule/slotsCache";

describe("schedule/slotsCache", () => {
  beforeEach(() => {
    cacheGet.mockReset();
    cacheSet.mockReset();
    cacheDel.mockReset();
    cacheDelByPattern.mockReset();
    invalidateAdvisorCache.mockReset();
  });

  it("builds a stable cache key", () => {
    const key = buildSlotsCacheKey({
      masterId: "m1",
      dateKey: "2026-03-03",
      serviceId: "s1",
      serviceDuration: 60,
      bufferMin: 10,
      timeZone: "UTC",
      scheduleVersion: "v1",
      publishedUntilLocal: "2026-04-01",
    });
    expect(key).toBe("slots:m1:2026-03-03:s1:60:10:UTC:v1:2026-04-01");
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

  it("calculates booking date keys across days", () => {
    const keys = getBookingDateKeys(
      new Date("2026-03-03T23:00:00Z"),
      new Date("2026-03-04T01:00:00Z"),
      "UTC"
    );
    expect(keys).toEqual(["2026-03-03", "2026-03-04"]);
  });
});

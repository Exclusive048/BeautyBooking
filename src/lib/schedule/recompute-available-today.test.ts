import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks: isolate the targeted-recompute orchestration (load → branch →
// minimal-write → studio fan-out) from the engine + DB. The salon-tz 'today'
// derivation lives INSIDE the (here-mocked) probe helpers and is covered by
// available-today.test.ts (Vision +5); this suite pins the recompute logic.
const { findUnique, findMany, updateMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));
const { providerHasFreeSlotToday, hasFreeSlotToday } = vi.hoisted(() => ({
  providerHasFreeSlotToday: vi.fn(),
  hasFreeSlotToday: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { findUnique, findMany, updateMany } },
}));
vi.mock("@/lib/schedule/available-today", () => ({
  providerHasFreeSlotToday,
  hasFreeSlotToday,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
// CATALOG-DATE-TIME-FILTER: снимок свободного времени считается тем же
// проходом; здесь он неизменен (пишется только изменившийся), чтобы не
// вмешиваться в оркестрацию `availableToday`.
vi.mock("@/lib/schedule/free-slot-keys", () => ({
  computeFreeSlotKeys: vi.fn(async (provider: { freeSlotKeys?: string[] }) => provider.freeSlotKeys ?? []),
  sameFreeSlotKeys: () => true,
}));

import { recomputeAvailableToday, recomputeAvailableTodayForProvider } from "./recompute-available-today";

const NOW = new Date("2026-07-10T08:00:00.000Z");

const PROBE_FIELDS = {
  timezone: "Asia/Yekaterinburg",
  slotStepMin: null,
  minBookingHoursAhead: null,
  bufferBetweenBookingsMin: null,
};

function master(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    type: "MASTER",
    availableToday: true,
    studioId: null,
    ...PROBE_FIELDS,
    ...overrides,
  };
}

function studio(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    type: "STUDIO",
    availableToday: true,
    studioId: null,
    ...PROBE_FIELDS,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("recomputeAvailableTodayForProvider — solo master", () => {
  it("flips availableToday=false when the master's last slot today gets booked", async () => {
    findUnique.mockResolvedValueOnce(master({ availableToday: true }));
    providerHasFreeSlotToday.mockResolvedValueOnce(false);

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    // salon-tz agreement: the exact `now` reaches the pure probe (which derives
    // salon-local 'today' the same way the sweep does).
    expect(providerHasFreeSlotToday).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1" }),
      NOW,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "m1", availableToday: { not: false } },
      data: { availableToday: false },
    });
    expect(summary).toEqual({ total: 1, changed: 1, errored: 0, erroredIds: [] });
  });

  it("flips availableToday=true when a booking is cancelled and a slot frees", async () => {
    findUnique.mockResolvedValueOnce(master({ availableToday: false }));
    providerHasFreeSlotToday.mockResolvedValueOnce(true);

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "m1", availableToday: { not: true } },
      data: { availableToday: true },
    });
    expect(summary.changed).toBe(1);
  });

  it("writes nothing when the value is unchanged (minimal-write / idempotent)", async () => {
    findUnique.mockResolvedValueOnce(master({ availableToday: true }));
    providerHasFreeSlotToday.mockResolvedValueOnce(true);

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(updateMany).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 1, changed: 0, errored: 0, erroredIds: [] });
  });

  it("does not fan out for a solo master (no studioId)", async () => {
    findUnique.mockResolvedValueOnce(master({ studioId: null, availableToday: true }));
    providerHasFreeSlotToday.mockResolvedValueOnce(true);

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(findUnique).toHaveBeenCalledTimes(1); // no studio load
    expect(hasFreeSlotToday).not.toHaveBeenCalled();
    expect(summary.total).toBe(1);
  });
});

describe("recomputeAvailableTodayForProvider — studio fan-out (OR semantics)", () => {
  it("flips the studio busy too when the last free master gets booked", async () => {
    findUnique
      .mockResolvedValueOnce(master({ studioId: "s1", availableToday: true }))
      .mockResolvedValueOnce(studio({ availableToday: true }));
    providerHasFreeSlotToday.mockResolvedValueOnce(false); // m1 now booked full
    hasFreeSlotToday.mockResolvedValueOnce(false); // studio: NO other active master free

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(hasFreeSlotToday).toHaveBeenCalledWith("s1", NOW); // studio uses OR-helper
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "m1", availableToday: { not: false } },
      data: { availableToday: false },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s1", availableToday: { not: false } },
      data: { availableToday: false },
    });
    expect(summary).toEqual({ total: 2, changed: 2, errored: 0, erroredIds: [] });
  });

  it("keeps the studio free when ANOTHER active master is still free (OR semantics)", async () => {
    findUnique
      .mockResolvedValueOnce(master({ studioId: "s1", availableToday: true }))
      .mockResolvedValueOnce(studio({ availableToday: true }));
    providerHasFreeSlotToday.mockResolvedValueOnce(false); // m1 booked full
    hasFreeSlotToday.mockResolvedValueOnce(true); // studio: another master still free

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    // master flips false, but the studio must NOT be flipped (someone else is free)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "m1", availableToday: { not: false } },
      data: { availableToday: false },
    });
    expect(updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "s1" }) }),
    );
    expect(summary).toEqual({ total: 2, changed: 1, errored: 0, erroredIds: [] });
  });
});

describe("recomputeAvailableTodayForProvider — resilience", () => {
  it("no-ops on a missing provider (total 0, no write)", async () => {
    findUnique.mockResolvedValueOnce(null);

    const summary = await recomputeAvailableTodayForProvider("gone", NOW);

    expect(updateMany).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 0, changed: 0, errored: 0, erroredIds: [] });
  });

  it("records an error and skips fan-out when the master probe throws", async () => {
    findUnique.mockResolvedValueOnce(master({ studioId: "s1" }));
    providerHasFreeSlotToday.mockRejectedValueOnce(new Error("engine boom"));

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(hasFreeSlotToday).not.toHaveBeenCalled(); // no studio fan-out on failure
    expect(updateMany).not.toHaveBeenCalled();
    expect(summary.errored).toBe(1);
    expect(summary.erroredIds).toEqual(["m1"]);
  });
});

/**
 * AVAILABLE-TODAY-SWEEP-WRITE (B-06) — свип пишет флаг сразу после пробы
 * провайдера и условием `not: free`, а не пачкой в конце прохода по снимку
 * начала.
 *
 * @probe Вернул пропуск по снимку начала прохода (`if (free ===
 * provider.availableToday) continue;` перед записью) — краснеют «каждый
 * провайдер пишется сразу…»: «expected [ 'probe:m1', 'write:m1', 'probe:m2' ]
 * to deeply equal [ 'probe:m1', 'write:m1', …(2) ]» и «снимок начала прохода
 * устарел…»: «expected "vi.fn()" to be called with arguments: [ { where: { id:
 * 'm1', …(1) }, …(1) } ]». Убрал условие `availableToday: { not: free }` из
 * `where` — краснеют все три: «expected [ { where: { id: 'm1' }, …(1) }, …(1) ]
 * to deeply equal [ { …(2) }, { …(2) } ]».
 */
describe("recomputeAvailableToday — свип (AVAILABLE-TODAY-SWEEP-WRITE)", () => {
  it("каждый провайдер пишется сразу после своей пробы, условием not: free", async () => {
    findMany.mockResolvedValue([master({ id: "m1", availableToday: true }), master({ id: "m2", availableToday: false })]);
    const events: string[] = [];
    providerHasFreeSlotToday.mockImplementation(async (provider: { id: string }) => {
      events.push(`probe:${provider.id}`);
      return false;
    });
    updateMany.mockImplementation(async (args: { where: { id: string } }) => {
      events.push(`write:${args.where.id}`);
      return { count: args.where.id === "m1" ? 1 : 0 };
    });

    const summary = await recomputeAvailableToday(NOW);

    // Запись m1 — до пробы m2: значение не лежит в памяти весь проход.
    expect(events).toEqual(["probe:m1", "write:m1", "probe:m2", "write:m2"]);
    expect(updateMany.mock.calls.map((call) => call[0])).toEqual([
      { where: { id: "m1", availableToday: { not: false } }, data: { availableToday: false } },
      { where: { id: "m2", availableToday: { not: false } }, data: { availableToday: false } },
    ]);
    // `changed` — строки, перевёрнутые на деле, а не расхождения со снимком.
    expect(summary).toMatchObject({ total: 2, changed: 1, errored: 0 });
  });

  it("снимок начала прохода устарел — посчитанное значение всё равно доходит до базы", async () => {
    // В начале прохода было true; пока свип шёл, точечный пересчёт записал
    // false, а к пробе m1 окошко снова свободно. Пропуск «как в снимке» оставил
    // бы в базе false.
    findMany.mockResolvedValue([master({ id: "m1", availableToday: true })]);
    providerHasFreeSlotToday.mockResolvedValue(true);
    updateMany.mockResolvedValue({ count: 1 });

    const summary = await recomputeAvailableToday(NOW);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "m1", availableToday: { not: true } },
      data: { availableToday: true },
    });
    expect(summary.changed).toBe(1);
  });

  it("сбой пробы одного провайдера: прежнее значение, проход идёт дальше", async () => {
    findMany.mockResolvedValue([master({ id: "m1" }), studio({ id: "s1", availableToday: false })]);
    providerHasFreeSlotToday.mockRejectedValue(new Error("engine down"));
    hasFreeSlotToday.mockResolvedValue(true);

    const summary = await recomputeAvailableToday(NOW);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s1", availableToday: { not: true } },
      data: { availableToday: true },
    });
    expect(summary).toMatchObject({ total: 2, changed: 1, errored: 1, erroredIds: ["m1"] });
  });
});

describe("engine-safety (source-level)", () => {
  it("the targeted recompute imports only the pure read path — never the cache-writing slot modules", () => {
    // A module can only CALL what it imports. This reuses the Phase-1 pure
    // helpers and never imports the slot-cache-WRITING modules
    // (`usecases` → `listAvailabilitySlotsPaginated`, `slotsCache` →
    // `setCachedSlotsForDate`). So slot-generation output stays byte-identical.
    const src = readFileSync("src/lib/schedule/recompute-available-today.ts", "utf8");
    expect(src).toContain('from "@/lib/schedule/available-today"');
    expect(src).not.toContain('from "@/lib/schedule/usecases"');
    expect(src).not.toContain('from "@/lib/schedule/slotsCache"');
  });

  it("the enqueue helper stays queue-only (no schedule/slots import → no cycle)", () => {
    const src = readFileSync(
      "src/lib/schedule/available-today-recompute-enqueue.ts",
      "utf8",
    );
    expect(src).not.toContain("@/lib/schedule/slots");
    expect(src).not.toContain("@/lib/schedule/available-today\"");
    expect(src).not.toContain("@/lib/schedule/recompute-available-today");
  });
});

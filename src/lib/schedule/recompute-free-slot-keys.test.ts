import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CATALOG-DATE-TIME-FILTER — снимок свободного времени пересчитывается тем же
 * проходом, что `availableToday`: пишется только изменившийся, а сбой расчёта
 * оставляет прежний снимок (пустой спрятал бы провайдера из фильтра «когда»).
 *
 * @probe 2026-09-24 — в `refreshFreeSlotKeys` убрана проверка
 * `sameFreeSlotKeys` (запись всегда): красный «неизменный снимок не пишется».
 * @probe 2026-09-24 — в `catch` снимок сбрасывается в `[]`: красный «сбой
 * расчёта — прежний снимок».
 */

const { findUnique, updateMany, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));
const { computeFreeSlotKeys } = vi.hoisted(() => ({ computeFreeSlotKeys: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique, updateMany, update } } }));
vi.mock("@/lib/schedule/available-today", () => ({
  providerHasFreeSlotToday: vi.fn(async () => true),
  hasFreeSlotToday: vi.fn(async () => true),
}));
vi.mock("@/lib/schedule/free-slot-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/free-slot-keys")>()),
  computeFreeSlotKeys,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { recomputeAvailableTodayForProvider } from "./recompute-available-today";

const NOW = new Date("2026-09-24T08:00:00.000Z");

function master(freeSlotKeys: string[]) {
  return {
    id: "m1",
    type: "MASTER",
    availableToday: true,
    studioId: null,
    timezone: "Asia/Yekaterinburg",
    slotStepMin: null,
    minBookingHoursAhead: null,
    maxBookingDaysAhead: 30,
    visibleSlotDays: 30,
    bufferBetweenBookingsMin: null,
    freeSlotKeys,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("снимок свободного времени в пересчёте", () => {
  it("изменившийся снимок пишется", async () => {
    findUnique.mockResolvedValueOnce(master(["2026-09-24"]));
    computeFreeSlotKeys.mockResolvedValueOnce(["2026-09-25", "2026-09-25T13"]);

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { freeSlotKeys: ["2026-09-25", "2026-09-25T13"] },
    });
    expect(summary.freeSlotKeysChanged).toBe(1);
  });

  it("неизменный снимок не пишется", async () => {
    findUnique.mockResolvedValueOnce(master(["2026-09-25T13", "2026-09-25"]));
    computeFreeSlotKeys.mockResolvedValueOnce(["2026-09-25", "2026-09-25T13"]);

    await recomputeAvailableTodayForProvider("m1", NOW);

    expect(update).not.toHaveBeenCalled();
  });

  it("сбой расчёта — прежний снимок", async () => {
    findUnique.mockResolvedValueOnce(master(["2026-09-25"]));
    computeFreeSlotKeys.mockRejectedValueOnce(new Error("engine down"));

    const summary = await recomputeAvailableTodayForProvider("m1", NOW);

    expect(update).not.toHaveBeenCalled();
    // пересчёт `availableToday` при этом не прерывается
    expect(summary.errored).toBe(0);
  });
});

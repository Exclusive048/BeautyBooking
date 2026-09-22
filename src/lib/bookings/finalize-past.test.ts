import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BOOKING-FINALIZE-01 — подтверждённый визит после окончания пишется `FINISHED`.
 *
 * @probe 2026-09-22 — в `finalize-past.ts` `FINALIZABLE_STATUSES` дополнен
 * `PENDING`: красным стал «неподтверждённая запись завершённой не объявляется».
 * `cutoff` без вычета grace (`now`) красит кейс момента. Возвращено — зелёные.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  applyBookingTransition: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findMany: mocks.findMany } } }));
vi.mock("@/lib/bookings/transition", () => ({ applyBookingTransition: mocks.applyBookingTransition }));

import { AppError } from "@/lib/api/errors";
import { finalizePastBookings } from "@/lib/bookings/finalize-past";

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.applyBookingTransition.mockReset();
});

describe("BOOKING-FINALIZE-01", () => {
  it("берёт подтверждённые визиты, закончившиеся больше 60 минут назад", async () => {
    mocks.findMany.mockResolvedValue([]);
    await finalizePastBookings(new Date("2026-09-22T12:00:00Z"));

    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.endAtUtc).toEqual({ lte: new Date("2026-09-22T11:00:00Z") });
    expect(where.status.in).toEqual(["CONFIRMED", "PREPAID", "STARTED", "IN_PROGRESS"]);
  });

  it("неподтверждённая запись завершённой не объявляется", async () => {
    mocks.findMany.mockResolvedValue([]);
    await finalizePastBookings(new Date("2026-09-22T12:00:00Z"));

    const statuses: string[] = mocks.findMany.mock.calls[0][0].where.status.in;
    expect(statuses).not.toContain("PENDING");
    expect(statuses).not.toContain("CHANGE_REQUESTED");
  });

  it("пишет через примитив переходов с наблюдённым статусом", async () => {
    mocks.findMany.mockResolvedValue([{ id: "b1", status: "CONFIRMED" }]);
    mocks.applyBookingTransition.mockResolvedValue({ id: "b1" });

    const summary = await finalizePastBookings(new Date("2026-09-22T12:00:00Z"));

    expect(mocks.applyBookingTransition).toHaveBeenCalledWith(expect.anything(), {
      id: "b1",
      expectedStatus: "CONFIRMED",
      data: { status: "FINISHED" },
      select: { id: true },
    });
    expect(summary).toEqual({ candidates: 1, finished: 1 });
  });

  it("статус, изменённый человеком за это время, пропускается, а не затирается", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "b1", status: "CONFIRMED" },
      { id: "b2", status: "CONFIRMED" },
    ]);
    mocks.applyBookingTransition
      .mockRejectedValueOnce(new AppError("changed", 409, "BOOKING_STATUS_CHANGED"))
      .mockResolvedValueOnce({ id: "b2" });

    const summary = await finalizePastBookings(new Date("2026-09-22T12:00:00Z"));

    expect(summary).toEqual({ candidates: 2, finished: 1 });
  });
});

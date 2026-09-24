import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PENDING-EXPIRY (решение владельца 2026-09-24) — неподтверждённая запись
 * отменяется через 24 ч после создания или к началу визита.
 *
 * @probe 2026-09-24 — в `pendingExpiryWhere` убрана ветка `startAtUtc <= now`:
 * красный «срок — 24 ч после создания или начало визита». Возвращено — зелёный.
 * @probe 2026-09-24 — в `expirePackage` снята проверка «все живые компоненты
 * неподтверждены»: красный «пакет с подтверждённой частью не трогается».
 * Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  packageFindUnique: vi.fn(),
  packageUpdate: vi.fn(async () => ({})),
  applyBookingTransition: vi.fn(async () => ({ id: "x" })),
  invalidate: vi.fn(async () => undefined),
  load: vi.fn(async (id: string) => ({ id })),
  notify: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: mocks.findMany },
    bookingPackage: { findUnique: mocks.packageFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ bookingPackage: { update: mocks.packageUpdate } }),
  },
}));
vi.mock("@/lib/bookings/transition", () => ({ applyBookingTransition: mocks.applyBookingTransition }));
vi.mock("@/lib/bookings/slot-invalidation", () => ({ invalidateSlotsForBookingRange: mocks.invalidate }));
vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingWithRelations: mocks.load,
  notifyPendingBookingExpired: mocks.notify,
}));

import { AppError } from "@/lib/api/errors";
import { expirePendingBookings, pendingExpiryWhere } from "@/lib/bookings/expire-pending";

const NOW = new Date("2026-09-24T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3600_000);

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    status: "PENDING",
    bookingPackageId: null,
    providerId: "p1",
    masterProviderId: "m1",
    startAtUtc: hours(5),
    endAtUtc: hours(6),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pendingExpiryWhere", () => {
  it("срок — 24 ч после создания или начало визита, только NEW/PENDING", () => {
    const where = pendingExpiryWhere(NOW);
    expect(where.status).toEqual({ in: ["NEW", "PENDING"] });
    expect(where.OR).toEqual([{ createdAt: { lte: hours(-24) } }, { startAtUtc: { lte: NOW } }]);
  });
});

describe("expirePendingBookings", () => {
  it("отменяет системой с причиной и уведомляет, пока визит впереди", async () => {
    mocks.findMany.mockResolvedValue([row("b1")]);

    const summary = await expirePendingBookings(NOW);

    expect(summary).toEqual({ candidates: 1, expired: 1 });
    expect(mocks.applyBookingTransition).toHaveBeenCalledWith(expect.anything(), {
      id: "b1",
      expectedStatus: "PENDING",
      data: expect.objectContaining({ status: "REJECTED", cancelledBy: "SYSTEM", cancelledAtUtc: NOW }),
      select: { id: true },
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("закончившийся визит — уборка без уведомлений", async () => {
    mocks.findMany.mockResolvedValue([row("b1", { startAtUtc: hours(-30), endAtUtc: hours(-29) })]);

    await expirePendingBookings(NOW);

    expect(mocks.applyBookingTransition).toHaveBeenCalledTimes(1);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("мастер успел подтвердить — строка пропускается", async () => {
    mocks.findMany.mockResolvedValue([row("b1")]);
    mocks.applyBookingTransition.mockRejectedValueOnce(
      new AppError("Статус записи изменился.", 409, "BOOKING_STATUS_CHANGED"),
    );

    const summary = await expirePendingBookings(NOW);

    expect(summary.expired).toBe(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("пакет отменяется целиком, одно уведомление", async () => {
    mocks.findMany.mockResolvedValue([
      row("c1", { bookingPackageId: "pkg" }),
      row("c2", { bookingPackageId: "pkg" }),
    ]);
    mocks.packageFindUnique.mockResolvedValue({
      id: "pkg",
      status: "ACTIVE",
      bookings: [row("c1"), row("c2", { startAtUtc: hours(7), endAtUtc: hours(8) })],
    });

    const summary = await expirePendingBookings(NOW);

    expect(summary.expired).toBe(2);
    expect(mocks.applyBookingTransition).toHaveBeenCalledTimes(2);
    expect(mocks.packageUpdate).toHaveBeenCalledWith({ where: { id: "pkg" }, data: { status: "CANCELLED" } });
    expect(mocks.packageFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("пакет с подтверждённой частью не трогается", async () => {
    mocks.findMany.mockResolvedValue([row("c1", { bookingPackageId: "pkg" })]);
    mocks.packageFindUnique.mockResolvedValue({
      id: "pkg",
      status: "ACTIVE",
      bookings: [row("c1"), row("c2", { status: "CONFIRMED" })],
    });

    const summary = await expirePendingBookings(NOW);

    expect(summary.expired).toBe(0);
    expect(mocks.applyBookingTransition).not.toHaveBeenCalled();
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });
});

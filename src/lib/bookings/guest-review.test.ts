import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 05 — отзыв гостя по ссылке «Управлять записью».
 *
 * @probe 2026-09-29 — в `createGuestReview` убрана проверка
 * `scope.bookingIds.includes`: покраснел «чужую запись ссылкой не оценить».
 * Возвращено — зелёный.
 * @probe 2026-09-29 — `left` считается как `row.review === undefined` (отзыв
 * «не оставлен» всегда): покраснел «оставленный отзыв — второй нельзя».
 * Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  bookingFindMany: vi.fn(),
  createReview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret-guest-review" } }));
vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findMany: mocks.bookingFindMany } } }));
vi.mock("@/lib/legal/consent", () => ({ isGuestClassProfile: vi.fn(async () => true) }));
vi.mock("@/lib/reviews/service", () => ({ createReview: mocks.createReview }));
vi.mock("@/lib/bookings/usecases", () => ({ rescheduleBooking: vi.fn() }));
vi.mock("@/lib/bookings/cancelBooking", () => ({ cancelBooking: vi.fn() }));
vi.mock("@/lib/bookings/package-booking", () => ({ cancelSoloPackageBooking: vi.fn() }));
vi.mock("@/lib/bookings/slot-freed-enqueue", () => ({ enqueueSlotFreedJob: vi.fn() }));
vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingWithRelations: vi.fn(async () => null),
  notifyCancelledByClient: vi.fn(),
  notifyRescheduleRequested: vi.fn(),
}));

import { AppError } from "@/lib/api/errors";
import { createGuestReview, getGuestManageView, type GuestManageScope } from "@/lib/bookings/guest-manage";

const SCOPE: GuestManageScope = {
  bookingId: "b1",
  clientUserId: "guest-1",
  bookingPackageId: null,
  bookingIds: ["b1"],
};

// Визит 28.09 10:00–11:00 UTC; «сейчас» — 28.09 13:00, окно отзыва открыто.
const NOW = new Date("2026-09-28T13:00:00Z");

function row(review: { id: string } | null) {
  return {
    id: "b1",
    status: "CONFIRMED",
    startAtUtc: new Date("2026-09-28T10:00:00Z"),
    endAtUtc: new Date("2026-09-28T11:00:00Z"),
    proposedStartAt: null,
    providerId: "p1",
    masterProviderId: "p1",
    serviceId: "s1",
    clientUserId: "guest-1",
    service: { name: "Маникюр", title: "Маникюр", durationMin: 60 },
    serviceItems: [{ titleSnapshot: "Маникюр" }],
    review,
    provider: {
      name: "Анна",
      publicUsername: "anna",
      type: "MASTER",
      address: null,
      timezone: "Asia/Yekaterinburg",
      cancellationDeadlineHours: 24,
    },
    masterProvider: { name: "Анна", timezone: "Asia/Yekaterinburg" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createGuestReview", () => {
  it("чужую запись ссылкой не оценить", async () => {
    const error = await createGuestReview(SCOPE, {
      bookingId: "other",
      rating: 5,
      publicTagIds: [],
      privateTagIds: [],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("GUEST_MANAGE_LINK_INVALID");
    expect(mocks.createReview).not.toHaveBeenCalled();
  });

  it("своя запись — те же правила, что у клиента в кабинете, от имени гостя", async () => {
    mocks.createReview.mockResolvedValue({ id: "r1" });
    await createGuestReview(SCOPE, { bookingId: "b1", rating: 4, text: "ok", publicTagIds: [], privateTagIds: [] });
    expect(mocks.createReview).toHaveBeenCalledWith({
      currentUserId: "guest-1",
      bookingId: "b1",
      rating: 4,
      text: "ok",
      publicTagIds: [],
      privateTagIds: [],
    });
  });
});

describe("getGuestManageView — отзыв", () => {
  it("после визита в окне — можно оставить, срок — конец окна", async () => {
    mocks.bookingFindMany.mockResolvedValue([row(null)]);
    const view = await getGuestManageView(SCOPE, NOW);
    expect(view.items[0]?.review).toMatchObject({ canLeave: true, left: false });
    expect(view.items[0]?.review.deadlineUtc).not.toBeNull();
  });

  it("оставленный отзыв — второй нельзя", async () => {
    mocks.bookingFindMany.mockResolvedValue([row({ id: "r1" })]);
    const view = await getGuestManageView(SCOPE, NOW);
    expect(view.items[0]?.review).toMatchObject({ canLeave: false, left: true });
  });

  it("до конца визита — ещё нельзя", async () => {
    mocks.bookingFindMany.mockResolvedValue([row(null)]);
    const view = await getGuestManageView(SCOPE, new Date("2026-09-28T10:30:00Z"));
    expect(view.items[0]?.review.canLeave).toBe(false);
  });
});

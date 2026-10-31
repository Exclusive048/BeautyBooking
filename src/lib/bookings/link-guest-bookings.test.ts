import { describe, it, expect, beforeEach, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
const bookingCount = vi.hoisted(() => vi.fn());
const bookingUpdateMany = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    booking: {
      count: bookingCount,
      updateMany: bookingUpdateMany,
    },
  },
}));

vi.mock("@/lib/logging/logger", () => ({
  logInfo,
}));

import { buildPhoneVariantsForMatch, linkGuestBookingsToUserByPhone } from "@/lib/bookings/link-guest-bookings";

describe("bookings/link-guest-bookings", () => {
  beforeEach(() => {
    transaction.mockReset();
    bookingCount.mockReset();
    bookingUpdateMany.mockReset();
    logInfo.mockReset();
  });

  it("builds phone variants and normalizes phone", () => {
    const result = buildPhoneVariantsForMatch("8 (999) 123-45-67");
    expect(result.normalized).toBe("+89991234567");
    expect(result.variants.length).toBeGreaterThan(0);
  });

  it("returns empty result for missing user id", async () => {
    const result = await linkGuestBookingsToUserByPhone({ userProfileId: "", phoneRaw: "+79991234567" });
    expect(result).toEqual({ matched: 0, linked: 0, skippedAlreadyLinked: 0, skippedOtherOwner: 0 });
  });

  it("links bookings and returns counts", async () => {
    transaction.mockResolvedValueOnce([1, 2, { count: 3 }]);

    const result = await linkGuestBookingsToUserByPhone({
      userProfileId: "user-1",
      phoneRaw: "+79991234567",
    });

    expect(result).toEqual({ matched: 6, linked: 3, skippedAlreadyLinked: 1, skippedOtherOwner: 2 });
    expect(logInfo).toHaveBeenCalledTimes(1);
  });
  it("забирает записи без клиента и записи безномерного пассивного профиля (MANUAL-BOOKING-CLIENT-LINK)", async () => {
    transaction.mockResolvedValueOnce([0, 0, { count: 2 }]);
    await linkGuestBookingsToUserByPhone({ userProfileId: "user-1", phoneRaw: "+79991234567" });

    const where = bookingUpdateMany.mock.calls[0]?.[0]?.where as { AND: Array<Record<string, unknown>> };
    const owner = where.AND[1] as { OR: Array<Record<string, unknown>> };
    expect(owner.OR[0]).toEqual({ clientUserId: null });
    const adoptable = (owner.OR[1] as { clientUser: Record<string, unknown> }).clientUser;
    // Профиль, держащий номер, сам станет аккаунтом при входе — его не трогаем.
    expect(adoptable.phone).toBeNull();
    expect(adoptable.isDeleted).toBe(false);
    expect(adoptable.refreshSessions).toEqual({ none: {} });

    // «Чужой владелец» в счётчике — только тот, у кого записи забрать нельзя.
    const otherOwnerWhere = JSON.stringify(bookingCount.mock.calls[1]?.[0]?.where);
    expect(otherOwnerWhere).toContain('"NOT":{"clientUser"');
  });
});

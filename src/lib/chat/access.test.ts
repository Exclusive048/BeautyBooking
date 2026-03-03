import { describe, it, expect, beforeEach, vi } from "vitest";
import { BookingStatus } from "@prisma/client";
const bookingFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: bookingFindUnique },
  },
}));

import { resolveChatAccess, resolveChatAccessForBooking } from "@/lib/chat/access";

describe("chat/access", () => {
  beforeEach(() => {
    bookingFindUnique.mockReset();
  });

  it("denies access when booking is missing", () => {
    const result = resolveChatAccessForBooking(null, "user-1");
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("allows client access for active booking", () => {
    const booking = {
      id: "b1",
      status: BookingStatus.CONFIRMED,
      startAtUtc: new Date(),
      clientUserId: "user-1",
      masterProvider: { ownerUserId: "master-1" },
    };
    const result = resolveChatAccessForBooking(booking, "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.senderType).toBe("CLIENT");
    }
  });

  it("denies access for unrelated user", () => {
    const booking = {
      id: "b1",
      status: BookingStatus.CONFIRMED,
      startAtUtc: new Date(),
      clientUserId: "user-1",
      masterProvider: { ownerUserId: "master-1" },
    };
    const result = resolveChatAccessForBooking(booking, "user-2");
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("loads booking via prisma for resolveChatAccess", async () => {
    bookingFindUnique.mockResolvedValueOnce({
      id: "b1",
      status: BookingStatus.CONFIRMED,
      startAtUtc: new Date(),
      clientUserId: "user-1",
      masterProvider: { ownerUserId: "master-1", name: "Master" },
    });

    const result = await resolveChatAccess("b1", "user-1");
    expect(result.ok).toBe(true);
  });
});

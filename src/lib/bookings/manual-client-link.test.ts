import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findUnique } } }));

import { resolveVerifiedPhoneOwnerId } from "@/lib/bookings/manual-client-link";

/**
 * MANUAL-BOOKING-CLIENT-LINK — ручная запись получает клиента сразу, только
 * если номер ДОКАЗАН его аккаунтом (инв. #46).
 */
describe("resolveVerifiedPhoneOwnerId", () => {
  beforeEach(() => findUnique.mockReset());

  it("подтверждённый владелец номера — клиент записи; номер канонизируется", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", phoneVerifiedAt: new Date(), isDeleted: false });
    await expect(resolveVerifiedPhoneOwnerId("8 (999) 123-45-67")).resolves.toBe("u1");
    expect(findUnique.mock.calls[0]?.[0]?.where).toEqual({ phone: "+79991234567" });
  });

  it("заявка без доказательства и удалённый аккаунт записи не получают", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", phoneVerifiedAt: null, isDeleted: false });
    await expect(resolveVerifiedPhoneOwnerId("+79991234567")).resolves.toBeNull();
    findUnique.mockResolvedValueOnce({ id: "u2", phoneVerifiedAt: new Date(), isDeleted: true });
    await expect(resolveVerifiedPhoneOwnerId("+79991234567")).resolves.toBeNull();
  });

  it("без номера и с нечитаемым номером — без запроса", async () => {
    await expect(resolveVerifiedPhoneOwnerId(undefined)).resolves.toBeNull();
    await expect(resolveVerifiedPhoneOwnerId("12")).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

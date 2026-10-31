import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findUnique }, booking: { findFirst } } }));

import { resolveVerifiedPhoneOwnerId } from "@/lib/bookings/manual-client-link";

/**
 * MANUAL-BOOKING-CLIENT-LINK — ручная запись получает клиента сразу, только
 * если номер ДОКАЗАН его аккаунтом (инв. #46) и он уже записывался на эту
 * поверхность: чужой номер не раскрывает оператору ни факт регистрации, ни
 * переписку с незнакомцем.
 *
 * @probe убрать проверку `known` → падает «незнакомый оператору клиент …»
 *   (expected 'u1' to be null).
 */
const SURFACE = { providerId: "p1" };

describe("resolveVerifiedPhoneOwnerId", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
  });

  it("подтверждённый владелец, уже записывавшийся сюда, — клиент записи; номер канонизируется", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", phoneVerifiedAt: new Date(), isDeleted: false });
    findFirst.mockResolvedValueOnce({ id: "b0" });
    await expect(resolveVerifiedPhoneOwnerId("8 (999) 123-45-67", SURFACE)).resolves.toBe("u1");
    expect(findUnique.mock.calls[0]?.[0]?.where).toEqual({ phone: "+79991234567" });
    expect(findFirst.mock.calls[0]?.[0]?.where).toEqual({ providerId: "p1", clientUserId: "u1" });
  });

  it("незнакомый оператору клиент запись сразу не получает", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", phoneVerifiedAt: new Date(), isDeleted: false });
    findFirst.mockResolvedValueOnce(null);
    await expect(resolveVerifiedPhoneOwnerId("+79991234567", SURFACE)).resolves.toBeNull();
  });

  it("заявка без доказательства и удалённый аккаунт записи не получают", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", phoneVerifiedAt: null, isDeleted: false });
    await expect(resolveVerifiedPhoneOwnerId("+79991234567", SURFACE)).resolves.toBeNull();
    findUnique.mockResolvedValueOnce({ id: "u2", phoneVerifiedAt: new Date(), isDeleted: true });
    await expect(resolveVerifiedPhoneOwnerId("+79991234567", SURFACE)).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("без номера и с нечитаемым номером — без запроса", async () => {
    await expect(resolveVerifiedPhoneOwnerId(undefined, SURFACE)).resolves.toBeNull();
    await expect(resolveVerifiedPhoneOwnerId("12", SURFACE)).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

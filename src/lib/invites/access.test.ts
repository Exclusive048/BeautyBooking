import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FIX-STUDIO-SELF-INVITE — проверяется ПОВЕДЕНИЕ гранта, а не форма кода
 * (инв. #43): каждая ветка прогоняется через `resolveInviteAccess` целиком.
 *
 * @probe Проба выполнена правдоподобной формой дефекта, а не минимальной:
 * «убрать проверку студии из ветки STUDIO_ADMIN» (то есть вернуть доступ по
 * одному лишь совпадению незаявленного номера — ровно то, чем соблазнительно
 * «починить» инвайты до включения SMS). С такой правкой падает кейс
 * «чужая студия → null»: получено "STUDIO_ADMIN", ожидалось null.
 * Вторая проба — «считать владельцем без phoneVerifiedAt»: падает кейс
 * «непроверенный номер в чужой студии».
 */

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: {
      get findMany() {
        return findMany;
      },
    },
  },
}));

import { invitePhoneMatchesProfile, resolveInviteAccess } from "./access";

const OWN_STUDIO = "studio-own";
const FOREIGN_STUDIO = "studio-foreign";

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([{ id: OWN_STUDIO }]);
});

describe("invitePhoneMatchesProfile", () => {
  it("matches across RU phone shapes", () => {
    expect(invitePhoneMatchesProfile("8 999 123-45-67", "+79991234567")).toBe(true);
    expect(invitePhoneMatchesProfile("+7 (999) 123 45 67", "79991234567")).toBe(true);
  });

  it("does not match a different number, and never matches an absent one", () => {
    expect(invitePhoneMatchesProfile("+79991234567", "+79997654321")).toBe(false);
    expect(invitePhoneMatchesProfile(null, "+79991234567")).toBe(false);
  });
});

describe("resolveInviteAccess", () => {
  it("grants PHONE_OWNER on a verified matching number — any studio (инв. #46)", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: new Date(),
        invitePhone: "+79991234567",
        inviteStudioId: FOREIGN_STUDIO,
        administeredStudioIds: [OWN_STUDIO],
      }),
    ).resolves.toBe("PHONE_OWNER");
  });

  it("grants STUDIO_ADMIN when the unverified number is mine AND the studio is mine", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: null,
        invitePhone: "+7 999 123-45-67",
        inviteStudioId: OWN_STUDIO,
        administeredStudioIds: [OWN_STUDIO],
      }),
    ).resolves.toBe("STUDIO_ADMIN");
  });

  it("refuses an unverified number in a studio I do not administer", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: null,
        invitePhone: "+79991234567",
        inviteStudioId: FOREIGN_STUDIO,
        administeredStudioIds: [OWN_STUDIO],
      }),
    ).resolves.toBeNull();
  });

  it("refuses a foreign number even inside my own studio — the invite is not mine", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: null,
        invitePhone: "+79997654321",
        inviteStudioId: OWN_STUDIO,
        administeredStudioIds: [OWN_STUDIO],
      }),
    ).resolves.toBeNull();
  });

  it("refuses a foreign number even with a verified phone", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: new Date(),
        invitePhone: "+79997654321",
        inviteStudioId: OWN_STUDIO,
        administeredStudioIds: [OWN_STUDIO],
      }),
    ).resolves.toBeNull();
  });

  it("resolves the administered list itself when the caller did not pass one", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: null,
        invitePhone: "+79991234567",
        inviteStudioId: OWN_STUDIO,
      }),
    ).resolves.toBe("STUDIO_ADMIN");
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("does not query studios at all when the phone does not match", async () => {
    await expect(
      resolveInviteAccess({
        userId: "u1",
        userPhone: "+79991234567",
        userPhoneVerifiedAt: null,
        invitePhone: "+79997654321",
        inviteStudioId: OWN_STUDIO,
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});

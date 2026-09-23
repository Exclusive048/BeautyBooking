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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
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
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: null,
        inviteStudioId: OWN_STUDIO,
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});

/**
 * STUDIO-INVITE-EMAIL-01 — приглашение по ПОЧТЕ: владение даёт только
 * подтверждённый адрес (инв. #41), неподтверждённый — лишь грант администратора
 * своей студии, как у телефона.
 *
 * @probe 2026-09-23 — в `resolveInviteAccess` условие владельца почты
 * ослаблено до одного совпадения адреса (без `userEmailVerifiedAt`): красный
 * кейс «неподтверждённый адрес в чужой студии → null» (получено "EMAIL_OWNER").
 * Возвращено — зелёный.
 */
describe("resolveInviteAccess · email", () => {
  const base = {
    userId: "u1",
    userPhone: null,
    userPhoneVerifiedAt: null,
    invitePhone: null,
    administeredStudioIds: [OWN_STUDIO],
  };

  it("grants EMAIL_OWNER on a verified matching address, case-insensitive, any studio", async () => {
    await expect(
      resolveInviteAccess({
        ...base,
        userEmail: "Master@Example.com",
        userEmailVerifiedAt: new Date(),
        inviteEmail: "master@example.com",
        inviteStudioId: FOREIGN_STUDIO,
      }),
    ).resolves.toBe("EMAIL_OWNER");
  });

  it("an UNVERIFIED matching address in a foreign studio gets nothing", async () => {
    await expect(
      resolveInviteAccess({
        ...base,
        userEmail: "master@example.com",
        userEmailVerifiedAt: null,
        inviteEmail: "master@example.com",
        inviteStudioId: FOREIGN_STUDIO,
      }),
    ).resolves.toBeNull();
  });

  it("an UNVERIFIED matching address of the studio's own admin gets STUDIO_ADMIN", async () => {
    await expect(
      resolveInviteAccess({
        ...base,
        userEmail: "owner@example.com",
        userEmailVerifiedAt: null,
        inviteEmail: "owner@example.com",
        inviteStudioId: OWN_STUDIO,
      }),
    ).resolves.toBe("STUDIO_ADMIN");
  });

  it("a verified DIFFERENT address gets nothing", async () => {
    await expect(
      resolveInviteAccess({
        ...base,
        userEmail: "someone@example.com",
        userEmailVerifiedAt: new Date(),
        inviteEmail: "master@example.com",
        inviteStudioId: OWN_STUDIO,
      }),
    ).resolves.toBeNull();
  });

  it("an email invite is not opened by a matching verified PHONE", async () => {
    await expect(
      resolveInviteAccess({
        ...base,
        userPhone: "+79991234567",
        userPhoneVerifiedAt: new Date(),
        userEmail: null,
        userEmailVerifiedAt: null,
        inviteEmail: "master@example.com",
        inviteStudioId: FOREIGN_STUDIO,
      }),
    ).resolves.toBeNull();
  });
});

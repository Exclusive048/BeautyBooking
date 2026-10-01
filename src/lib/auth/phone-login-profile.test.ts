import { describe, it, expect, beforeEach, vi } from "vitest";
import { AccountType, Prisma, type UserProfile } from "@prisma/client";

const userCreate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const userUpdateMany = vi.hoisted(() => vi.fn());
const ensureClientRole = vi.hoisted(() => vi.fn());
const guestClassMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      create: userCreate,
      findUnique: userFindUnique,
      updateMany: userUpdateMany,
    },
  },
}));

vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: ensureClientRole,
}));

vi.mock("@/lib/legal/consent", () => ({
  isGuestClassProfile: guestClassMock,
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { resolvePhoneLoginProfile } from "@/lib/auth/phone-login-profile";
import { classifyPhoneLoginTarget } from "@/lib/auth/phone-claim";

const PHONE = "+79991234567";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    phone: PHONE,
    phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    roles: [AccountType.CLIENT],
    ...overrides,
  } as UserProfile;
}

function makeUniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("resolvePhoneLoginProfile (OTP-PHONE-LOGIN-RACE + PHONE-CLAIM-01 triage)", () => {
  beforeEach(() => {
    userCreate.mockReset();
    userFindUnique.mockReset();
    userUpdateMany.mockReset();
    ensureClientRole.mockReset();
    guestClassMock.mockReset();
    userUpdateMany.mockResolvedValue({ count: 1 });
    // Default: CLIENT already present → same array reference back (no write).
    ensureClientRole.mockImplementation((_id: string, roles: AccountType[]) => roles);
  });

  it("OWNER (подтверждённый владелец): ensures CLIENT role, never creates", async () => {
    const existing = makeProfile({ id: "u-return" });

    const result = await resolvePhoneLoginProfile(PHONE, { kind: "OWNER", profile: existing });

    expect(result).toBe(existing);
    expect(ensureClientRole).toHaveBeenCalledWith("u-return", existing.roles);
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("OWNER missing CLIENT: reflects the added role", async () => {
    const existing = makeProfile({ id: "u-nomrole", roles: [AccountType.MASTER] });
    const nextRoles = [AccountType.MASTER, AccountType.CLIENT];
    ensureClientRole.mockResolvedValueOnce(nextRoles);

    const result = await resolvePhoneLoginProfile(PHONE, { kind: "OWNER", profile: existing });

    expect(result.roles).toBe(nextRoles);
    expect(result.id).toBe("u-nomrole");
  });

  it("GUEST_CONVERSION: ставит отметку владения (идемпотентный guard в where) и логинит", async () => {
    const guest = makeProfile({ id: "u-guest", phoneVerifiedAt: null });

    const result = await resolvePhoneLoginProfile(PHONE, {
      kind: "GUEST_CONVERSION",
      profile: guest,
    });

    expect(result.id).toBe("u-guest");
    expect(result.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u-guest", phoneVerifiedAt: null },
      data: { phoneVerifiedAt: expect.any(Date) },
    });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("NONE (первый вход): создаёт [CLIENT]-профиль сразу с отметкой владения", async () => {
    const created = makeProfile({ id: "u-new" });
    userCreate.mockResolvedValueOnce(created);

    const result = await resolvePhoneLoginProfile("+79990000001", { kind: "NONE" });

    expect(result).toBe(created);
    expect(userCreate).toHaveBeenCalledOnce();
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        phone: "+79990000001",
        phoneVerifiedAt: expect.any(Date),
        roles: [AccountType.CLIENT],
      },
      // SESSION-SELECT-LOGIN-PATHS: только поля входа, не вся строка профиля.
      select: { id: true, phone: true, phoneVerifiedAt: true, roles: true },
    });
    // Behaviour preserved: fresh create does NOT trigger ensureClientRoleForUser.
    expect(ensureClientRole).not.toHaveBeenCalled();
  });

  it("FOREIGN_CLAIM: НЕ логинит в заявителя — освобождает заявку и создаёт свежий профиль", async () => {
    const claimer = makeProfile({ id: "u-claimer", phoneVerifiedAt: null });
    const created = makeProfile({ id: "u-fresh" });
    userCreate.mockResolvedValueOnce(created);

    const result = await resolvePhoneLoginProfile(PHONE, {
      kind: "FOREIGN_CLAIM",
      profile: claimer,
    });

    // Ключевое свойство: сессию получает НЕ строка заявителя.
    expect(result.id).toBe("u-fresh");
    // Release зовётся с границей безопасности phoneVerifiedAt: null.
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { phone: PHONE, phoneVerifiedAt: null },
      data: { phone: null },
    });
    expect(ensureClientRole).not.toHaveBeenCalledWith("u-claimer", expect.anything());
  });

  it("race loser: P2002 → re-read winner → ПЕРЕтриаж (verified winner = OWNER path)", async () => {
    const winner = makeProfile({ id: "u-winner" });
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindUnique.mockResolvedValueOnce(winner);

    const result = await resolvePhoneLoginProfile("+79990000002", { kind: "NONE" });

    expect(result).toBe(winner);
    expect(userCreate).toHaveBeenCalledOnce();
    expect(userFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: "+79990000002" } }));
    expect(ensureClientRole).toHaveBeenCalledWith("u-winner", winner.roles);
  });

  it("race loser, гонку выиграла ЧУЖАЯ заявка: перетриаж уводит в release+create, а не в логин к заявителю", async () => {
    const claimer = makeProfile({ id: "u-claimer-race", phoneVerifiedAt: null });
    const created = makeProfile({ id: "u-fresh-after-race" });
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindUnique.mockResolvedValueOnce(claimer);
    guestClassMock.mockResolvedValueOnce(false); // established → FOREIGN_CLAIM
    userCreate.mockResolvedValueOnce(created);

    const result = await resolvePhoneLoginProfile("+79990000006", { kind: "NONE" });

    expect(result.id).toBe("u-fresh-after-race");
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { phone: "+79990000006", phoneVerifiedAt: null },
      data: { phone: null },
    });
  });

  it("P2002 but re-read returns null: rethrows the original error", async () => {
    const err = makeUniqueViolation();
    userCreate.mockRejectedValueOnce(err);
    userFindUnique.mockResolvedValueOnce(null);

    await expect(resolvePhoneLoginProfile("+79990000004", { kind: "NONE" })).rejects.toBe(err);
  });

  it("non-P2002 create error: rethrows immediately without re-reading", async () => {
    userCreate.mockRejectedValueOnce(new Error("connection lost"));

    await expect(resolvePhoneLoginProfile("+79990000005", { kind: "NONE" })).rejects.toThrow(
      "connection lost"
    );
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("classifyPhoneLoginTarget (PHONE-CLAIM-01)", () => {
  beforeEach(() => {
    guestClassMock.mockReset();
  });

  it("null → NONE (регистрация)", async () => {
    expect(await classifyPhoneLoginTarget(null)).toEqual({ kind: "NONE" });
  });

  it("подтверждённая строка → OWNER, guest-class даже не спрашивается", async () => {
    const owner = makeProfile({ id: "u-owner" });
    expect(await classifyPhoneLoginTarget(owner)).toEqual({ kind: "OWNER", profile: owner });
    expect(guestClassMock).not.toHaveBeenCalled();
  });

  it("неподтверждённая guest-class строка → GUEST_CONVERSION", async () => {
    const guest = makeProfile({ id: "u-g", phoneVerifiedAt: null });
    guestClassMock.mockResolvedValueOnce(true);
    expect(await classifyPhoneLoginTarget(guest)).toEqual({
      kind: "GUEST_CONVERSION",
      profile: guest,
    });
  });

  it("неподтверждённая established строка → FOREIGN_CLAIM (регистрация)", async () => {
    const claimer = makeProfile({ id: "u-c", phoneVerifiedAt: null });
    guestClassMock.mockResolvedValueOnce(false);
    expect(await classifyPhoneLoginTarget(claimer)).toEqual({
      kind: "FOREIGN_CLAIM",
      profile: claimer,
    });
  });
});

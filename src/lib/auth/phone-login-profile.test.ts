import { describe, it, expect, beforeEach, vi } from "vitest";
import { AccountType, Prisma, type UserProfile } from "@prisma/client";

const userCreate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const ensureClientRole = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      create: userCreate,
      findUnique: userFindUnique,
    },
  },
}));

vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: ensureClientRole,
}));

import { resolvePhoneLoginProfile } from "@/lib/auth/phone-login-profile";

const PHONE = "+79991234567";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    phone: PHONE,
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

describe("resolvePhoneLoginProfile (OTP-PHONE-LOGIN-RACE, 7th P2002 site)", () => {
  beforeEach(() => {
    userCreate.mockReset();
    userFindUnique.mockReset();
    ensureClientRole.mockReset();
    // Default: CLIENT already present → same array reference back (no write).
    ensureClientRole.mockImplementation((_id: string, roles: AccountType[]) => roles);
  });

  it("returning user: ensures CLIENT role, never creates", async () => {
    const existing = makeProfile({ id: "u-return", roles: [AccountType.CLIENT] });

    const result = await resolvePhoneLoginProfile(PHONE, existing);

    expect(result).toBe(existing);
    expect(ensureClientRole).toHaveBeenCalledWith("u-return", existing.roles);
    expect(userCreate).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returning user missing CLIENT: reflects the added role", async () => {
    const existing = makeProfile({ id: "u-nomrole", roles: [AccountType.MASTER] });
    const nextRoles = [AccountType.MASTER, AccountType.CLIENT];
    ensureClientRole.mockResolvedValueOnce(nextRoles);

    const result = await resolvePhoneLoginProfile(PHONE, existing);

    expect(result.roles).toBe(nextRoles);
    expect(result.id).toBe("u-nomrole");
  });

  it("first-time user: creates a fresh [CLIENT] profile (normal path — no role round-trip)", async () => {
    const created = makeProfile({ id: "u-new" });
    userCreate.mockResolvedValueOnce(created);

    const result = await resolvePhoneLoginProfile("+79990000001", null);

    expect(result).toBe(created);
    expect(userCreate).toHaveBeenCalledOnce();
    // Behaviour preserved: fresh create does NOT trigger ensureClientRoleForUser.
    expect(ensureClientRole).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("race loser: P2002 on create → re-reads the winner's row and continues (no throw)", async () => {
    const winner = makeProfile({ id: "u-winner" });
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindUnique.mockResolvedValueOnce(winner);

    const result = await resolvePhoneLoginProfile("+79990000002", null);

    expect(result).toBe(winner);
    // Idempotent: exactly one create attempt, no double-create.
    expect(userCreate).toHaveBeenCalledOnce();
    expect(userFindUnique).toHaveBeenCalledWith({ where: { phone: "+79990000002" } });
    // Recovered row is treated like a returning user → role ensured.
    expect(ensureClientRole).toHaveBeenCalledWith("u-winner", winner.roles);
  });

  it("race loser lands on the same row a single request would", async () => {
    // A single (non-racing) request would have created + returned this row.
    const singleRequestRow = makeProfile({ id: "u-canonical", phone: "+79990000003" });
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindUnique.mockResolvedValueOnce(singleRequestRow);

    const result = await resolvePhoneLoginProfile("+79990000003", null);

    expect(result.id).toBe("u-canonical");
    expect(result.phone).toBe("+79990000003");
  });

  it("P2002 but re-read returns null: rethrows the original error", async () => {
    const err = makeUniqueViolation();
    userCreate.mockRejectedValueOnce(err);
    userFindUnique.mockResolvedValueOnce(null);

    await expect(resolvePhoneLoginProfile("+79990000004", null)).rejects.toBe(err);
  });

  it("non-P2002 create error: rethrows immediately without re-reading", async () => {
    userCreate.mockRejectedValueOnce(new Error("connection lost"));

    await expect(resolvePhoneLoginProfile("+79990000005", null)).rejects.toThrow("connection lost");
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

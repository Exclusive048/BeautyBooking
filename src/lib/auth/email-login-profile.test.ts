import { describe, it, expect, beforeEach, vi } from "vitest";
import { AccountType, Prisma, type UserProfile } from "@prisma/client";

const userCreate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const userFindFirst = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn());
// EMAIL-ADDRESS-OCCUPATION: освобождение чужих НЕподтверждённых заявок на адрес.
const userUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
const ensureClientRole = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => {
  const client: Record<string, unknown> = {
    userProfile: {
      create: userCreate,
      findUnique: userFindUnique,
      // FIX-SEC-EMAIL-IDENTITY-01: резолвер перешёл с `findUnique({ email })`
      // на verified-фильтр `findFirst` и идемпотентно ставит отметку владения.
      findFirst: userFindFirst,
      update: userUpdate,
      updateMany: userUpdateMany,
    },
  };
  // EMAIL-ADDRESS-OCCUPATION: создание профиля и снятие чужих заявок — одна
  // транзакция, поэтому мок обязан её выражать. Клиент транзакции здесь тот же
  // объект: тесты этого файла проверяют вызовы, а не изоляцию.
  client.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(client));
  return { prisma: client };
});

vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: ensureClientRole,
}));

import { resolveEmailLoginProfile } from "@/lib/auth/email-login-profile";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "a@b.ru",
    // FIX-SEC-EMAIL-IDENTITY-01: «вернувшийся пользователь» по определению
    // подтверждён — неподтверждённая строка до резолвера больше не доходит.
    emailVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
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

describe("resolveEmailLoginProfile (OTP-EMAIL-LOGIN-RACE, 6th P2002 site)", () => {
  beforeEach(() => {
    userCreate.mockReset();
    userFindUnique.mockReset();
    userFindFirst.mockReset();
    userUpdate.mockReset();
    ensureClientRole.mockReset();
    // Default: CLIENT already present → same array reference back (no write).
    ensureClientRole.mockImplementation((_id: string, roles: AccountType[]) => roles);
  });

  it("returning user: ensures CLIENT role, never creates", async () => {
    const existing = makeProfile({ id: "u-return", roles: [AccountType.CLIENT] });

    const result = await resolveEmailLoginProfile("a@b.ru", existing);

    expect(result).toBe(existing);
    expect(ensureClientRole).toHaveBeenCalledWith("u-return", existing.roles);
    expect(userCreate).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returning user missing CLIENT: reflects the added role", async () => {
    const existing = makeProfile({ id: "u-nomrole", roles: [AccountType.MASTER] });
    const nextRoles = [AccountType.MASTER, AccountType.CLIENT];
    ensureClientRole.mockResolvedValueOnce(nextRoles);

    const result = await resolveEmailLoginProfile("a@b.ru", existing);

    expect(result.roles).toBe(nextRoles);
    expect(result.id).toBe("u-nomrole");
  });

  it("first-time user: creates a fresh [CLIENT] profile (normal path — no role round-trip)", async () => {
    const created = makeProfile({ id: "u-new" });
    userCreate.mockResolvedValueOnce(created);

    const result = await resolveEmailLoginProfile("new@b.ru", null);

    expect(result).toBe(created);
    expect(userCreate).toHaveBeenCalledOnce();
    // Behaviour preserved: fresh create does NOT trigger ensureClientRoleForUser.
    expect(ensureClientRole).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("race loser: P2002 on create → re-reads the winner's ПОДТВЕРЖДЁННУЮ row and continues (no throw)", async () => {
    const winner = makeProfile({ id: "u-winner" });
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindFirst.mockResolvedValueOnce(winner);

    const result = await resolveEmailLoginProfile("race@b.ru", null);

    expect(result).toBe(winner);
    expect(userCreate).toHaveBeenCalledOnce();
    // FIX-SEC-EMAIL-IDENTITY-01: перечитывание — через verified-фильтр.
    // Был `findUnique({ where: { email } })`: он вернул бы и строку, занятую
    // без доказательства владения, и гонка осталась бы дырой.
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { email: "race@b.ru", emailVerifiedAt: { not: null } },
    });
    expect(userFindUnique).not.toHaveBeenCalled();
    // Recovered row is treated like a returning user → role ensured.
    expect(ensureClientRole).toHaveBeenCalledWith("u-winner", winner.roles);
  });

  it("race loser lands on the same row a single request would", async () => {
    // A single (non-racing) request would have created + returned this row.
    const singleRequestRow = makeProfile({ id: "u-canonical", email: "same@b.ru" });
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindFirst.mockResolvedValueOnce(singleRequestRow);

    const result = await resolveEmailLoginProfile("same@b.ru", null);

    expect(result.id).toBe("u-canonical");
    expect(result.email).toBe("same@b.ru");
  });

  it("P2002, но подтверждённой строки нет → отказ EMAIL_NOT_VERIFIED (а не вход в чужой профиль)", async () => {
    // 🔴 Смена контракта FIX-SEC-EMAIL-IDENTITY-01. Раньше тест ждал проброса
    // исходного P2002 — то есть «строка есть, но мы её не увидели» трактовалось
    // как сбой. Теперь это ЗНАЧИМОЕ состояние: адрес занят строкой без
    // доказательства владения. Войти в неё нельзя (это и есть pre-hijack),
    // создать вторую нельзя (`email @unique`) — поэтому явный 409.
    userCreate.mockRejectedValueOnce(makeUniqueViolation());
    userFindFirst.mockResolvedValueOnce(null);

    await expect(resolveEmailLoginProfile("ghost@b.ru", null)).rejects.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
      status: 409,
    });
  });

  it("non-P2002 create error: rethrows immediately without re-reading", async () => {
    userCreate.mockRejectedValueOnce(new Error("connection lost"));

    await expect(resolveEmailLoginProfile("boom@b.ru", null)).rejects.toThrow("connection lost");
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

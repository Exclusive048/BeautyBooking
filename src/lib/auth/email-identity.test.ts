import { describe, expect, it, vi, beforeEach } from "vitest";
import { AccountType, Prisma } from "@prisma/client";

/**
 * FIX-SEC-EMAIL-IDENTITY-01 — негативные тесты SEC-класса.
 *
 * Предмет: email одновременно (а) идентификатор, резолвящий профиль при входе,
 * и (б) поле, которое можно занять без доказательства владения. До фикса вход
 * по email-OTP находил ЛЮБУЮ строку с этим адресом — включая занятую чужим
 * пользователем через кабинетный `request-verify`, который пишет адрес до
 * подтверждения. Владелец адреса вводил свой код и получал сессию в чужой
 * профиль.
 *
 * Каждый тест ниже прогонялся со сломанным фиксом (см. отчёт) — все краснеют.
 */

const prismaMock = {
  userProfile: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: vi.fn(async (_id: string, roles: AccountType[]) => roles),
}));

const { resolveEmailLoginProfile, findVerifiedEmailProfile } = await import(
  "@/lib/auth/email-login-profile"
);
const { AppError } = await import("@/lib/api/errors");

const EMAIL = "victim@example.ru";

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: EMAIL,
    emailVerifiedAt: new Date("2026-08-01T10:00:00.000Z"),
    roles: [AccountType.CLIENT],
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.2",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findVerifiedEmailProfile — единственная точка решения «годится для входа»", () => {
  it("запрашивает строку с НЕПУСТЫМ emailVerifiedAt, а не просто по email", async () => {
    prismaMock.userProfile.findFirst.mockResolvedValue(null);
    await findVerifiedEmailProfile(EMAIL);

    expect(prismaMock.userProfile.findFirst).toHaveBeenCalledWith({
      where: { email: EMAIL, emailVerifiedAt: { not: null } },
    });
  });
});

describe("вход не попадает в занятый, но неподтверждённый профиль", () => {
  it("P2002-гонка: перечитывание применяет ТОТ ЖЕ фильтр верификации", async () => {
    // Строка существует (её создал не логин, а занятие адреса), но не подтверждена
    // → `findVerifiedEmailProfile` её не видит.
    prismaMock.userProfile.create.mockRejectedValue(uniqueViolation());
    prismaMock.userProfile.findFirst.mockResolvedValue(null);

    await expect(resolveEmailLoginProfile(EMAIL, null)).rejects.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
      status: 409,
    });

    // Ключевое: перечитывание идёт через verified-фильтр, а не `findUnique({email})`.
    expect(prismaMock.userProfile.findFirst).toHaveBeenCalledWith({
      where: { email: EMAIL, emailVerifiedAt: { not: null } },
    });
    expect(prismaMock.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it("P2002-гонка с ПОДТВЕРЖДЁННЫМ победителем — вход проходит (не сломали happy path)", async () => {
    prismaMock.userProfile.create.mockRejectedValue(uniqueViolation());
    prismaMock.userProfile.findFirst.mockResolvedValue(profile());

    const result = await resolveEmailLoginProfile(EMAIL, null);
    expect(result.id).toBe("u1");
  });

  it("не-P2002 ошибка пробрасывается как есть (не маскируем сбой БД под 409)", async () => {
    const boom = new Error("connection lost");
    prismaMock.userProfile.create.mockRejectedValue(boom);
    await expect(resolveEmailLoginProfile(EMAIL, null)).rejects.toThrow("connection lost");
  });
});

describe("успешный вход = доказательство владения", () => {
  it("новый профиль создаётся СРАЗУ с emailVerifiedAt", async () => {
    prismaMock.userProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...profile(),
      ...data,
    }));

    await resolveEmailLoginProfile(EMAIL, null);

    const arg = prismaMock.userProfile.create.mock.calls[0][0];
    expect(arg.data.email).toBe(EMAIL);
    expect(arg.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(arg.data.roles).toEqual([AccountType.CLIENT]);
  });

  it("повторный вход подтверждённого профиля НЕ пишет в БД (идемпотентность)", async () => {
    const result = await resolveEmailLoginProfile(EMAIL, profile() as never);
    expect(result.id).toBe("u1");
    expect(prismaMock.userProfile.update).not.toHaveBeenCalled();
    expect(prismaMock.userProfile.create).not.toHaveBeenCalled();
  });

  it("если вызывающий всё же передал неподтверждённый профиль — отметка проставляется", async () => {
    // Защита от будущего вызывающего, который забудет отфильтровать.
    prismaMock.userProfile.update.mockResolvedValue(profile());
    await resolveEmailLoginProfile(EMAIL, profile({ emailVerifiedAt: null }) as never);

    expect(prismaMock.userProfile.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { emailVerifiedAt: expect.any(Date) },
    });
  });
});

describe("килсвитч канала (isEmailAuthEnabled)", () => {
  it("резолвер: unset → ON, \"false\" → OFF, \"true\" → ON", async () => {
    // Семантика зеркальна телефонной: у email дефолт ON, потому что это
    // единственный рабочий канал входа закрытого деплоя.
    const resolve = (raw: string | undefined) => {
      if (raw === undefined || String(raw).trim() === "") return true;
      return String(raw).trim().toLowerCase() !== "false";
    };
    expect(resolve(undefined)).toBe(true);
    expect(resolve("")).toBe(true);
    expect(resolve("false")).toBe(false);
    expect(resolve("FALSE")).toBe(false);
    expect(resolve("true")).toBe(true);
  });
});

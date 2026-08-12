import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType } from "@prisma/client";

/**
 * EMAIL-ADDRESS-OCCUPATION — остаток SEC-01.
 *
 * Захват аккаунта закрыт раньше (FIX-SEC-EMAIL-IDENTITY-01, инв. #41): вход
 * резолвит только `emailVerifiedAt IS NOT NULL`. Но СТРОКА с чужим адресом
 * оставалась, а `email` был `@unique` целиком — значит занятый адрес владелец
 * не мог ни зарегистрировать, ни подтвердить: P2002 → 409 «Обратитесь в
 * поддержку». На проде это единственный включённый канал входа
 * (`PHONE_AUTH_ENABLED` off), то есть отказ в обслуживании владельцу адреса.
 *
 * Модель после фикса: ЗАЯВИТЬ адрес может кто угодно и сколько угодно строк,
 * ВЛАДЕТЬ — ровно один, и владение даёт только доказательство.
 */

const prismaMock = {
  userProfile: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: vi.fn(async (_id: string, roles: AccountType[]) => roles),
}));

const { resolveEmailLoginProfile } = await import("@/lib/auth/email-login-profile");
const { releaseUnverifiedEmailClaims } = await import("@/lib/auth/email-claim");
const { canDeliverServiceEmail } = await import("@/lib/notifications/delivery");

const VICTIM_EMAIL = "victim@example.ru";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
  prismaMock.userProfile.updateMany.mockResolvedValue({ count: 0 });
});

describe("1 · squat не мешает владельцу зарегистрироваться и войти", () => {
  it("адрес занят чужой НЕподтверждённой строкой — владелец всё равно получает профиль", async () => {
    // `findVerifiedEmailProfile` не видит неподтверждённую строку захватчика,
    // поэтому роут передаёт `existing = null`.
    prismaMock.userProfile.create.mockResolvedValue({
      id: "victim",
      email: VICTIM_EMAIL,
      emailVerifiedAt: new Date(),
      roles: [AccountType.CLIENT],
    });

    const profile = await resolveEmailLoginProfile(VICTIM_EMAIL, null);

    expect(profile.id).toBe("victim");
    expect(profile.emailVerifiedAt).not.toBeNull();
    // 🔴 Ключевое: создание НЕ упало на P2002. До фикса полный `@unique`
    // делал этот путь недостижимым, пока захватчик держал адрес.
    expect(prismaMock.userProfile.create).toHaveBeenCalledTimes(1);
  });
});

describe("2 · подтверждение владельца освобождает чужие заявки", () => {
  it("создание владельца идёт В ОДНОЙ транзакции с освобождением", async () => {
    prismaMock.userProfile.create.mockResolvedValue({
      id: "victim",
      email: VICTIM_EMAIL,
      emailVerifiedAt: new Date(),
      roles: [AccountType.CLIENT],
    });

    await resolveEmailLoginProfile(VICTIM_EMAIL, null);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.userProfile.updateMany).toHaveBeenCalledWith({
      where: { email: VICTIM_EMAIL, emailVerifiedAt: null },
      data: { email: null },
    });
  });

  it("освобождение НЕ трогает подтверждённого владельца и НЕ трогает сам профиль-заявитель", async () => {
    await releaseUnverifiedEmailClaims(prismaMock as never, VICTIM_EMAIL, "keeper");

    const call = prismaMock.userProfile.updateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };

    // Граница безопасности: без `emailVerifiedAt: null` примитив стирал бы
    // адрес у того, кто им доказанно владеет.
    expect(call.where.emailVerifiedAt).toBeNull();
    expect(call.where.id).toEqual({ not: "keeper" });
    // Освобождается ТОЛЬКО адрес: ни роли, ни сессии, ни отметка верификации.
    expect(Object.keys(call.data)).toEqual(["email"]);
    expect(call.data.email).toBeNull();
  });
});

describe("3 · двух ПОДТВЕРЖДЁННЫХ держателей одного адреса быть не может", () => {
  const ROOT = path.resolve(__dirname, "..", "..", "..");
  const MIGRATION = path.join(
    ROOT,
    "prisma/schema/migrations/20260812104330_email_partial_unique_verified_only/migration.sql",
  );

  /**
   * Гарантия здесь — уровня БД (частичный уникальный индекс), а не приложения:
   * прикладной защиты от гонки двух одновременных подтверждений НЕТ и быть не
   * должно (её роль и играет индекс). Поэтому тест проверяет две вещи, без
   * которых индекс молча исчезнет: он объявлен в миграции и внесён в реестр
   * сырых объектов (иначе `prisma migrate dev` допишет его DROP в следующую
   * миграцию — ровно та ловушка, что сработала с HNSW семь раз).
   */
  it("миграция создаёт ЧАСТИЧНЫЙ уникальный индекс с нужным предикатом", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX\s+"UserProfile_email_verified_unique_idx"/);
    expect(sql).toMatch(/ON\s+"UserProfile"\s*\(\s*"email"\s*\)/);
    // Предикат обязан дословно совпадать с фильтром `findVerifiedEmailProfile`.
    expect(sql).toMatch(/WHERE\s+"emailVerifiedAt"\s+IS\s+NOT\s+NULL/);
    // Полный @@unique обязан быть снят — иначе squat по-прежнему занимает адрес.
    expect(sql).toMatch(/DROP INDEX\s+"UserProfile_email_key"/);
  });

  it("индекс зарегистрирован в реестре сырых объектов", async () => {
    const { RAW_SQL_OBJECTS } = await import("../../../scripts/raw-sql-objects.mjs");
    const entry = (RAW_SQL_OBJECTS as Array<{ name: string; table: string }>).find(
      (o) => o.name === "UserProfile_email_verified_unique_idx",
    );
    expect(entry, "индекс не в реестре — его DROP уедет в следующую миграцию молча").toBeTruthy();
    expect(entry!.table).toBe("UserProfile");
  });

  it("схема больше не объявляет email полностью уникальным", () => {
    const schema = readFileSync(path.join(ROOT, "prisma/schema/auth.prisma"), "utf8");
    expect(schema).not.toMatch(/^\s*email String\? @unique/m);
  });
});

describe("4 · сервисная почта только на подтверждённый адрес", () => {
  it("неподтверждённый адрес не получает ничего", () => {
    expect(
      canDeliverServiceEmail({
        email: VICTIM_EMAIL,
        emailNotificationsEnabled: true,
        emailVerifiedAt: null,
      }),
    ).toBe(false);
  });

  it("подтверждённый — получает", () => {
    expect(
      canDeliverServiceEmail({
        email: VICTIM_EMAIL,
        emailNotificationsEnabled: true,
        emailVerifiedAt: new Date(),
      }),
    ).toBe(true);
  });

  it("прежние причины отказа сохранены (нет адреса / выключены уведомления)", () => {
    expect(
      canDeliverServiceEmail({ email: null, emailNotificationsEnabled: true, emailVerifiedAt: new Date() }),
    ).toBe(false);
    expect(
      canDeliverServiceEmail({
        email: VICTIM_EMAIL,
        emailNotificationsEnabled: false,
        emailVerifiedAt: new Date(),
      }),
    ).toBe(false);
    expect(canDeliverServiceEmail(null)).toBe(false);
  });
});

describe("5 · регрессия: обычный вход не тронут", () => {
  it("возврат подтверждённого пользователя не пишет в БД", async () => {
    const existing = {
      id: "owner",
      email: VICTIM_EMAIL,
      emailVerifiedAt: new Date("2026-08-01T10:00:00.000Z"),
      roles: [AccountType.CLIENT],
    };

    const profile = await resolveEmailLoginProfile(VICTIM_EMAIL, existing as never);

    expect(profile.id).toBe("owner");
    expect(prismaMock.userProfile.update).not.toHaveBeenCalled();
    expect(prismaMock.userProfile.create).not.toHaveBeenCalled();
    // Освобождение для уже подтверждённого не нужно: индекс гарантирует, что
    // второй ПОДТВЕРЖДЁННОЙ строки нет, а чужие заявки снялись при его первом
    // подтверждении.
    expect(prismaMock.userProfile.updateMany).not.toHaveBeenCalled();
  });

  it("профиль без email (OAuth-вход) отметку получает без освобождения", async () => {
    prismaMock.userProfile.update.mockResolvedValue({
      id: "oauth",
      email: null,
      emailVerifiedAt: new Date(),
      roles: [AccountType.CLIENT],
    });

    await resolveEmailLoginProfile(VICTIM_EMAIL, {
      id: "oauth",
      email: null,
      emailVerifiedAt: null,
      roles: [AccountType.CLIENT],
    } as never);

    expect(prismaMock.userProfile.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.userProfile.update).toHaveBeenCalledTimes(1);
  });
});

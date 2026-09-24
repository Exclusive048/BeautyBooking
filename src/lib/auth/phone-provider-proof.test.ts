import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PHONE-OAUTH-PROOF-01 — номер из VK ID / Яндекс ID как доказательство владения.
 * Пиннятся правила: нормализация, «другой номер не подменяем», «владелец один»,
 * снятие чужих НЕподтверждённых заявок в той же транзакции, гонка P2002.
 */

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const userProfile = {
    findUnique: db.findUnique,
    findFirst: db.findFirst,
    update: db.update,
    updateMany: db.updateMany,
  };
  return {
    prisma: {
      userProfile,
      $transaction: db.transaction,
    },
  };
});
vi.mock("@/lib/bookings/link-guest-bookings", () => ({
  linkGuestBookingsToUserByPhone: vi.fn(async () => ({ linked: 0 })),
}));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { applyProviderVerifiedPhone } from "./phone-provider-proof";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ userProfile: { update: db.update, updateMany: db.updateMany } }),
  );
  db.updateMany.mockResolvedValue({ count: 0 });
  db.update.mockResolvedValue({});
  db.findFirst.mockResolvedValue(null);
});

describe("applyProviderVerifiedPhone", () => {
  it("нет номера или он не российский → no_phone, БД не трогаем", async () => {
    expect(await applyProviderVerifiedPhone({ userId: USER, providerPhone: null, provider: "vk" })).toBe("no_phone");
    expect(await applyProviderVerifiedPhone({ userId: USER, providerPhone: "+1 555 0100", provider: "vk" })).toBe(
      "no_phone",
    );
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("у пользователя другой номер → mismatch, заявку не подменяем", async () => {
    db.findUnique.mockResolvedValue({ phone: "+79990000001", phoneVerifiedAt: null });
    expect(
      await applyProviderVerifiedPhone({ userId: USER, providerPhone: "79991234567", provider: "vk" }),
    ).toBe("mismatch");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("тот же номер уже подтверждён → already", async () => {
    db.findUnique.mockResolvedValue({ phone: "+79991234567", phoneVerifiedAt: new Date() });
    expect(
      await applyProviderVerifiedPhone({ userId: USER, providerPhone: "+7 999 123-45-67", provider: "yandex" }),
    ).toBe("already");
  });

  it("номер подтверждён у другого аккаунта → taken", async () => {
    db.findUnique.mockResolvedValue({ phone: null, phoneVerifiedAt: null });
    db.findFirst.mockResolvedValue({ id: "owner" });
    expect(
      await applyProviderVerifiedPhone({ userId: USER, providerPhone: "79991234567", provider: "vk" }),
    ).toBe("taken");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("свободный номер (VK-формат без «+») → нормализуется, чужие заявки снимаются, ставится владение", async () => {
    db.findUnique.mockResolvedValue({ phone: null, phoneVerifiedAt: null });
    expect(
      await applyProviderVerifiedPhone({ userId: USER, providerPhone: "79991234567", provider: "vk" }),
    ).toBe("verified");

    // Снимаются ТОЛЬКО неподтверждённые заявки и не у самого пользователя.
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { phone: "+79991234567", phoneVerifiedAt: null, id: { not: USER } },
      data: { phone: null },
    });
    const update = db.update.mock.calls[0]![0] as { where: { id: string }; data: { phone: string; phoneVerifiedAt: Date } };
    expect(update.where).toEqual({ id: USER });
    expect(update.data.phone).toBe("+79991234567");
    expect(update.data.phoneVerifiedAt).toBeInstanceOf(Date);
  });

  it("своя неподтверждённая заявка на тот же номер → verified", async () => {
    db.findUnique.mockResolvedValue({ phone: "+79991234567", phoneVerifiedAt: null });
    expect(
      await applyProviderVerifiedPhone({ userId: USER, providerPhone: "+79991234567", provider: "yandex" }),
    ).toBe("verified");
  });

  it("гонка за номер (P2002 на полном @unique) → taken, а не 500", async () => {
    db.findUnique.mockResolvedValue({ phone: null, phoneVerifiedAt: null });
    db.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6" }),
    );
    expect(
      await applyProviderVerifiedPhone({ userId: USER, providerPhone: "79991234567", provider: "vk" }),
    ).toBe("taken");
  });
});

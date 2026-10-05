import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VK-YANDEX-UNLINK-01 — отвязка удаляет связку, но не последний способ входа.
 */

const methods = vi.hoisted(() => ({ phone: true, email: true, vk: true, yandex: true, telegram: false, any: true }));

const db = vi.hoisted(() => ({
  findUser: vi.fn(),
  vkDelete: vi.fn(async () => ({ count: 1 })),
  yandexDelete: vi.fn(async () => ({ count: 1 })),
}));

vi.mock("@/lib/auth/auth-methods", () => ({ resolveAuthMethods: vi.fn(async () => methods) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique: db.findUser },
    vkLink: { deleteMany: db.vkDelete },
    yandexLink: { deleteMany: db.yandexDelete },
  },
}));

import { unlinkOAuthIdentity } from "@/lib/auth/oauth-unlink";

type UserRow = {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  telegramId: string | null;
  vkLink: { id: string } | null;
  yandexLink: { id: string } | null;
};

const bare: UserRow = {
  phone: null,
  phoneVerifiedAt: null,
  email: null,
  emailVerifiedAt: null,
  telegramId: null,
  vkLink: { id: "vk1" },
  yandexLink: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(methods, { phone: true, email: true, vk: true, yandex: true, telegram: false });
});

describe("unlinkOAuthIdentity", () => {
  it("удаляет связку VK, когда есть подтверждённый телефон", async () => {
    db.findUser.mockResolvedValue({ ...bare, phone: "+79000000000", phoneVerifiedAt: new Date() });
    await expect(unlinkOAuthIdentity("u1", "vk")).resolves.toEqual({ unlinked: true });
    expect(db.vkDelete).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("VK — единственный способ входа: 409 LAST_LOGIN_METHOD, связка на месте", async () => {
    db.findUser.mockResolvedValue(bare);
    await expect(unlinkOAuthIdentity("u1", "vk")).rejects.toMatchObject({ status: 409, code: "LAST_LOGIN_METHOD" });
    expect(db.vkDelete).not.toHaveBeenCalled();
  });

  it("неподтверждённые телефон и почта способом входа не считаются", async () => {
    db.findUser.mockResolvedValue({ ...bare, phone: "+79000000000", email: "a@b.ru" });
    await expect(unlinkOAuthIdentity("u1", "vk")).rejects.toMatchObject({ code: "LAST_LOGIN_METHOD" });
  });

  it("подтверждённая почта не спасает, если вход по почте выключен", async () => {
    methods.email = false;
    db.findUser.mockResolvedValue({ ...bare, email: "a@b.ru", emailVerifiedAt: new Date() });
    await expect(unlinkOAuthIdentity("u1", "vk")).rejects.toMatchObject({ code: "LAST_LOGIN_METHOD" });
  });

  it("второй провайдер — способ входа: Яндекс отвязывается при живой связке VK", async () => {
    db.findUser.mockResolvedValue({ ...bare, yandexLink: { id: "y1" } });
    await expect(unlinkOAuthIdentity("u1", "yandex")).resolves.toEqual({ unlinked: true });
    expect(db.yandexDelete).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("нет связки — ничего не удаляет и не падает", async () => {
    db.findUser.mockResolvedValue({ ...bare, vkLink: null });
    await expect(unlinkOAuthIdentity("u1", "vk")).resolves.toEqual({ unlinked: false });
    expect(db.vkDelete).not.toHaveBeenCalled();
  });
});

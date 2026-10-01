/**
 * WELCOME-DIALOG-01 — приветствие этапа тестирования: флаг по умолчанию
 * включён, показ — один раз (пока не стоит `welcomeSeenAt`), `/api/me` несёт
 * решение, админский флаг его снимает.
 *
 * @probe 2026-10-01 (выполнены):
 *   1. `WELCOME_DIALOG_DEFAULT = false` → 3 красных: «без строки в SystemConfig
 *      окно показывается…», «сброс кэша…», «новый аккаунт при включённом флаге».
 *   2. `isWelcomePending` без проверки флага → 2 красных: «показывается, только
 *      пока флаг включён…», «флаг выключен — нет ни у кого».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { systemConfigFindUnique, userFindUnique, userUpdateMany, cacheStore } = vi.hoisted(() => ({
  systemConfigFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdateMany: vi.fn(),
  cacheStore: new Map<string, unknown>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemConfig: { findUnique: systemConfigFindUnique },
    userProfile: { findUnique: userFindUnique, updateMany: userUpdateMany },
  },
}));

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => void cacheStore.set(key, value)),
  del: vi.fn(async (key: string) => void cacheStore.delete(key)),
}));

import {
  clearWelcomeDialogEnabledCache,
  getWelcomeDialogEnabled,
  isWelcomePending,
} from "@/lib/onboarding/welcome-dialog";
import { markWelcomeSeen } from "@/lib/onboarding/welcome-seen";
import { getMeIdentityFromDb } from "@/lib/users/me";

const baseProfile = {
  id: "u1",
  roles: ["CLIENT"],
  displayName: null,
  phone: null,
  email: "a@b.ru",
  externalPhotoUrl: null,
  emailNotificationsEnabled: false,
  emailVerifiedAt: new Date(),
  pushNotificationsEnabled: false,
  isDeleted: false,
};

beforeEach(() => {
  cacheStore.clear();
  systemConfigFindUnique.mockReset();
  userFindUnique.mockReset();
  userUpdateMany.mockReset();
});

describe("флаг welcomeDialogEnabled", () => {
  it("без строки в SystemConfig окно показывается (по умолчанию включено)", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    expect(await getWelcomeDialogEnabled()).toBe(true);
  });

  it("выключенный в админке флаг читается как выключенный", async () => {
    systemConfigFindUnique.mockResolvedValue({ value: false });
    expect(await getWelcomeDialogEnabled()).toBe(false);
  });

  it("сброс кэша после переключения даёт новое значение сразу", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    expect(await getWelcomeDialogEnabled()).toBe(true);
    systemConfigFindUnique.mockResolvedValue({ value: false });
    await clearWelcomeDialogEnabledCache();
    expect(await getWelcomeDialogEnabled()).toBe(false);
  });
});

describe("показ один раз", () => {
  it("показывается, только пока флаг включён и окно не закрывали", () => {
    expect(isWelcomePending(true, null)).toBe(true);
    expect(isWelcomePending(true, new Date())).toBe(false);
    expect(isWelcomePending(false, null)).toBe(false);
  });

  it("закрытие ставит отметку только там, где её ещё нет", async () => {
    userUpdateMany.mockResolvedValue({ count: 1 });
    await markWelcomeSeen("u1");
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", welcomeSeenAt: null },
      data: { welcomeSeenAt: expect.any(Date) },
    });
  });
});

describe("/api/me несёт решение", () => {
  it("новый аккаунт при включённом флаге — welcomePending", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ ...baseProfile, welcomeSeenAt: null });
    expect((await getMeIdentityFromDb("u1"))?.welcomePending).toBe(true);
  });

  it("уже закрывший окно — нет", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ ...baseProfile, welcomeSeenAt: new Date() });
    expect((await getMeIdentityFromDb("u1"))?.welcomePending).toBe(false);
  });

  it("флаг выключен — нет ни у кого", async () => {
    systemConfigFindUnique.mockResolvedValue({ value: false });
    userFindUnique.mockResolvedValue({ ...baseProfile, welcomeSeenAt: null });
    expect((await getMeIdentityFromDb("u1"))?.welcomePending).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 — `GET /api/me` (и `user` мобильных входов, та же функция
 * `getMeIdentityFromDb`) несёт `avatarUrl` и `phoneVerified`; аватар — по тому
 * же правилу, что кабинетный профиль, и удалённый ассет не считается (профиль B1).
 *
 * @probe 2026-10-03 — из `where` `findClientAvatarFileUrl` убрано
 *        `deletedAt: null`: покраснел «удалённый аватар не считается…». Возвращено
 *        — 6/6.
 * @probe 2026-10-03 — `phoneVerified` считался по `phone !== null`: покраснел
 *        «номер-заявка — phoneVerified: false». Возвращено — 6/6.
 */

const userFindUnique = vi.hoisted(() => vi.fn());
const mediaAssetFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique: userFindUnique },
    mediaAsset: { findFirst: mediaAssetFindFirst },
    systemConfig: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
}));

import { getMeIdentityFromDb } from "@/lib/users/me";
import { resolveClientAvatarUrl } from "@/lib/users/client-avatar";

const profile = {
  id: "u1",
  roles: ["CLIENT"],
  displayName: "Анна",
  phone: "+79990000000",
  email: null,
  externalPhotoUrl: "https://sun.userapi.com/photo.jpg",
  emailNotificationsEnabled: false,
  emailVerifiedAt: null,
  phoneVerifiedAt: new Date("2026-10-01T10:00:00Z"),
  pushNotificationsEnabled: false,
  welcomeSeenAt: new Date(),
  isDeleted: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMeIdentityFromDb — аватар и подтверждённый номер", () => {
  it("загруженный аватар главнее фото провайдера входа", async () => {
    userFindUnique.mockResolvedValue(profile);
    mediaAssetFindFirst.mockResolvedValue({ id: "asset-1" });
    const me = await getMeIdentityFromDb("u1");
    expect(me?.avatarUrl).toBe("/api/media/file/asset-1");
    expect(me?.externalPhotoUrl).toBe(profile.externalPhotoUrl);
  });

  it("без загруженного — фото провайдера входа, без обоих — null", async () => {
    userFindUnique.mockResolvedValue(profile);
    mediaAssetFindFirst.mockResolvedValue(null);
    expect((await getMeIdentityFromDb("u1"))?.avatarUrl).toBe(profile.externalPhotoUrl);

    userFindUnique.mockResolvedValue({ ...profile, externalPhotoUrl: null });
    expect((await getMeIdentityFromDb("u1"))?.avatarUrl).toBeNull();
  });

  it("доказанный номер — phoneVerified: true", async () => {
    userFindUnique.mockResolvedValue(profile);
    mediaAssetFindFirst.mockResolvedValue(null);
    expect((await getMeIdentityFromDb("u1"))?.phoneVerified).toBe(true);
  });

  it("номер-заявка — phoneVerified: false", async () => {
    userFindUnique.mockResolvedValue({ ...profile, phoneVerifiedAt: null });
    mediaAssetFindFirst.mockResolvedValue(null);
    const me = await getMeIdentityFromDb("u1");
    expect(me?.phone).toBe("+79990000000");
    expect(me?.phoneVerified).toBe(false);
  });

  it("удалённый профиль — null", async () => {
    userFindUnique.mockResolvedValue({ ...profile, isDeleted: true });
    mediaAssetFindFirst.mockResolvedValue({ id: "asset-1" });
    expect(await getMeIdentityFromDb("u1")).toBeNull();
  });
});

describe("resolveClientAvatarUrl — правило кабинетного профиля", () => {
  it("удалённый аватар не считается: только READY и deletedAt: null, свежий первым", async () => {
    mediaAssetFindFirst.mockResolvedValue(null);
    await expect(resolveClientAvatarUrl("u1", "https://ext/photo.jpg")).resolves.toBe("https://ext/photo.jpg");
    const args = mediaAssetFindFirst.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      entityType: "USER",
      entityId: "u1",
      kind: "AVATAR",
      status: "READY",
      deletedAt: null,
    });
    expect(args?.orderBy).toEqual({ createdAt: "desc" });
  });
});

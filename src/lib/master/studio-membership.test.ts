import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — членство мастера в студии для `GET /api/master/profile`
 * (плашка «Вы работаете в составе студии») и веб-настроек аккаунта.
 */

const getCurrentMasterProviderContext = vi.hoisted(() => vi.fn());
const listStudioMasterProfiles = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  studio: { findUnique: vi.fn() },
  provider: { findUnique: vi.fn() },
  booking: { count: vi.fn() },
  studioMembership: { findUnique: vi.fn() },
}));

vi.mock("@/lib/master/access", () => ({ getCurrentMasterProviderContext, listStudioMasterProfiles }));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { loadMasterStudioMembership } from "@/lib/master/studio-membership";

const NOW = new Date("2026-10-04T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentMasterProviderContext.mockResolvedValue({ id: "personal-1", studioId: null });
  listStudioMasterProfiles.mockResolvedValue([{ id: "studio-profile-1", studioProviderId: "studio-provider-1" }]);
  prisma.studio.findUnique.mockResolvedValue({
    id: "studio-1",
    provider: { name: "Лотос", publicUsername: "lotos", avatarUrl: "/api/media/file/a1" },
  });
  prisma.provider.findUnique.mockResolvedValue({ createdAt: new Date("2026-05-01T00:00:00.000Z") });
  prisma.booking.count.mockResolvedValue(0);
  prisma.studioMembership.findUnique.mockResolvedValue({
    roles: ["MASTER"],
    status: "ACTIVE",
    createdAt: new Date("2026-04-01T09:00:00.000Z"),
  });
});

describe("loadMasterStudioMembership", () => {
  it("мастер не в студии — null, в базу за студией не ходим", async () => {
    listStudioMasterProfiles.mockResolvedValue([]);
    expect(await loadMasterStudioMembership("user-1", NOW)).toBeNull();
    expect(prisma.studio.findUnique).not.toHaveBeenCalled();
  });

  it("профиль в студии — студия, роль, дата входа, можно выйти", async () => {
    expect(await loadMasterStudioMembership("user-1", NOW)).toEqual({
      studioId: "studio-1",
      studioProviderId: "studio-provider-1",
      studioName: "Лотос",
      studioPublicUsername: "lotos",
      studioAvatarUrl: "/api/media/file/a1",
      role: "MASTER",
      joinedAt: "2026-04-01T09:00:00.000Z",
      studioProfileId: "studio-profile-1",
      blockingBookings: 0,
      canLeave: true,
    });
    expect(prisma.studioMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_studioId: { userId: "user-1", studioId: "studio-1" } },
      select: { roles: true, status: true, createdAt: true },
    });
  });

  it("будущие записи студии — выйти нельзя", async () => {
    prisma.booking.count.mockResolvedValue(2);
    const membership = await loadMasterStudioMembership("user-1", NOW);
    expect(membership).toMatchObject({ blockingBookings: 2, canLeave: false });
  });

  it("до разделения профилей — личный профиль со studioId; без членства — дата профиля и роль MASTER", async () => {
    listStudioMasterProfiles.mockResolvedValue([]);
    getCurrentMasterProviderContext.mockResolvedValue({ id: "personal-1", studioId: "studio-provider-1" });
    prisma.studioMembership.findUnique.mockResolvedValue(null);
    const membership = await loadMasterStudioMembership("user-1", NOW);
    expect(membership).toMatchObject({
      studioProfileId: "personal-1",
      role: "MASTER",
      joinedAt: "2026-05-01T00:00:00.000Z",
    });
  });

  it("старшая роль: владелец, который работает мастером своей студии", async () => {
    prisma.studioMembership.findUnique.mockResolvedValue({
      roles: ["MASTER", "OWNER"],
      status: "ACTIVE",
      createdAt: new Date("2026-04-01T09:00:00.000Z"),
    });
    expect((await loadMasterStudioMembership("user-1", NOW))?.role).toBe("OWNER");
  });
});

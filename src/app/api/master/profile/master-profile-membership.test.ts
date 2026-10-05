import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — `GET /api/master/profile` несёт `studioMembership`
 * (`lib/master/studio-membership.ts`): `master.isSolo` после разделения
 * профилей всегда `true` и плашку «Вы работаете в составе студии» не решает.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const getCurrentMasterProviderId = vi.hoisted(() => vi.fn());
const getMasterProfileData = vi.hoisted(() => vi.fn());
const loadMasterStudioMembership = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/master/access", () => ({ getCurrentMasterProviderId }));
vi.mock("@/lib/master/profile.service", () => ({ getMasterProfileData, updateMasterProfile: vi.fn() }));
vi.mock("@/lib/master/studio-membership", () => ({ loadMasterStudioMembership }));

import { AppError } from "@/lib/api/errors";
import { GET } from "@/app/api/master/profile/route";

const MEMBERSHIP = {
  studioId: "studio-1",
  studioProviderId: "studio-provider-1",
  studioName: "Лотос",
  studioPublicUsername: "lotos",
  studioAvatarUrl: null,
  role: "MASTER",
  joinedAt: "2026-04-01T09:00:00.000Z",
  studioProfileId: "studio-profile-1",
  blockingBookings: 1,
  canLeave: false,
};

const req = () => new Request("https://example.test/api/master/profile");

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  getCurrentMasterProviderId.mockResolvedValue("personal-1");
  getMasterProfileData.mockResolvedValue({ master: { id: "personal-1", isSolo: true }, services: [], portfolio: [] });
  loadMasterStudioMembership.mockResolvedValue(MEMBERSHIP);
});

describe("GET /api/master/profile — studioMembership", () => {
  it("401 без сессии", async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("мастер в студии — членство рядом с профилем", async () => {
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.master).toEqual({ id: "personal-1", isSolo: true });
    expect(body.data.studioMembership).toEqual(MEMBERSHIP);
    expect(loadMasterStudioMembership).toHaveBeenCalledWith("user-1");
  });

  it("не в студии — studioMembership: null", async () => {
    loadMasterStudioMembership.mockResolvedValue(null);
    const body = await (await GET(req())).json();
    expect(body.data.studioMembership).toBeNull();
  });

  it("не мастер — 403 как раньше", async () => {
    getCurrentMasterProviderId.mockRejectedValue(new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN"));
    const response = await GET(req());
    expect(response.status).toBe(403);
  });
});

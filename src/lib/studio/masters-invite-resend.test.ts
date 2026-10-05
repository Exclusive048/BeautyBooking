import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipStatus } from "@prisma/client";

/**
 * MOBILE-STUDIO-C (team) — `findPendingStudioMasterInvite`: повторить можно
 * только ожидающее приглашение заготовки без аккаунта; канал — тот контакт, на
 * который приглашение выписано (почта — раньше телефона, как при отзыве).
 */

const studioFindUnique = vi.hoisted(() => vi.fn());
const providerFindFirst = vi.hoisted(() => vi.fn());
const inviteFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    provider: { findFirst: providerFindFirst },
    studioInvite: { findUnique: inviteFindUnique },
  },
}));
vi.mock("@/lib/invites/service", () => ({ discardStagedMaster: vi.fn() }));
vi.mock("@/lib/studio/team-limits", () => ({ ensureStudioTeamLimit: vi.fn() }));

import { findPendingStudioMasterInvite } from "@/lib/studio/masters.service";

const input = { studioId: "studio-1", masterId: "m-1" };

beforeEach(() => {
  vi.clearAllMocks();
  studioFindUnique.mockResolvedValue({ id: "studio-1", providerId: "provider-s1", provider: { timezone: "Europe/Moscow" } });
  providerFindFirst.mockResolvedValue({
    id: "m-1",
    ownerUserId: null,
    contactPhone: "+79990000001",
    contactEmail: " Anna@Example.com ",
  });
  inviteFindUnique.mockResolvedValue({ id: "inv-1", status: MembershipStatus.PENDING });
});

describe("findPendingStudioMasterInvite", () => {
  it("finds an email invite by the normalised address", async () => {
    await expect(findPendingStudioMasterInvite(input)).resolves.toEqual({ inviteId: "inv-1", channel: "EMAIL" });
    expect(providerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "m-1", studioId: "provider-s1" }) }),
    );
    expect(inviteFindUnique).toHaveBeenCalledWith({
      where: { studioId_email: { studioId: "studio-1", email: "anna@example.com" } },
      select: { id: true, status: true },
    });
  });

  it("finds a phone invite", async () => {
    providerFindFirst.mockResolvedValue({ id: "m-1", ownerUserId: null, contactPhone: "+79990000001", contactEmail: null });

    await expect(findPendingStudioMasterInvite(input)).resolves.toEqual({ inviteId: "inv-1", channel: "PHONE" });
    expect(inviteFindUnique).toHaveBeenCalledWith({
      where: { studioId_phone: { studioId: "studio-1", phone: "+79990000001" } },
      select: { id: true, status: true },
    });
  });

  it("refuses a master who already has an account", async () => {
    providerFindFirst.mockResolvedValue({ id: "m-1", ownerUserId: "u-2", contactPhone: null, contactEmail: null });

    await expect(findPendingStudioMasterInvite(input)).rejects.toMatchObject({
      status: 409,
      code: "MASTER_NOT_INVITED",
      message: "У мастера нет активного приглашения.",
    });
    expect(inviteFindUnique).not.toHaveBeenCalled();
  });

  it.each([MembershipStatus.ACTIVE, MembershipStatus.REJECTED])("refuses a %s invite", async (status) => {
    inviteFindUnique.mockResolvedValue({ id: "inv-1", status });

    await expect(findPendingStudioMasterInvite(input)).rejects.toMatchObject({ status: 409, code: "MASTER_NOT_INVITED" });
  });

  it("refuses when no invite was issued", async () => {
    inviteFindUnique.mockResolvedValue(null);

    await expect(findPendingStudioMasterInvite(input)).rejects.toMatchObject({ status: 409, code: "MASTER_NOT_INVITED" });
  });

  it("answers 404 for a master outside the studio", async () => {
    providerFindFirst.mockResolvedValue(null);

    await expect(findPendingStudioMasterInvite(input)).rejects.toMatchObject({ status: 404, code: "MASTER_NOT_FOUND" });
  });

  it("answers 404 for an unknown studio", async () => {
    studioFindUnique.mockResolvedValue(null);

    await expect(findPendingStudioMasterInvite(input)).rejects.toMatchObject({ status: 404, code: "STUDIO_NOT_FOUND" });
    expect(providerFindFirst).not.toHaveBeenCalled();
  });
});

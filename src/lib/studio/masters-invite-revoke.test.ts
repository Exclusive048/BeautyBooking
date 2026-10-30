import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipStatus } from "@prisma/client";

/**
 * INVITE-ACCEPT-ATOMIC (B-05, 2026-10-30) — `revokeStudioMasterInvite`: отзыв
 * меняет статус только у ОЖИДАЮЩЕГО приглашения, тем же условием, что принятие
 * и отказ. Раньше запись была безусловной: отзыв, нажатый в момент принятия,
 * помечал отозванным уже принятое приглашение.
 *
 * Пины: условие в самой записи; успели принять — 409 и заготовка (уже профиль
 * мастера) не трогается; успели отклонить — без уведомления об отзыве.
 *
 * @probe 2026-10-30 — условие `status: PENDING` снято из `updateMany`:
 * краснеет «отзывает только ожидающее». Проверка `count === 0` снята (всегда
 * «отозвано»): краснеют «успели принять» и «успели отклонить». Возвращено — зелёный.
 */

const studioFindUnique = vi.hoisted(() => vi.fn());
const providerFindFirst = vi.hoisted(() => vi.fn());
const inviteFindUnique = vi.hoisted(() => vi.fn());
const inviteUpdateMany = vi.hoisted(() => vi.fn());
const discardStagedMaster = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    provider: { findFirst: providerFindFirst },
    studioInvite: { findUnique: inviteFindUnique, updateMany: inviteUpdateMany },
  },
}));
vi.mock("@/lib/invites/service", () => ({ discardStagedMaster }));
vi.mock("@/lib/studio/team-limits", () => ({ ensureStudioTeamLimit: vi.fn(), getStudioPendingInviteCap: vi.fn() }));

import { revokeStudioMasterInvite } from "@/lib/studio/masters.service";

const input = { studioId: "studio-1", masterId: "staged-1" };

beforeEach(() => {
  vi.clearAllMocks();
  studioFindUnique.mockResolvedValue({ id: "studio-1", providerId: "provider-s1", provider: { timezone: "Europe/Moscow" } });
  providerFindFirst.mockResolvedValue({ id: "staged-1", ownerUserId: null, contactPhone: "+79990000001", contactEmail: null });
  inviteFindUnique.mockResolvedValue({ id: "inv-1", status: MembershipStatus.PENDING });
  inviteUpdateMany.mockResolvedValue({ count: 1 });
  discardStagedMaster.mockResolvedValue("deleted");
});

describe("revokeStudioMasterInvite — условный отзыв", () => {
  it("🔴 отзывает только ожидающее приглашение и убирает заготовку", async () => {
    await expect(revokeStudioMasterInvite(input)).resolves.toEqual({ inviteId: "inv-1" });

    expect(inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", status: MembershipStatus.PENDING },
      data: { status: MembershipStatus.LEFT },
    });
    expect(discardStagedMaster).toHaveBeenCalledWith("staged-1");
  });

  it("🔴 успели принять — 409, принятый мастер не удаляется", async () => {
    inviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    inviteFindUnique
      .mockResolvedValueOnce({ id: "inv-1", status: MembershipStatus.PENDING })
      .mockResolvedValueOnce({ status: MembershipStatus.ACTIVE });

    await expect(revokeStudioMasterInvite(input)).rejects.toMatchObject({
      status: 409,
      code: "MASTER_NOT_INVITED",
      message: expect.stringMatching(/уже принял/),
    });
    expect(discardStagedMaster).not.toHaveBeenCalled();
  });

  it("успели отклонить — заготовка убирается, уведомления об отзыве нет", async () => {
    inviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    inviteFindUnique
      .mockResolvedValueOnce({ id: "inv-1", status: MembershipStatus.PENDING })
      .mockResolvedValueOnce({ status: MembershipStatus.REJECTED });

    await expect(revokeStudioMasterInvite(input)).resolves.toEqual({ inviteId: null });
    expect(discardStagedMaster).toHaveBeenCalledWith("staged-1");
  });

  it("принятый мастер (у заготовки уже есть владелец) — прежний отказ без записи", async () => {
    providerFindFirst.mockResolvedValueOnce({ id: "staged-1", ownerUserId: "user-1", contactPhone: null, contactEmail: null });

    await expect(revokeStudioMasterInvite(input)).rejects.toMatchObject({ status: 409, code: "MASTER_NOT_INVITED" });
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });
});

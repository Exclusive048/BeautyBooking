import { AccountType, MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { addRoleToUser } from "@/lib/auth/roles";
import type { Result } from "@/lib/domain/result";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { createMasterProfile } from "@/lib/profiles/professional";
import { attachMasterToStudio } from "@/lib/studios/masters";

type InviteAcceptResult = {
  inviteId: string;
  studioId: string;
  memberId: string;
  masterProviderId: string;
};

type InviteRejectResult = {
  inviteId: string;
};

function hasInvitePhoneAccess(userPhone: string | null, invitePhone: string): boolean {
  if (!userPhone) return false;
  const normalizedUserPhone = normalizeRussianPhone(userPhone);
  const normalizedInvitePhone = normalizeRussianPhone(invitePhone);
  if (!normalizedUserPhone || !normalizedInvitePhone) return false;
  return normalizedUserPhone === normalizedInvitePhone;
}

export async function acceptStudioInvite(
  inviteId: string,
  user: { id: string; phone: string | null; roles: AccountType[] }
): Promise<Result<InviteAcceptResult>> {
  const invite = await prisma.studioInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      phone: true,
      studioId: true,
      status: true,
      studio: { select: { providerId: true } },
    },
  });

  if (!invite) {
    return { ok: false, status: 404, message: "Invite not found", code: "INVITE_NOT_FOUND" };
  }

  if (!hasInvitePhoneAccess(user.phone, invite.phone)) {
    return { ok: false, status: 403, message: "Forbidden", code: "FORBIDDEN" };
  }

  if (invite.status === MembershipStatus.REJECTED) {
    return { ok: false, status: 409, message: "Invite already rejected", code: "INVITE_ALREADY_REJECTED" };
  }

  const stagedMaster = await prisma.provider.findFirst({
    where: {
      type: ProviderType.MASTER,
      studioId: invite.studio.providerId,
      contactPhone: invite.phone,
    },
    select: { id: true, ownerUserId: true, isPublished: true },
    orderBy: { createdAt: "asc" },
  });

  if (stagedMaster?.ownerUserId && stagedMaster.ownerUserId !== user.id) {
    return {
      ok: false,
      status: 409,
      message: "Invite phone is already attached to another account",
      code: "INVITE_PHONE_ALREADY_USED",
    };
  }

  if (stagedMaster && (!stagedMaster.ownerUserId || !stagedMaster.isPublished)) {
    await prisma.provider.update({
      where: { id: stagedMaster.id },
      data: {
        ownerUserId: user.id,
        isPublished: true,
      },
      select: { id: true },
    });
  }

  const masterProfile = await createMasterProfile({
    userId: user.id,
    roles: user.roles,
  });

  const attached = await attachMasterToStudio(invite.studio.providerId, masterProfile.providerId);
  if (!attached.ok) {
    return { ok: false, status: attached.status, message: attached.message, code: attached.code };
  }

  const memberId = await prisma.$transaction(async (tx) => {
    const membership = await tx.studioMembership.findUnique({
      where: { userId_studioId: { userId: user.id, studioId: invite.studioId } },
      select: { id: true, roles: true },
    });

    const nextRoles = membership
      ? Array.from(new Set([...membership.roles, StudioRole.MASTER]))
      : [StudioRole.MASTER];

    const savedMembership = membership
      ? await tx.studioMembership.update({
          where: { id: membership.id },
          data: { status: MembershipStatus.ACTIVE, roles: nextRoles },
          select: { id: true },
        })
      : await tx.studioMembership.create({
          data: {
            userId: user.id,
            studioId: invite.studioId,
            status: MembershipStatus.ACTIVE,
            roles: nextRoles,
          },
          select: { id: true },
        });

    await tx.studioInvite.update({
      where: { id: invite.id },
      data: { status: MembershipStatus.ACTIVE },
      select: { id: true },
    });

    return savedMembership.id;
  });

  if (!user.roles.includes(AccountType.MASTER)) {
    await addRoleToUser(user.id, user.roles, AccountType.MASTER);
  }

  return {
    ok: true,
    data: {
      inviteId: invite.id,
      studioId: invite.studioId,
      memberId,
      masterProviderId: masterProfile.providerId,
    },
  };
}

export async function rejectStudioInvite(
  inviteId: string,
  user: { id: string; phone: string | null }
): Promise<Result<InviteRejectResult>> {
  const invite = await prisma.studioInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, phone: true, status: true },
  });

  if (!invite) {
    return { ok: false, status: 404, message: "Invite not found", code: "INVITE_NOT_FOUND" };
  }

  if (!hasInvitePhoneAccess(user.phone, invite.phone)) {
    return { ok: false, status: 403, message: "Forbidden", code: "FORBIDDEN" };
  }

  if (invite.status === MembershipStatus.ACTIVE) {
    return { ok: false, status: 409, message: "Invite already accepted", code: "INVITE_ALREADY_ACCEPTED" };
  }

  if (invite.status === MembershipStatus.REJECTED) {
    return { ok: true, data: { inviteId: invite.id } };
  }

  await prisma.studioInvite.update({
    where: { id: invite.id },
    data: { status: MembershipStatus.REJECTED },
    select: { id: true },
  });

  return { ok: true, data: { inviteId: invite.id } };
}

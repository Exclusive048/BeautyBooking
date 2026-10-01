import { AccountType, MediaEntityType, MembershipStatus, Prisma, ProviderType, StudioRole } from "@prisma/client";
import { toAppError } from "@/lib/api/errors";
import { addRoleToUser } from "@/lib/auth/roles";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import type { Result, StatusCode } from "@/lib/domain/result";
import { normalizeInviteEmail, resolveInviteAccess } from "@/lib/invites/access";
import { logError } from "@/lib/logging/logger";
import { collectProviderMedia } from "@/lib/media/purge";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { createMasterProfile } from "@/lib/profiles/professional";
import { ensureStudioTeamLimit } from "@/lib/studio/team-limits";
import { attachMasterToStudio } from "@/lib/studios/masters";
import { claimStagedStudioProfileTx, createStudioMasterProfileTx } from "@/lib/studios/master-profile-split";

type InviteAcceptResult = {
  inviteId: string;
  studioId: string;
  memberId: string;
  masterProviderId: string;
};

type InviteRejectResult = {
  inviteId: string;
};

/**
 * PHONE-CLAIM-01 + FIX-STUDIO-SELF-INVITE: право на приглашение резолвит
 * `resolveInviteAccess` (`lib/invites/access.ts`) — там же записано, почему
 * грантов два и почему второй не ослабляет инв. #46.
 *
 * Доказанное владение номером (`PHONE_OWNER`) осталось ровно тем же. Добавлен
 * `STUDIO_ADMIN`: администратор СВОЕЙ студии со своим же номером в профиле.
 * Без него до включения SMS-шлюза принять приглашение не мог никто —
 * подтверждённых номеров в проде нет ни у кого.
 */
type InviteActor = {
  id: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
};

async function hasInviteAccess(
  user: InviteActor,
  invite: { phone: string | null; email: string | null; studioId: string },
): Promise<boolean> {
  const grant = await resolveInviteAccess({
    userId: user.id,
    userPhone: user.phone,
    userPhoneVerifiedAt: user.phoneVerifiedAt,
    userEmail: user.email,
    userEmailVerifiedAt: user.emailVerifiedAt,
    invitePhone: invite.phone,
    inviteEmail: invite.email,
    inviteStudioId: invite.studioId,
  });
  return grant !== null;
}

/**
 * STUDIO-INVITE-EMAIL-01 — заготовка мастера, которую студия завела вместе с
 * приглашением, ищется по тому контакту, на который приглашение выписано:
 * `contactPhone` для телефона, `contactEmail` для почты.
 */
function stagedMasterContactWhere(invite: { phone: string | null; email: string | null }) {
  const email = normalizeInviteEmail(invite.email);
  if (email) return { contactEmail: email };
  const phone = invite.phone ? (normalizeRussianPhone(invite.phone) ?? invite.phone) : null;
  return phone ? { contactPhone: phone } : null;
}

/**
 * 29.09 доработки · 26 — неотвеченные приглашения, адресованные ПОДТВЕРЖДЁННЫМ
 * контактам человека, который удаляет аккаунт, и заготовки мастера под них.
 * Неподтверждённый номер или адрес мог быть чужим (инв. #41/#46) — по нему
 * чужие приглашения не ищутся. Удаляет вызывающий: строки приглашений — в своей
 * транзакции, заготовки — после неё (`discardStagedMaster`, с фото).
 */
export async function findPendingInvitesAddressedTo(contact: {
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
}): Promise<{ inviteIds: string[]; stagedMasterIds: string[] }> {
  const phone = contact.phoneVerified && contact.phone ? (normalizeRussianPhone(contact.phone) ?? contact.phone) : null;
  const email = contact.emailVerified ? normalizeInviteEmail(contact.email) : null;
  const addressedTo = [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])];
  if (addressedTo.length === 0) return { inviteIds: [], stagedMasterIds: [] };

  const invites = await prisma.studioInvite.findMany({
    where: { status: MembershipStatus.PENDING, OR: addressedTo },
    select: { id: true, phone: true, email: true, studio: { select: { providerId: true } } },
  });
  const stagedMasterIds: string[] = [];
  for (const invite of invites) {
    const contactWhere = stagedMasterContactWhere(invite);
    if (!contactWhere) continue;
    const staged = await prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: invite.studio.providerId, ...contactWhere, ownerUserId: null },
      select: { id: true },
    });
    stagedMasterIds.push(...staged.map((row) => row.id));
  }
  return { inviteIds: invites.map((invite) => invite.id), stagedMasterIds };
}

export async function acceptStudioInvite(
  inviteId: string,
  user: InviteActor & { roles: AccountType[] }
): Promise<Result<InviteAcceptResult>> {
  const invite = await prisma.studioInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      phone: true,
      email: true,
      studioId: true,
      status: true,
      studio: { select: { providerId: true } },
    },
  });

  if (!invite) {
    return { ok: false, status: 404, message: "Приглашение не найдено.", code: "INVITE_NOT_FOUND" };
  }

  if (!(await hasInviteAccess(user, invite))) {
    return { ok: false, status: 403, message: "Недостаточно прав для этого действия.", code: "FORBIDDEN" };
  }

  if (invite.status === MembershipStatus.LEFT) {
    return { ok: false, status: 409, message: "Приглашение отозвано.", code: "INVITE_REVOKED" };
  }

  if (invite.status === MembershipStatus.ACTIVE) {
    return { ok: false, status: 409, message: "Приглашение уже принято.", code: "INVITE_ALREADY_ACCEPTED" };
  }

  if (invite.status === MembershipStatus.REJECTED) {
    return { ok: false, status: 409, message: "Приглашение уже отклонено.", code: "INVITE_ALREADY_REJECTED" };
  }

  // BC-CAP: accepting an invite makes a master ACTIVE (consumes a seat). Under
  // ACTIVE-only counting, pending invites don't reserve seats, so enforcement
  // must land HERE — the point the seat actually becomes ACTIVE — not only at
  // invite-send. Blocks joining a full studio; the invite stays pending until a
  // seat frees up or the studio upgrades its plan.
  try {
    await ensureStudioTeamLimit(invite.studioId);
  } catch (error) {
    const appError = toAppError(error);
    // `ensureStudioTeamLimit` throws 409 LIMIT_REACHED (cap) or 404 (studio
    // gone); narrow to the Result StatusCode union, anything else → 500.
    const status: StatusCode =
      appError.status === 404 ? 404 : appError.status === 409 ? 409 : 500;
    return { ok: false, status, message: appError.message, code: appError.code };
  }

  const contactWhere = stagedMasterContactWhere(invite);
  const stagedMaster = contactWhere
    ? await prisma.provider.findFirst({
        where: {
          type: ProviderType.MASTER,
          studioId: invite.studio.providerId,
          ...contactWhere,
        },
        select: {
          id: true,
          ownerUserId: true,
          isPublished: true,
          studioPaused: true,
          publicUsername: true,
          categories: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : null;

  if (stagedMaster?.ownerUserId && stagedMaster.ownerUserId !== user.id) {
    return {
      ok: false,
      status: 409,
      message: invite.email
        ? "Эта почта уже привязана к другому аккаунту."
        : "Этот телефон уже привязан к другому аккаунту.",
      code: "INVITE_PHONE_ALREADY_USED",
    };
  }

  // STUDIO-MASTER-PROFILES (этап 4, решение владельца 2026-09-27): мастер —
  // это профиль для записи. Принявший приглашение получает ОТДЕЛЬНЫЙ профиль в
  // студии; его личный профиль (кабинет мастера, своя страница и услуги) в
  // студию не привязывается. Раньше привязывался сам личный профиль, и одно
  // расписание, одни правила и одни услуги обслуживали обе работы.
  //
  // 1. Личный профиль: есть — остаётся как есть; нет — создаётся обычным путём
  //    (кабинет мастера держится на нём: страница, свои услуги, настройки).
  const existingMasterProfile = await prisma.masterProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, providerId: true },
  });
  const personalProviderId = existingMasterProfile
    ? existingMasterProfile.providerId
    : (await createMasterProfile({ userId: user.id, roles: user.roles })).providerId;

  // Роль — вместе с кабинетом мастера, ДО привязки к студии.
  if (!user.roles.includes(AccountType.MASTER)) {
    await addRoleToUser(user.id, user.roles, AccountType.MASTER);
  }

  // 2. Мастер работает в одной студии: активный профиль в ДРУГОЙ студии —
  //    отказ (как раньше «Мастер уже состоит в студии»).
  const otherStudioProfile = await prisma.provider.findFirst({
    where: {
      ownerUserId: user.id,
      type: ProviderType.MASTER,
      masterProfile: { is: null },
      studioId: { not: null, notIn: [invite.studio.providerId] },
    },
    select: { id: true },
  });
  if (otherStudioProfile) {
    return { ok: false, status: 409, message: "Мастер уже состоит в студии.", code: "MASTER_ALREADY_ASSIGNED" };
  }

  // 3. Профиль в этой студии: уже был (вернулся после ухода) → он же; иначе
  //    заготовка студии под приглашение; иначе — копия личного.
  const ownStudioProfile = await prisma.provider.findFirst({
    where: {
      ownerUserId: user.id,
      type: ProviderType.MASTER,
      masterProfile: { is: null },
      studioId: invite.studio.providerId,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let masterProviderId: string;
  // Заготовка уходит только ПОСЛЕ успешного принятия.
  let stagedToDiscard: string | null = null;
  if (ownStudioProfile) {
    masterProviderId = ownStudioProfile.id;
    await prisma.provider.update({
      where: { id: ownStudioProfile.id },
      data: { studioPaused: false },
      select: { id: true },
    });
    if (stagedMaster && stagedMaster.id !== ownStudioProfile.id && !stagedMaster.ownerUserId) {
      stagedToDiscard = stagedMaster.id;
    }
  } else if (stagedMaster) {
    masterProviderId = stagedMaster.id;
    await prisma.$transaction((tx) =>
      claimStagedStudioProfileTx(tx, {
        stagedId: stagedMaster.id,
        personalId: personalProviderId,
        ownerUserId: user.id,
      }),
    );
  } else {
    const created = await prisma.$transaction((tx) =>
      createStudioMasterProfileTx(tx, {
        personalId: personalProviderId,
        studioProviderId: invite.studio.providerId,
      }),
    );
    if (!created) {
      return { ok: false, status: 404, message: "Студия не найдена.", code: "STUDIO_NOT_FOUND" };
    }
    masterProviderId = created;
  }

  // Пояс и место профиля в студии — студии (`attachMasterToStudio` для уже
  // привязанного профиля только синхронизирует их).
  const attached = await attachMasterToStudio(invite.studio.providerId, masterProviderId);
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
          data: { status: MembershipStatus.ACTIVE, roles: nextRoles, leftAt: null },
          select: { id: true },
        })
      : await tx.studioMembership.create({
          data: {
            userId: user.id,
            studioId: invite.studioId,
            status: MembershipStatus.ACTIVE,
            roles: nextRoles,
            leftAt: null,
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

  if (stagedToDiscard) {
    try {
      await discardStagedMaster(stagedToDiscard);
    } catch (error) {
      // Приглашение уже принято; брошенная заготовка — мусор, а не отказ.
      logError("Failed to discard staged master after invite accept", {
        stagedMasterId: stagedToDiscard,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    data: {
      inviteId: invite.id,
      studioId: invite.studioId,
      memberId,
      masterProviderId,
    },
  };
}

export async function rejectStudioInvite(
  inviteId: string,
  user: InviteActor
): Promise<Result<InviteRejectResult>> {
  const invite = await prisma.studioInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      phone: true,
      email: true,
      status: true,
      studioId: true,
      studio: { select: { providerId: true } },
    },
  });

  if (!invite) {
    return { ok: false, status: 404, message: "Приглашение не найдено.", code: "INVITE_NOT_FOUND" };
  }

  if (!(await hasInviteAccess(user, invite))) {
    return { ok: false, status: 403, message: "Недостаточно прав для этого действия.", code: "FORBIDDEN" };
  }

  if (invite.status === MembershipStatus.ACTIVE) {
    return { ok: false, status: 409, message: "Приглашение уже принято.", code: "INVITE_ALREADY_ACCEPTED" };
  }

  if (invite.status === MembershipStatus.LEFT) {
    return { ok: false, status: 409, message: "Приглашение отозвано.", code: "INVITE_REVOKED" };
  }

  if (invite.status === MembershipStatus.REJECTED) {
    return { ok: true, data: { inviteId: invite.id } };
  }

  const contactWhere = stagedMasterContactWhere(invite);
  const staged = contactWhere
    ? await prisma.provider.findMany({
        where: {
          type: ProviderType.MASTER,
          studioId: invite.studio.providerId,
          ...contactWhere,
          ownerUserId: null,
        },
        select: { id: true },
      })
    : [];

  await prisma.studioInvite.update({
    where: { id: invite.id },
    data: { status: MembershipStatus.REJECTED },
    select: { id: true },
  });

  // Заготовка (ничейный Provider под приглашение) уходит тем же путём, что при
  // принятии, — вместе с фото, которые мог загрузить админ студии. Удаляется
  // только строка без владельца: условие стоит в самой записи.
  for (const { id } of staged) {
    try {
      await discardStagedMaster(id);
    } catch (error) {
      logError("Failed to discard staged master after invite reject", {
        stagedMasterId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok: true, data: { inviteId: invite.id } };
}

/**
 * STUDIO-INVITE-STUB-01 (2026-09-23) — заготовка мастера, которую студия завела
 * под приглашение (`studio/masters.service.ts` → `createStudioMaster`), не
 * нужна, если принимающий уже мастер: к студии прикрепляется его собственный
 * кабинет. Раньше заготовку «отвязывали» (`studioId`/`ownerUserId` = null), и
 * она навсегда оставалась сиротой без владельца и без студии.
 *
 * На заготовке ничего не держится по построению: INVITED не назначается на
 * услуги и не принимает записей (инв. #24). Поэтому она удаляется; если внешний
 * ключ всё же держит строку (P2003) — прежнее поведение, отвязать.
 */
export async function discardStagedMaster(
  stagedMasterId: string
): Promise<"deleted" | "detached" | "kept"> {
  // Фото заготовки мог загрузить админ студии (редактор профиля мастера), а у
  // `MediaAsset` нет внешнего ключа на `Provider` — каскада к нему нет. Снимок
  // до удаления: после него указателей на объекты не найти (DELETION-02).
  const media = await collectProviderMedia(MediaEntityType.MASTER, stagedMasterId);
  try {
    // Удаляется только НИЧЕЙНАЯ строка: условие в самой записи, а не в
    // вызывающем, — кабинет, успевший получить владельца, не удалится никогда.
    const removed = await prisma.provider.deleteMany({ where: { id: stagedMasterId, ownerUserId: null } });
    if (removed.count === 0) return "kept";
    await enqueueMediaPurge(media, "staged-master-discard", null);
    return "deleted";
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") {
      throw error;
    }
    await prisma.provider.updateMany({
      where: { id: stagedMasterId, ownerUserId: null },
      data: { studioId: null, isPublished: false },
    });
    return "detached";
  }
}

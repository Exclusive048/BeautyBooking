import { AccountType, MediaEntityType, MembershipStatus, Prisma, ProviderType, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { addRoleToUser } from "@/lib/auth/roles";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import type { Result, StatusCode } from "@/lib/domain/result";
import { normalizeInviteEmail, resolveInviteAccess } from "@/lib/invites/access";
import { lockInviteAcceptorTx, lockStudioInvitesTx } from "@/lib/invites/locks";
import { resolveMasterInviteReadiness } from "@/lib/invites/master-readiness";
import { logError } from "@/lib/logging/logger";
import { collectProviderMedia } from "@/lib/media/purge";
import { markAssetsDeletedTx } from "@/lib/media/soft-delete";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import {
  assertStudioTeamSeatAvailable,
  resolveStudioTeamSeat,
  type StudioTeamSeat,
} from "@/lib/studio/team-limits";
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

/**
 * Отказ «сначала Первые шаги» (решение владельца 2026-10-14,
 * `invites/master-readiness.ts`). Текст называет, что сделать, — кнопку туда
 * карточка приглашения показывает заранее.
 */
function masterOnboardingRequired(hasCabinet: boolean): InviteRefusal {
  return {
    ok: false,
    status: 409,
    message: hasCabinet
      ? "Сначала пройдите все «Первые шаги» в кабинете мастера — после этого приглашение можно принять."
      : "Сначала создайте кабинет мастера и пройдите в нём «Первые шаги» — после этого приглашение можно принять.",
    code: "MASTER_ONBOARDING_REQUIRED",
  };
}

type InviteRefusal = Extract<Result<never>, { ok: false }>;

const INVITE_NOT_FOUND: InviteRefusal = {
  ok: false,
  status: 404,
  message: "Приглашение не найдено.",
  code: "INVITE_NOT_FOUND",
};

/**
 * INVITE-ACCEPT-ATOMIC — проигравший гонку (конфликт записи, повтор уникальной
 * строки) получает 409 с действием, а не 500.
 */
const INVITE_ACCEPT_CONFLICT: InviteRefusal = {
  ok: false,
  status: 409,
  message: "Не удалось принять приглашение. Обновите страницу и попробуйте ещё раз.",
  code: "CONFLICT",
};

/** Закрытое приглашение — отказ; `null` — ещё ждёт ответа. */
function closedInviteRefusal(status: MembershipStatus | null): InviteRefusal | null {
  switch (status) {
    case null:
      return INVITE_NOT_FOUND;
    case MembershipStatus.LEFT:
      return { ok: false, status: 409, message: "Приглашение отозвано.", code: "INVITE_REVOKED" };
    case MembershipStatus.ACTIVE:
      return { ok: false, status: 409, message: "Приглашение уже принято.", code: "INVITE_ALREADY_ACCEPTED" };
    case MembershipStatus.REJECTED:
      return { ok: false, status: 409, message: "Приглашение уже отклонено.", code: "INVITE_ALREADY_REJECTED" };
    default:
      return null;
  }
}

/**
 * Отказ лимита команды (`assertStudioTeamSeatAvailable` / `resolveStudioTeamSeat`):
 * 409 LIMIT_REACHED или 404 «студии нет»; прочее — не отказ, а сбой.
 */
function teamLimitRefusal(error: unknown): InviteRefusal | null {
  if (!(error instanceof AppError)) return null;
  const status: StatusCode = error.status === 404 ? 404 : error.status === 409 ? 409 : 500;
  return { ok: false, status, message: error.message, code: error.code };
}

/** Отказ изнутри транзакции приёма: бросается, чтобы откатить всё записанное. */
class InviteAcceptRefused extends Error {
  constructor(readonly refusal: InviteRefusal) {
    super(refusal.message);
    this.name = "InviteAcceptRefused";
  }
}

/** Копия расписания личного профиля и ожидание блокировок — дольше 5 с по умолчанию. */
const INVITE_ACCEPT_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * INVITE-ACCEPT-ATOMIC (2026-10-30) — приглашение принимается ОДНОЙ транзакцией:
 * статус приглашения, профиль в студии, привязка к студии и членство либо
 * записываются все, либо ни одно.
 *
 * Раньше каждый шаг шёл своим запросом, а статус менялся безусловно в самом
 * конце. Два нажатия «Принять» (двойной клик, две вкладки, веб и приложение)
 * проходили проверки вместе: первое создавало профиль в студии, второе —
 * второй, а приглашение помечалось принятым дважды. Приглашения двух студий,
 * принятые одновременно, давали человеку профили в обеих, хотя мастер работает
 * в одной студии. А при одном свободном месте в команде его занимали оба.
 *
 * Как держится:
 * 1. Первые инструкции транзакции — блокировки человека, потом студии
 *    (`invites/locks.ts`). Под ними проверки «профиль в другой студии», «свой
 *    профиль в этой студии» и подсчёт мест видят то, что записала предыдущая
 *    транзакция.
 * 2. Статус меняется условно — только у ОЖИДАЮЩЕГО приглашения. Отказ и отзыв
 *    идут тем же условием и блокировок не берут: из двух побеждает первое,
 *    второе получает отказ по фактическому статусу, а записанное откатывается.
 * 3. Заготовка студии захватывается тоже условно (только ничейная) — расписание
 *    второй раз не копируется.
 * 4. Повтор уникальной строки (P2002) и конфликт записи (P2034) — 409.
 *
 * Проверки, которые человек исправляет сам («Первые шаги», есть ли место),
 * идут и до транзакции — чтобы на отказе не ждать блокировок. Заготовка,
 * ставшая ненужной, удаляется после коммита.
 */
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

  if (!invite) return INVITE_NOT_FOUND;

  if (!(await hasInviteAccess(user, invite))) {
    return { ok: false, status: 403, message: "Недостаточно прав для этого действия.", code: "FORBIDDEN" };
  }

  const closed = closedInviteRefusal(invite.status);
  if (closed) return closed;

  // Решение владельца 2026-10-14: в команду студии — только с настроенным
  // кабинетом мастера (все «Первые шаги»). Проверка — до места в команде:
  // её человек исправляет сам. Свой адрес приглашения у владельца студии —
  // не исключение.
  const readiness = await resolveMasterInviteReadiness(user.id);
  if (!readiness.ready) return masterOnboardingRequired(readiness.hasCabinet);

  // BC-CAP: accepting an invite makes a master ACTIVE (consumes a seat). Under
  // ACTIVE-only counting, pending invites don't reserve seats, so enforcement
  // must land HERE — the point the seat actually becomes ACTIVE — not only at
  // invite-send. Blocks joining a full studio; the invite stays pending until a
  // seat frees up or the studio upgrades its plan. Тариф владельца читается
  // здесь, места считаются ещё раз в транзакции — под блокировкой студии.
  let seat: StudioTeamSeat;
  try {
    seat = await resolveStudioTeamSeat(invite.studioId);
    await assertStudioTeamSeatAvailable(seat);
  } catch (error) {
    const refusal = teamLimitRefusal(error);
    if (!refusal) throw error;
    return refusal;
  }

  // STUDIO-MASTER-PROFILES (этап 4, решение владельца 2026-09-27): мастер —
  // это профиль для записи. Принявший приглашение получает ОТДЕЛЬНЫЙ профиль в
  // студии; его личный профиль (кабинет мастера, своя страница и услуги) в
  // студию не привязывается. Личный профиль есть всегда: без кабинета мастера
  // приглашение не принимается (проверка выше).
  if (!(await prisma.masterProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))) {
    return masterOnboardingRequired(false);
  }

  // Роль у владельца кабинета мастера есть; страховка — ДО привязки к студии.
  if (!user.roles.includes(AccountType.MASTER)) {
    await addRoleToUser(user.id, user.roles, AccountType.MASTER);
  }

  const studioProviderId = invite.studio.providerId;
  let accepted: { memberId: string; masterProviderId: string; stagedToDiscard: string | null };
  try {
    accepted = await prisma.$transaction(async (tx) => {
      await lockInviteAcceptorTx(tx, user.id);
      await lockStudioInvitesTx(tx, invite.studioId);

      const claimed = await tx.studioInvite.updateMany({
        where: { id: invite.id, status: MembershipStatus.PENDING },
        data: { status: MembershipStatus.ACTIVE },
      });
      if (claimed.count === 0) {
        const current = await tx.studioInvite.findUnique({ where: { id: invite.id }, select: { status: true } });
        throw new InviteAcceptRefused(closedInviteRefusal(current?.status ?? null) ?? INVITE_ACCEPT_CONFLICT);
      }

      try {
        await assertStudioTeamSeatAvailable(seat, tx);
      } catch (error) {
        const refusal = teamLimitRefusal(error);
        if (!refusal) throw error;
        throw new InviteAcceptRefused(refusal);
      }

      // Личный профиль мог исчезнуть после проверки выше (удалили кабинет).
      const personal = await tx.masterProfile.findUnique({
        where: { userId: user.id },
        select: { providerId: true },
      });
      if (!personal) throw new InviteAcceptRefused(masterOnboardingRequired(false));

      const contactWhere = stagedMasterContactWhere(invite);
      const stagedMaster = contactWhere
        ? await tx.provider.findFirst({
            where: { type: ProviderType.MASTER, studioId: studioProviderId, ...contactWhere },
            select: { id: true, ownerUserId: true },
            orderBy: { createdAt: "asc" },
          })
        : null;
      if (stagedMaster?.ownerUserId && stagedMaster.ownerUserId !== user.id) {
        throw new InviteAcceptRefused({
          ok: false,
          status: 409,
          message: invite.email
            ? "Эта почта уже привязана к другому аккаунту."
            : "Этот телефон уже привязан к другому аккаунту.",
          code: "INVITE_PHONE_ALREADY_USED",
        });
      }

      // Мастер работает в одной студии: активный профиль в ДРУГОЙ студии — отказ.
      const otherStudioProfile = await tx.provider.findFirst({
        where: {
          ownerUserId: user.id,
          type: ProviderType.MASTER,
          masterProfile: { is: null },
          studioId: { not: null, notIn: [studioProviderId] },
        },
        select: { id: true },
      });
      if (otherStudioProfile) {
        throw new InviteAcceptRefused({
          ok: false,
          status: 409,
          message: "Мастер уже состоит в студии.",
          code: "MASTER_ALREADY_ASSIGNED",
        });
      }

      // Профиль в этой студии: уже был (вернулся после ухода) → он же; иначе
      // заготовка студии под приглашение; иначе — копия личного.
      const ownStudioProfile = await tx.provider.findFirst({
        where: {
          ownerUserId: user.id,
          type: ProviderType.MASTER,
          masterProfile: { is: null },
          studioId: studioProviderId,
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      let masterProviderId: string;
      // Заготовка уходит только ПОСЛЕ успешного принятия.
      let stagedToDiscard: string | null = null;
      if (ownStudioProfile) {
        masterProviderId = ownStudioProfile.id;
        await tx.provider.update({
          where: { id: ownStudioProfile.id },
          data: { studioPaused: false },
          select: { id: true },
        });
        if (stagedMaster && stagedMaster.id !== ownStudioProfile.id && !stagedMaster.ownerUserId) {
          stagedToDiscard = stagedMaster.id;
        }
      } else if (stagedMaster) {
        masterProviderId = stagedMaster.id;
        const claimedStaged = await claimStagedStudioProfileTx(tx, {
          stagedId: stagedMaster.id,
          personalId: personal.providerId,
          ownerUserId: user.id,
        });
        if (!claimedStaged) throw new InviteAcceptRefused(INVITE_ACCEPT_CONFLICT);
      } else {
        const created = await createStudioMasterProfileTx(tx, {
          personalId: personal.providerId,
          studioProviderId,
        });
        if (!created) {
          throw new InviteAcceptRefused({ ok: false, status: 404, message: "Студия не найдена.", code: "STUDIO_NOT_FOUND" });
        }
        masterProviderId = created;
      }

      // Пояс и место профиля в студии — студии (`attachMasterToStudio` для уже
      // привязанного профиля только синхронизирует их).
      const attached = await attachMasterToStudio(studioProviderId, masterProviderId, tx);
      if (!attached.ok) {
        throw new InviteAcceptRefused({
          ok: false,
          status: attached.status,
          message: attached.message,
          code: attached.code,
        });
      }

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

      return { memberId: savedMembership.id, masterProviderId, stagedToDiscard };
    }, INVITE_ACCEPT_TX_OPTIONS);
  } catch (error) {
    if (error instanceof InviteAcceptRefused) return error.refusal;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return INVITE_ACCEPT_CONFLICT;
    }
    throw error;
  }

  if (accepted.stagedToDiscard) {
    try {
      await discardStagedMaster(accepted.stagedToDiscard);
    } catch (error) {
      // Приглашение уже принято; брошенная заготовка — мусор, а не отказ.
      logError("Failed to discard staged master after invite accept", {
        stagedMasterId: accepted.stagedToDiscard,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    data: {
      inviteId: invite.id,
      studioId: invite.studioId,
      memberId: accepted.memberId,
      masterProviderId: accepted.masterProviderId,
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

  if (!invite) return INVITE_NOT_FOUND;

  if (!(await hasInviteAccess(user, invite))) {
    return { ok: false, status: 403, message: "Недостаточно прав для этого действия.", code: "FORBIDDEN" };
  }

  // Повторный отказ — успех: человек хотел ровно этого.
  if (invite.status === MembershipStatus.REJECTED) {
    return { ok: true, data: { inviteId: invite.id } };
  }
  const closed = closedInviteRefusal(invite.status);
  if (closed) return closed;

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

  // INVITE-ACCEPT-ATOMIC: отказ меняет статус только у ОЖИДАЮЩЕГО приглашения —
  // тем же условием, что принятие. Безусловная запись помечала отклонённым
  // приглашение, которое в этот момент принимали в другой вкладке.
  const rejected = await prisma.studioInvite.updateMany({
    where: { id: invite.id, status: MembershipStatus.PENDING },
    data: { status: MembershipStatus.REJECTED },
  });
  if (rejected.count === 0) {
    const current = await prisma.studioInvite.findUnique({ where: { id: invite.id }, select: { status: true } });
    if (current?.status === MembershipStatus.REJECTED) return { ok: true, data: { inviteId: invite.id } };
    return (
      closedInviteRefusal(current?.status ?? null) ?? {
        ok: false,
        status: 409,
        message: "Не удалось отклонить приглашение. Обновите страницу и попробуйте ещё раз.",
        code: "CONFLICT",
      }
    );
  }

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
    // MEDIA-PURGE-MARK-DELETED: фото удалённой заготовки помечаются той же
    // транзакцией — аватар публичен по построению и иначе отдавался бы, пока
    // `media.purge` не доберётся до строки.
    const removed = await prisma.$transaction(async (tx) => {
      const result = await tx.provider.deleteMany({ where: { id: stagedMasterId, ownerUserId: null } });
      if (result.count > 0) await markAssetsDeletedTx(tx, media.map((asset) => asset.id));
      return result;
    });
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

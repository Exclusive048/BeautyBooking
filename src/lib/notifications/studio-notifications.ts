import { Prisma, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listAdministeredStudioIds, normalizeInviteEmail } from "@/lib/invites/access";
import { buildNotificationEmailHtml, buildNotificationEmailText } from "@/lib/email/templates/notification";
import { isEmailConfigured, sendEmail } from "@/lib/email/sender";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import { maskEmail } from "@/lib/logging/masking";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { deliverNotification } from "@/lib/notifications/delivery";
import { publishRealtime } from "@/lib/notifications/service";
import type { NotificationEvent } from "@/lib/notifications/types";

const inviteInclude = {
  studio: {
    select: {
      id: true,
      ownerUserId: true,
      provider: { select: { name: true, ownerUserId: true } },
    },
  },
  invitedBy: {
    select: {
      displayName: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
} as const;

export type InviteWithRelations = Prisma.StudioInviteGetPayload<{
  include: typeof inviteInclude;
}>;

const scheduleRequestInclude = {
  studio: {
    select: {
      id: true,
      ownerUserId: true,
      provider: { select: { name: true, ownerUserId: true } },
    },
  },
  provider: {
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  },
} as const;

export type ScheduleRequestWithRelations = Prisma.ScheduleChangeRequestGetPayload<{
  include: typeof scheduleRequestInclude;
}>;

function resolveUserLabel(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  fallback: string;
}): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  const phone = input.phone?.trim();
  if (phone) return phone;
  return input.fallback;
}

function buildPhoneCandidates(phone: string): string[] {
  const candidates = new Set<string>();
  const raw = phone.trim();
  if (raw) {
    candidates.add(raw);
  }

  const normalized = normalizeRussianPhone(phone);
  if (!normalized) {
    return Array.from(candidates);
  }

  const localNumber = normalized.slice(2);
  candidates.add(normalized);
  candidates.add(`+8${localNumber}`);
  candidates.add(`8${localNumber}`);
  candidates.add(`7${localNumber}`);
  candidates.add(`+7${localNumber}`);

  return Array.from(candidates);
}

/**
 * STUDIO-INVITE-EMAIL-01 — получатель приглашения, выписанного на ПОЧТУ:
 * владелец подтверждённого адреса (инв. #41), либо — как у телефона —
 * администратор той же студии со своим же адресом в профиле.
 */
async function resolveInviteRecipientUserIdByEmail(
  email: string,
  studioId: string,
): Promise<string | null> {
  // Адрес приглашения — в нижнем регистре, а профиль мог сохранить его как
  // ввели («Anna@Mail.ru»): сравнение — без регистра, как в `resolveInviteAccess`.
  const owner = await prisma.userProfile.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, emailVerifiedAt: { not: null }, isDeleted: false },
    select: { id: true },
  });
  if (owner) return owner.id;
  // Заявок на один адрес может быть несколько (заявить может кто угодно,
  // инв. #41), поэтому ищется та, чей держатель администрирует эту студию.
  const claimants = await prisma.userProfile.findMany({
    where: { email: { equals: email, mode: "insensitive" }, emailVerifiedAt: null, isDeleted: false },
    select: { id: true },
    take: 20,
  });
  for (const claimant of claimants) {
    const administered = await listAdministeredStudioIds(claimant.id);
    if (administered.includes(studioId)) return claimant.id;
  }
  return null;
}

async function resolveInviteRecipientUserIdFor(invite: {
  phone: string | null;
  email: string | null;
  studio: { id: string };
}): Promise<string | null> {
  const email = normalizeInviteEmail(invite.email);
  if (email) return resolveInviteRecipientUserIdByEmail(email, invite.studio.id);
  if (invite.phone) return resolveInviteRecipientUserId(invite.phone, invite.studio.id);
  return null;
}

async function resolveInviteRecipientUserId(
  phone: string,
  studioId: string,
): Promise<string | null> {
  const phoneCandidates = buildPhoneCandidates(phone);
  if (phoneCandidates.length === 0) return null;
  // PHONE-CLAIM-01: уведомление об инвайте — только ДОКАЗАННОМУ владельцу
  // номера. Кабинетная заявка (phoneVerifiedAt = null) уведомление не получает:
  // это была бы утечка факта приглашения заявителю чужого номера.
  const invitedUser = await prisma.userProfile.findFirst({
    where: { phone: { in: phoneCandidates }, phoneVerifiedAt: { not: null } },
    select: { id: true },
  });
  if (invitedUser) return invitedUser.id;

  // FIX-STUDIO-SELF-INVITE: второй грант — администратор ТОЙ ЖЕ студии, чей
  // собственный номер совпал. Утечки нет по построению: он и выписал это
  // приглашение. Без ветки самоприглашение владельца молчало — подтверждённых
  // номеров в проде нет ни у кого (SMS-шлюз не подключён), см.
  // `lib/invites/access.ts`.
  const claimant = await prisma.userProfile.findFirst({
    where: { phone: { in: phoneCandidates }, phoneVerifiedAt: null },
    select: { id: true },
  });
  if (!claimant) return null;
  const administered = await listAdministeredStudioIds(claimant.id);
  return administered.includes(studioId) ? claimant.id : null;
}

async function resolveInviteUserLabel(invite: InviteWithRelations): Promise<string> {
  const email = normalizeInviteEmail(invite.email);
  if (email) {
    // Имя — только от владельца подтверждённого адреса (зеркало телефона ниже).
    const owner = await prisma.userProfile.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, emailVerifiedAt: { not: null } },
      select: { displayName: true, firstName: true, lastName: true },
    });
    return resolveUserLabel({
      displayName: owner?.displayName ?? null,
      firstName: owner?.firstName ?? null,
      lastName: owner?.lastName ?? null,
      phone: null,
      fallback: "Мастер",
    });
  }
  const phoneCandidates = buildPhoneCandidates(invite.phone ?? "");
  // PHONE-CLAIM-01: имя в тексте уведомления — тоже только от владельца, иначе
  // студия увидела бы имя заявителя чужого номера.
  const profile = await prisma.userProfile.findFirst({
    where: { phone: { in: phoneCandidates }, phoneVerifiedAt: { not: null } },
    select: { displayName: true, firstName: true, lastName: true, phone: true },
  });
  return resolveUserLabel({
    displayName: profile?.displayName ?? null,
    firstName: profile?.firstName ?? null,
    lastName: profile?.lastName ?? null,
    phone: profile?.phone ?? invite.phone,
    fallback: "Мастер",
  });
}

function resolveStudioOwnerUserId(invite: { studio: { ownerUserId: string | null; provider: { ownerUserId: string | null } } }): string | null {
  return invite.studio.ownerUserId ?? invite.studio.provider.ownerUserId ?? null;
}

function buildTelegramText(title: string, body: string): string {
  return `${title}\n${body}`;
}

export async function loadInviteWithRelations(inviteId: string): Promise<InviteWithRelations | null> {
  return prisma.studioInvite.findUnique({
    where: { id: inviteId },
    include: inviteInclude,
  });
}

export async function loadScheduleRequestWithRelations(
  requestId: string
): Promise<ScheduleRequestWithRelations | null> {
  return prisma.scheduleChangeRequest.findUnique({
    where: { id: requestId },
    include: scheduleRequestInclude,
  });
}

/**
 * STUDIO-INVITE-EMAIL-01 — письмо на адрес приглашения.
 *
 * Внутреннее уведомление доходит только до аккаунта, а приглашают часто того,
 * у кого аккаунта ещё нет. Письмо уходит на адрес ПРИГЛАШЕНИЯ, а не на адрес
 * аккаунта: ПДн третьего лица здесь нет (адрес вписала студия, письмо идёт на
 * него же), а принять приглашение сможет только тот, кто войдёт с этим адресом
 * — вход по коду из письма и есть подтверждение владения.
 */
async function sendStudioInviteEmail(invite: InviteWithRelations): Promise<void> {
  const email = normalizeInviteEmail(invite.email);
  if (!email || !isEmailConfigured()) return;
  const studioName = invite.studio.provider.name || "Студия";
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://masterryadom.ru";
  const title = "Вас пригласили в студию";
  const body = `Студия ${studioName} приглашает вас в команду мастеров на МастерРядом. Войдите с этой почтой — приглашение будет в уведомлениях.`;
  const ctaUrl = `${baseUrl}/login?next=${encodeURIComponent("/notifications")}`;
  try {
    await sendEmail({
      to: email,
      subject: `${title}: ${studioName}`,
      html: buildNotificationEmailHtml({ title, body, ctaUrl, ctaLabel: "Открыть приглашение" }),
      text: buildNotificationEmailText({ title, body, ctaUrl }),
    });
  } catch (error) {
    logError("studio invite email failed", {
      inviteId: invite.id,
      to: maskEmail(email),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function notifyStudioInviteReceived(invite: InviteWithRelations): Promise<void> {
  await sendStudioInviteEmail(invite);
  const invitedUserId = await resolveInviteRecipientUserIdFor(invite);
  if (!invitedUserId) return;

  const studioName = invite.studio.provider.name || "Студия";
  const inviterLabel = resolveUserLabel({
    displayName: invite.invitedBy?.displayName ?? null,
    firstName: invite.invitedBy?.firstName ?? null,
    lastName: invite.invitedBy?.lastName ?? null,
    phone: invite.invitedBy?.phone ?? null,
    fallback: "Администратор",
  });

  const title = "Приглашение в студию";
  const body = `Вас пригласили в студию ${studioName}. Приглашение отправил(а) ${inviterLabel}.`;

  await deliverNotification({
    userId: invitedUserId,
    type: NotificationType.STUDIO_INVITE_RECEIVED,
    title,
    body,
    payloadJson: {
      inviteId: invite.id,
      studioId: invite.studio.id,
      studioName,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyStudioInviteAccepted(invite: InviteWithRelations): Promise<void> {
  const ownerUserId = resolveStudioOwnerUserId(invite);
  if (!ownerUserId) return;

  const studioName = invite.studio.provider.name || "Студия";
  const masterLabel = await resolveInviteUserLabel(invite);

  const title = "Мастер принял приглашение";
  const body = `Мастер ${masterLabel} принял приглашение в студию ${studioName}.`;

  await deliverNotification({
    userId: ownerUserId,
    type: NotificationType.STUDIO_INVITE_ACCEPTED,
    title,
    body,
    payloadJson: {
      inviteId: invite.id,
      studioId: invite.studio.id,
      studioName,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyStudioInviteRejected(invite: InviteWithRelations): Promise<void> {
  const ownerUserId = resolveStudioOwnerUserId(invite);
  if (!ownerUserId) return;

  const studioName = invite.studio.provider.name || "Студия";
  const masterLabel = await resolveInviteUserLabel(invite);

  const title = "Мастер отклонил приглашение";
  const body = `Мастер ${masterLabel} отклонил приглашение в студию ${studioName}.`;

  await deliverNotification({
    userId: ownerUserId,
    type: NotificationType.STUDIO_INVITE_REJECTED,
    title,
    body,
    payloadJson: {
      inviteId: invite.id,
      studioId: invite.studio.id,
      studioName,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyStudioInviteRevoked(invite: InviteWithRelations): Promise<void> {
  const invitedUserId = await resolveInviteRecipientUserIdFor(invite);
  if (!invitedUserId) return;

  const studioName = invite.studio.provider.name || "Студия";
  const title = "Приглашение отозвано";
  const body = `Студия ${studioName} отозвала приглашение.`;

  const event: NotificationEvent = {
    id: `studio-invite-revoked:${invite.id}:${Date.now()}`,
    type: "STUDIO_INVITE_REVOKED",
    title,
    body,
    payloadJson: {
      inviteId: invite.id,
      studioId: invite.studio.id,
      studioName,
    },
    createdAt: new Date().toISOString(),
  };

  publishRealtime(invitedUserId, event);
}

export async function notifyStudioMemberLeft(input: {
  studioOwnerUserId: string;
  masterName: string;
  studioName: string;
}): Promise<void> {
  const title = "Мастер вышел из студии";
  const body = `Мастер ${input.masterName} вышел из студии ${input.studioName}.`;

  await deliverNotification({
    userId: input.studioOwnerUserId,
    type: NotificationType.STUDIO_MEMBER_LEFT,
    title,
    body,
    payloadJson: {
      studioName: input.studioName,
      masterName: input.masterName,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyScheduleRequestSubmitted(
  request: ScheduleRequestWithRelations
): Promise<void> {
  const ownerUserId =
    request.studio?.ownerUserId ?? request.studio?.provider.ownerUserId ?? null;
  if (!ownerUserId) return;

  const studioName = request.studio?.provider.name ?? "Студия";
  const masterName = request.provider.name || "Мастер";

  const title = "Мастер просит изменить график";
  const body = `Мастер ${masterName} просит изменить свой график в студии ${studioName}.`;

  await deliverNotification({
    userId: ownerUserId,
    type: NotificationType.STUDIO_SCHEDULE_REQUEST,
    title,
    body,
    payloadJson: {
      requestId: request.id,
      studioId: request.studioId,
      studioName,
      masterId: request.providerId,
      masterName,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyScheduleRequestApproved(
  request: ScheduleRequestWithRelations
): Promise<void> {
  const masterUserId =
    request.provider.ownerUserId ?? request.provider.masterProfile?.userId ?? null;
  if (!masterUserId) return;

  const studioName = request.studio?.provider.name ?? "Студия";
  const title = "Расписание одобрено";
  const body = `Студия ${studioName} одобрила изменения в расписании.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.STUDIO_SCHEDULE_APPROVED,
    title,
    body,
    payloadJson: {
      requestId: request.id,
      studioId: request.studioId,
      studioName,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyMasterScheduleUpdatedByStudio(input: {
  providerId: string;
  studioProviderId: string;
}): Promise<void> {
  const [provider, studio] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: input.providerId },
      select: {
        id: true,
        ownerUserId: true,
        masterProfile: { select: { userId: true } },
      },
    }),
    prisma.studio.findUnique({
      where: { providerId: input.studioProviderId },
      select: {
        id: true,
        provider: { select: { name: true } },
      },
    }),
  ]);

  if (!provider || !studio) return;

  const masterUserId = provider.ownerUserId ?? provider.masterProfile?.userId ?? null;
  if (!masterUserId) return;

  const studioName = studio.provider.name ?? "Студия";
  const title = "Студия изменила ваш график";
  const body = `Студия ${studioName} обновила ваш рабочий график.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.STUDIO_SCHEDULE_APPROVED,
    title,
    body,
    payloadJson: {
      studioId: studio.id,
      studioProviderId: input.studioProviderId,
      providerId: input.providerId,
      source: "STUDIO_DIRECT_APPLY",
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyScheduleRequestRejected(
  request: ScheduleRequestWithRelations
): Promise<void> {
  const masterUserId =
    request.provider.ownerUserId ?? request.provider.masterProfile?.userId ?? null;
  if (!masterUserId) return;

  const studioName = request.studio?.provider.name ?? "Студия";
  const title = "Расписание отклонено";
  const body = `Студия ${studioName} отклонила изменения в расписании.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.STUDIO_SCHEDULE_REJECTED,
    title,
    body,
    payloadJson: {
      requestId: request.id,
      studioId: request.studioId,
      studioName,
      comment: request.comment ?? null,
    },
    pushUrl: "/notifications",
    telegramText: buildTelegramText(title, body),
  });
}

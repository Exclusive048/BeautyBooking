import { Prisma, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

async function resolveInviteRecipientUserId(phone: string): Promise<string | null> {
  const phoneCandidates = buildPhoneCandidates(phone);
  if (phoneCandidates.length === 0) return null;
  const invitedUser = await prisma.userProfile.findFirst({
    where: { phone: { in: phoneCandidates } },
    select: { id: true },
  });
  return invitedUser?.id ?? null;
}

async function resolveInviteUserLabel(invite: InviteWithRelations): Promise<string> {
  const phoneCandidates = buildPhoneCandidates(invite.phone);
  const profile = await prisma.userProfile.findFirst({
    where: { phone: { in: phoneCandidates } },
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

export async function notifyStudioInviteReceived(invite: InviteWithRelations): Promise<void> {
  const invitedUserId = await resolveInviteRecipientUserId(invite.phone);
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
  const body = `Вас пригласили в студию ${studioName}. Пригласил(а): ${inviterLabel}.`;

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
  const invitedUserId = await resolveInviteRecipientUserId(invite.phone);
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

  const title = "Запрос на изменение расписания";
  const body = `Мастер ${masterName} отправил запрос на изменение расписания студии ${studioName}.`;

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

  const studioName = studio.provider.name ?? "РЎС‚СѓРґРёСЏ";
  const title = "Р“СЂР°С„РёРє РѕР±РЅРѕРІР»РµРЅ СЃС‚СѓРґРёРµР№";
  const body = `РЎС‚СѓРґРёСЏ ${studioName} РѕР±РЅРѕРІРёР»Р° РІР°С€ СЂР°Р±РѕС‡РёР№ РіСЂР°С„РёРє.`;

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

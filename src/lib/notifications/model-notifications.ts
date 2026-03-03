import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications/delivery";

const applicationInclude = {
  offer: {
    select: {
      id: true,
      dateLocal: true,
      timeRangeStartLocal: true,
      timeRangeEndLocal: true,
      masterId: true,
      master: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          masterProfile: { select: { userId: true } },
        },
      },
    },
  },
} as const;

export type ApplicationWithRelations = Prisma.ModelApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

function resolveMasterUserId(application: ApplicationWithRelations): string | null {
  return (
    application.offer.master.ownerUserId ??
    application.offer.master.masterProfile?.userId ??
    null
  );
}

function buildTelegramText(title: string, body: string): string {
  return `${title}\n${body}`;
}

export async function loadApplicationWithRelations(
  applicationId: string
): Promise<ApplicationWithRelations | null> {
  return prisma.modelApplication.findUnique({
    where: { id: applicationId },
    include: applicationInclude,
  });
}

export async function notifyModelApplicationReceived(
  application: ApplicationWithRelations
): Promise<void> {
  const masterUserId = resolveMasterUserId(application);
  if (!masterUserId) return;

  const title = "Новая заявка модели";
  const body = `Новая заявка на оффер ${application.offer.dateLocal} ${application.offer.timeRangeStartLocal}-${application.offer.timeRangeEndLocal}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.MODEL_APPLICATION_RECEIVED,
    title,
    body,
    payloadJson: {
      offerId: application.offer.id,
      applicationId: application.id,
    },
    pushUrl: `/cabinet/master/model-offers?offerId=${application.offer.id}`,
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyModelTimeProposed(
  application: ApplicationWithRelations
): Promise<void> {
  const clientUserId = application.clientUserId;
  if (!clientUserId) return;

  const timeLabel = application.proposedTimeLocal ?? application.offer.timeRangeStartLocal;
  const title = "Предложено время";
  const body = `Мастер предложил время ${application.offer.dateLocal} ${timeLabel}. Подтвердите запись.`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.MODEL_TIME_PROPOSED,
    title,
    body,
    payloadJson: {
      offerId: application.offer.id,
      applicationId: application.id,
      proposedTimeLocal: application.proposedTimeLocal,
    },
    pushUrl: `/cabinet/model-applications?applicationId=${application.id}`,
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyModelApplicationRejected(
  application: ApplicationWithRelations
): Promise<void> {
  const clientUserId = application.clientUserId;
  if (!clientUserId) return;

  const title = "Заявка отклонена";
  const body = "Мастер отклонил вашу заявку на модельное предложение.";

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.MODEL_APPLICATION_REJECTED,
    title,
    body,
    payloadJson: {
      offerId: application.offer.id,
      applicationId: application.id,
    },
    pushUrl: `/cabinet/model-applications?applicationId=${application.id}`,
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyModelTimeConfirmed(
  application: ApplicationWithRelations
): Promise<void> {
  const masterUserId = resolveMasterUserId(application);
  if (!masterUserId) return;

  const timeLabel = application.proposedTimeLocal ?? application.offer.timeRangeStartLocal;
  const title = "Время подтверждено";
  const body = `Модель подтвердила время ${application.offer.dateLocal} ${timeLabel}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.MODEL_TIME_CONFIRMED,
    title,
    body,
    payloadJson: {
      offerId: application.offer.id,
      applicationId: application.id,
      bookingId: application.bookingId ?? null,
    },
    pushUrl: `/cabinet/master/model-offers?offerId=${application.offer.id}`,
    telegramText: buildTelegramText(title, body),
  });
}

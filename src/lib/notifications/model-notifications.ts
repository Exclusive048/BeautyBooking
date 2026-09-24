import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications/delivery";
import { formatBookingWhenLabel } from "@/lib/notifications/format-booking-when";
import { dateFromLocalDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { formatZoneLabel } from "@/lib/ui/zone-label";

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
          timezone: true,
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

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS · rule 17 — время модель-оффера хранится
 * строками в поясе мастера (`dateLocal` + `HH:MM`), и уведомления печатали их
 * сырыми («2026-09-30 13:00»), без метки зоны. Теперь — salon-tz с меткой, как
 * во всех уведомлениях о записи (`formatBookingWhenLabel`).
 */
function parseLocalTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function offerWhenLabel(dateLocal: string, timeLocal: string, timeZone: string): string {
  const time = parseLocalTime(timeLocal);
  if (!isDateKey(dateLocal) || !time) return `${dateLocal} ${timeLocal}`;
  const at = dateFromLocalDateKey(dateLocal, timeZone, time.hour, time.minute);
  return formatBookingWhenLabel(at, timeZone) ?? `${dateLocal} ${timeLocal}`;
}

function offerRangeLabel(dateLocal: string, startLocal: string, endLocal: string, timeZone: string): string {
  const start = parseLocalTime(startLocal);
  if (!isDateKey(dateLocal) || !start) return `${dateLocal} ${startLocal}–${endLocal}`;
  const at = dateFromLocalDateKey(dateLocal, timeZone, start.hour, start.minute);
  const day = at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone });
  const zone = formatZoneLabel({ iso: at.toISOString(), timeZone });
  return `${day}, ${startLocal}–${endLocal}${zone ? ` ${zone}` : ""}`;
}

function offerTimeZone(application: ApplicationWithRelations): string {
  // `Provider.timezone` не nullable (`@default` в схеме).
  return application.offer.master.timezone;
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
  const range = offerRangeLabel(
    application.offer.dateLocal,
    application.offer.timeRangeStartLocal,
    application.offer.timeRangeEndLocal,
    offerTimeZone(application),
  );
  const body = `Новая заявка на предложение ${range}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.MODEL_APPLICATION_RECEIVED,
    title,
    body,
    payloadJson: {
      offerId: application.offer.id,
      applicationId: application.id,
    },
    pushUrl: `/cabinet/master/model-offers?filterOffer=${application.offer.id}`,
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyModelTimeProposed(
  application: ApplicationWithRelations
): Promise<void> {
  const clientUserId = application.clientUserId;
  if (!clientUserId) return;

  const timeLabel = application.proposedTimeLocal ?? application.offer.timeRangeStartLocal;
  const when = offerWhenLabel(application.offer.dateLocal, timeLabel, offerTimeZone(application));
  const title = "Предложено время";
  const body = `Мастер предложил время ${when}. Подтвердите запись.`;

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
  application: ApplicationWithRelations,
  reason?: string | null
): Promise<void> {
  const clientUserId = application.clientUserId;
  if (!clientUserId) return;

  const title = "Заявка отклонена";
  const trimmedReason = reason?.trim();
  const body = trimmedReason
    ? `Мастер отклонил вашу заявку. Причина: ${trimmedReason}.`
    : "Мастер отклонил вашу заявку на модельное предложение.";

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.MODEL_APPLICATION_REJECTED,
    title,
    body,
    payloadJson: {
      offerId: application.offer.id,
      applicationId: application.id,
      reason: trimmedReason ?? null,
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
  const when = offerWhenLabel(application.offer.dateLocal, timeLabel, offerTimeZone(application));
  const title = "Время подтверждено";
  const body = `Модель подтвердила время ${when}.`;

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
    pushUrl: `/cabinet/master/model-offers?filterOffer=${application.offer.id}`,
    telegramText: buildTelegramText(title, body),
  });
}

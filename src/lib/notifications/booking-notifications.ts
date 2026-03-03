import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications/delivery";

const bookingInclude = {
  clientUser: { select: { id: true } },
  provider: {
    select: {
      id: true,
      type: true,
      name: true,
      timezone: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  },
  masterProvider: {
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  },
  service: { select: { id: true, name: true, title: true } },
} as const;

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

function formatDateLabel(date: Date | null, timezone: string): string | null {
  if (!date) return null;
  const label = date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return label;
}

function resolveServiceLabel(service: { name: string; title: string | null }): string {
  return service.title?.trim() || service.name;
}

function resolveClientUserId(booking: BookingWithRelations): string | null {
  return booking.clientUser?.id ?? booking.clientUserId ?? null;
}

function resolveMasterUserId(booking: BookingWithRelations): string | null {
  return (
    booking.masterProvider?.ownerUserId ??
    booking.masterProvider?.masterProfile?.userId ??
    booking.provider.ownerUserId ??
    booking.provider.masterProfile?.userId ??
    null
  );
}

function buildBookingPayload(booking: BookingWithRelations): Prisma.InputJsonValue {
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    providerId: booking.provider.id,
    providerName: booking.provider.name,
    providerType: booking.provider.type,
    masterProviderId: booking.masterProvider?.id ?? null,
    masterName: booking.masterProvider?.name ?? null,
    serviceId: booking.service.id,
    serviceName: resolveServiceLabel(booking.service),
    startAtUtc: booking.startAtUtc ? booking.startAtUtc.toISOString() : null,
    clientName: booking.clientName,
    clientUserId: booking.clientUserId ?? null,
    studioId: booking.studioId ?? null,
  };
}

function bookingPushUrl(bookingId: string, audience: "CLIENT" | "MASTER"): string {
  if (audience === "MASTER") {
    return `/cabinet/master/dashboard?bookingId=${bookingId}`;
  }
  return `/cabinet/bookings?bookingId=${bookingId}`;
}

function bookingWhenLabel(booking: BookingWithRelations): string | null {
  return formatDateLabel(booking.startAtUtc ?? null, booking.provider.timezone);
}

function bookingRequestedLabel(booking: BookingWithRelations): string | null {
  return formatDateLabel(
    booking.proposedStartAt ?? booking.startAtUtc ?? null,
    booking.provider.timezone
  );
}

function buildTelegramText(title: string, body: string): string {
  return `${title}\n${body}`;
}

export async function loadBookingWithRelations(bookingId: string): Promise<BookingWithRelations | null> {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });
}

export async function notifyBookingCreated(booking: BookingWithRelations): Promise<void> {
  const masterUserId = resolveMasterUserId(booking);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Новая запись";
  const body = whenLabel
    ? `К вам записался клиент ${booking.clientName} на ${serviceName} ${whenLabel}`
    : `К вам записался клиент ${booking.clientName} на ${serviceName}`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.BOOKING_CREATED,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "MASTER"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyBookingConfirmed(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Запись подтверждена";
  const body = whenLabel
    ? `Ваша запись подтверждена: ${serviceName} ${whenLabel}`
    : `Ваша запись подтверждена: ${serviceName}`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_CONFIRMED,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyBookingRejected(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Запись отклонена";
  const body = whenLabel
    ? `Запись на ${serviceName} ${whenLabel} была отклонена.`
    : `Запись на ${serviceName} была отклонена.`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_REJECTED,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyCancelledByMaster(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Запись отменена мастером";
  const body = whenLabel
    ? `Мастер отменил запись на ${serviceName} ${whenLabel}.`
    : `Мастер отменил запись на ${serviceName}.`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_CANCELLED_BY_MASTER,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyCancelledByClient(booking: BookingWithRelations): Promise<void> {
  const masterUserId = resolveMasterUserId(booking);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Клиент отменил запись";
  const body = whenLabel
    ? `Клиент ${booking.clientName} отменил запись на ${serviceName} ${whenLabel}.`
    : `Клиент ${booking.clientName} отменил запись на ${serviceName}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.BOOKING_CANCELLED_BY_CLIENT,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "MASTER"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyBookingRescheduled(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingRequestedLabel(booking) ?? bookingWhenLabel(booking);
  const title = "Запись перенесена";
  const body = whenLabel
    ? `Ваша запись перенесена: ${serviceName} ${whenLabel}`
    : `Ваша запись перенесена: ${serviceName}`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_RESCHEDULED,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyRescheduleRequested(booking: BookingWithRelations): Promise<void> {
  const masterUserId = resolveMasterUserId(booking);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingRequestedLabel(booking) ?? bookingWhenLabel(booking);
  const title = "Клиент просит перенос";
  const body = whenLabel
    ? `Клиент ${booking.clientName} просит перенести запись на ${serviceName} ${whenLabel}.`
    : `Клиент ${booking.clientName} просит перенести запись на ${serviceName}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.BOOKING_RESCHEDULE_REQUESTED,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "MASTER"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyBookingReminder24h(booking: BookingWithRelations): Promise<void> {
  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);

  const payload = buildBookingPayload(booking);

  const clientUserId = resolveClientUserId(booking);
  if (clientUserId) {
    const title = "Напоминание за 24 часа";
    const body = whenLabel
      ? `Ваша запись на ${serviceName} ${whenLabel}`
      : `Ваша запись на ${serviceName}`;
    await deliverNotification({
      userId: clientUserId,
      type: NotificationType.BOOKING_REMINDER_24H,
      title,
      body,
      payloadJson: payload,
      bookingId: booking.id,
      pushUrl: bookingPushUrl(booking.id, "CLIENT"),
      telegramText: buildTelegramText(title, body),
    });
  }

  const masterUserId = resolveMasterUserId(booking);
  if (masterUserId) {
    const title = "Напоминание о записи за 24 часа";
    const body = whenLabel
      ? `Клиент ${booking.clientName} на ${serviceName} ${whenLabel}`
      : `Клиент ${booking.clientName} на ${serviceName}`;
    await deliverNotification({
      userId: masterUserId,
      type: NotificationType.BOOKING_REMINDER_24H,
      title,
      body,
      payloadJson: payload,
      bookingId: booking.id,
      pushUrl: bookingPushUrl(booking.id, "MASTER"),
      telegramText: buildTelegramText(title, body),
    });
  }
}

export async function notifyBookingReminder2h(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Напоминание за 2 часа";
  const body = whenLabel
    ? `Ваша запись на ${serviceName} ${whenLabel}`
    : `Ваша запись на ${serviceName}`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_REMINDER_2H,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyBookingCompletedReview(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const title = "Оставьте отзыв";
  const body = `Поделитесь впечатлениями о записи на ${serviceName}.`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_COMPLETED_REVIEW,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyBookingNoShow(booking: BookingWithRelations): Promise<void> {
  const masterUserId = resolveMasterUserId(booking);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Клиент не пришёл";
  const body = whenLabel
    ? `Клиент ${booking.clientName} не пришёл на ${serviceName} ${whenLabel}.`
    : `Клиент ${booking.clientName} не пришёл на ${serviceName}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.BOOKING_NO_SHOW,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "MASTER"),
    telegramText: buildTelegramText(title, body),
  });
}

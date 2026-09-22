import { MembershipStatus, NotificationType, Prisma, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications/delivery";
import { toLocalDateKey } from "@/lib/schedule/timezone";
// HARDENING-09 #13: shared salon-tz "when" formatter — the Telegram reminder
// path now mirrors this exact format via the same helper (single source).
import { formatBookingWhenLabel as formatDateLabel } from "@/lib/notifications/format-booking-when";

const bookingInclude = {
  clientUser: { select: { id: true } },
  provider: {
    select: {
      id: true,
      type: true,
      studioId: true,
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

async function resolveStudioIdForBooking(booking: BookingWithRelations): Promise<string | null> {
  if (booking.studioId) return booking.studioId;

  if (booking.provider.type === ProviderType.STUDIO) {
    const studio = await prisma.studio.findUnique({
      where: { providerId: booking.provider.id },
      select: { id: true },
    });
    return studio?.id ?? null;
  }

  if (!booking.provider.studioId) return null;
  const studio = await prisma.studio.findUnique({
    where: { providerId: booking.provider.studioId },
    select: { id: true },
  });
  return studio?.id ?? null;
}

async function resolveProviderRecipientUserIds(booking: BookingWithRelations): Promise<string[]> {
  const recipients = new Set<string>();

  const masterUserId = resolveMasterUserId(booking);
  if (masterUserId) recipients.add(masterUserId);

  if (booking.provider.ownerUserId) {
    recipients.add(booking.provider.ownerUserId);
  }

  const studioId = await resolveStudioIdForBooking(booking);
  if (studioId) {
    const admins = await prisma.studioMembership.findMany({
      where: {
        studioId,
        status: MembershipStatus.ACTIVE,
        roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
      },
      select: { userId: true },
    });
    admins.forEach((item) => recipients.add(item.userId));
  }

  return Array.from(recipients);
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
    // BOOKING-STUDIO-RESCHEDULE-PARITY-01: salon tz so the in-app studio
    // deep-link (`resolveNotificationOpenHref`) can compute the salon-local
    // `?date=` and land the admin on the correct calendar day.
    providerTimezone: booking.provider.timezone,
    clientName: booking.clientName,
    clientUserId: booking.clientUserId ?? null,
    studioId: booking.studioId ?? null,
  };
}

function bookingPushUrl(bookingId: string, audience: "CLIENT" | "MASTER"): string {
  // FIX-R2-06-B: canonical `?focus=<id>` deep-link param (shared focus reader).
  if (audience === "MASTER") {
    return `/cabinet/master/dashboard?focus=${bookingId}`;
  }
  return `/cabinet/bookings?focus=${bookingId}`;
}

/** REVIEW-PROMPT-01 — «Мои записи» с открытой формой отзыва по этой записи. */
export function reviewPromptUrl(bookingId: string): string {
  const id = encodeURIComponent(bookingId);
  return `/cabinet/bookings?focus=${id}&review=${id}`;
}

// BOOKING-STUDIO-RESCHEDULE-PARITY-01: studio push deep-link lands on the exact
// booking — `?date=<salon-day>` (salon tz) loads the correct day, `?focus=<id>`
// scrolls + highlights the cell (mirrors the in-app openHref).
function studioCalendarPushUrl(booking: BookingWithRelations): string {
  const params = new URLSearchParams();
  if (booking.startAtUtc) {
    params.set("view", "day");
    params.set("date", toLocalDateKey(booking.startAtUtc, booking.provider.timezone));
  }
  params.set("focus", booking.id);
  return `/cabinet/studio/calendar?${params.toString()}`;
}

function providerNotificationPushUrl(booking: BookingWithRelations, recipientUserId: string): string {
  const assignedMasterUserId =
    booking.masterProvider?.ownerUserId ?? booking.masterProvider?.masterProfile?.userId ?? null;
  if (assignedMasterUserId && recipientUserId === assignedMasterUserId) {
    return bookingPushUrl(booking.id, "MASTER");
  }
  if (booking.provider.type === ProviderType.STUDIO || booking.studioId) {
    return studioCalendarPushUrl(booking);
  }
  const masterUserId = resolveMasterUserId(booking);
  if (masterUserId && recipientUserId === masterUserId) {
    return bookingPushUrl(booking.id, "MASTER");
  }
  return "/notifications";
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

/**
 * PERF-26 — тот же набор связей для НАБОРА броней.
 *
 * Живёт рядом с поштучной формой и делит с ней `bookingInclude` намеренно:
 * форма снапшота — вход всех `notify*`-функций ниже, и разойтись двум
 * загрузчикам нельзя (то же решение, что у `resolveServiceDuration` /
 * `resolveServiceDurations`).
 *
 * Возвращает Map по id; отсутствие ключа вызывающий трактует так же, как
 * `null` от поштучной версии.
 */
export async function loadBookingsWithRelations(
  bookingIds: string[]
): Promise<Map<string, BookingWithRelations>> {
  if (bookingIds.length === 0) return new Map();
  const rows = await prisma.booking.findMany({
    where: { id: { in: bookingIds } },
    include: bookingInclude,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Новая запись — стороне провайдера.
 *
 * STUDIO-NEW-BOOKING-NOTIFY-01: адресаты те же, что у запроса переноса
 * (`resolveProviderRecipientUserIds`): мастер, владелец кабинета и активные
 * OWNER/ADMIN студии. Раньше уведомление получал только назначенный мастер —
 * администратор студии, который ведёт журнал и подтверждает записи, о новой
 * записи со страницы студии не узнавал. Ссылка — по каналу получателя
 * (журнал студии у администратора, кабинет у мастера).
 */
export async function notifyBookingCreated(
  booking: BookingWithRelations,
  /** Кто создал запись сам (администратор студии в кабинете) — ему не шлём. */
  options: { excludeUserId?: string } = {},
): Promise<void> {
  const recipientIds = await resolveProviderRecipientUserIds(booking);
  const clientUserId = resolveClientUserId(booking);
  const recipients = recipientIds.filter(
    (userId) => userId !== clientUserId && userId !== options.excludeUserId,
  );
  if (recipients.length === 0) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "У вас новая запись";
  const body = whenLabel
    ? `${booking.clientName} записался на ${serviceName} ${whenLabel}`
    : `${booking.clientName} записался на ${serviceName}`;

  const payload = buildBookingPayload(booking);
  await Promise.all(
    recipients.map((userId) =>
      deliverNotification({
        userId,
        type: NotificationType.BOOKING_CREATED,
        title,
        body,
        payloadJson: payload,
        bookingId: booking.id,
        pushUrl: providerNotificationPushUrl(booking, userId),
        telegramText: buildTelegramText(title, body),
      })
    )
  );
}

export async function notifyBookingConfirmed(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Запись подтверждена";
  const body = whenLabel
    ? `${serviceName} — ${whenLabel}`
    : `${serviceName}`;

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
    ? `Запись на ${serviceName} ${whenLabel} не подтвердили. Выберите другое окошко.`
    : `Запись на ${serviceName} не подтвердили. Выберите другое окошко.`;

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
  const recipientIds = await resolveProviderRecipientUserIds(booking);
  if (recipientIds.length === 0) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Запись отменена клиентом";
  const body = whenLabel
    ? `${booking.clientName} отменил запись на ${serviceName} ${whenLabel}.`
    : `${booking.clientName} отменил запись на ${serviceName}.`;

  const payload = buildBookingPayload(booking);
  await Promise.all(
    recipientIds.map((userId) =>
      deliverNotification({
        userId,
        type: NotificationType.BOOKING_CANCELLED_BY_CLIENT,
        title,
        body,
        payloadJson: payload,
        bookingId: booking.id,
        pushUrl: providerNotificationPushUrl(booking, userId),
        telegramText: buildTelegramText(title, body),
      })
    )
  );
}

export async function notifyBookingRescheduled(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingRequestedLabel(booking) ?? bookingWhenLabel(booking);
  // RESCHEDULE-CLIENT-APPROVAL: перенос, начатый мастером, — ПРЕДЛОЖЕНИЕ
  // (инв. #32: вступает по согласию обеих сторон). Прежний текст «Запись
  // перенесена» сообщал о свершившемся факте, и клиент не знал, что от него
  // ждут ответа. Уже применённый перенос (студийный move и т.п.) сохраняет
  // прежнюю формулировку.
  const isProposal =
    booking.status === "CHANGE_REQUESTED" && booking.actionRequiredBy === "CLIENT";
  const title = isProposal ? "Мастер предлагает перенести запись" : "Запись перенесена";
  const body = isProposal
    ? whenLabel
      ? `Мастер предлагает перенести ${serviceName} на ${whenLabel}. Подтвердите перенос или оставьте прежнее время в разделе «Мои записи».`
      : `Мастер предлагает перенести ${serviceName}. Подтвердите перенос или оставьте прежнее время в разделе «Мои записи».`
    : whenLabel
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

/**
 * STUDIO-MOVE-NOTIFY-01 — администратор студии перенёс запись (напрямую,
 * инв. #22). До этого перенос не уведомлял никого: клиент не знал о новом
 * времени, новый мастер — о новой записи, прежний — о том, что её забрали
 * (часть NOTIFY-STUDIO-ADMIN-BOOKING-ACTIONS).
 *   · клиенту — «Запись перенесена» с новым временем (`notifyBookingRescheduled`);
 *   · мастеру, у которого запись теперь стоит, — время и клиент;
 *   · прежнему мастеру, если мастер сменился, — что запись передана.
 */
export async function notifyStudioBookingMoved(
  booking: BookingWithRelations,
  move: { previousMasterProviderId: string | null; masterChanged: boolean; timeChanged: boolean },
): Promise<void> {
  if (move.timeChanged || move.masterChanged) {
    await notifyBookingRescheduled(booking);
  }

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const clientLabel = booking.clientName?.trim() || "Клиент";

  const currentMasterUserId = resolveMasterUserId(booking);
  if (currentMasterUserId) {
    const title = move.masterChanged ? "Новая запись от администратора" : "Запись перенесена";
    const body = whenLabel
      ? `${clientLabel} — ${serviceName}, ${whenLabel}.`
      : `${clientLabel} — ${serviceName}.`;
    await deliverNotification({
      userId: currentMasterUserId,
      type: NotificationType.BOOKING_RESCHEDULED,
      title,
      body,
      payloadJson: buildBookingPayload(booking),
      bookingId: booking.id,
      pushUrl: bookingPushUrl(booking.id, "MASTER"),
      telegramText: buildTelegramText(title, body),
    });
  }

  if (move.masterChanged && move.previousMasterProviderId) {
    const previous = await prisma.provider.findUnique({
      where: { id: move.previousMasterProviderId },
      select: { ownerUserId: true, masterProfile: { select: { userId: true } } },
    });
    const previousUserId = previous?.ownerUserId ?? previous?.masterProfile?.userId ?? null;
    if (previousUserId && previousUserId !== currentMasterUserId) {
      const title = "Запись передана другому мастеру";
      const body = `Администратор передал запись ${clientLabel} на ${serviceName} другому мастеру.`;
      await deliverNotification({
        userId: previousUserId,
        type: NotificationType.BOOKING_RESCHEDULED,
        title,
        body,
        payloadJson: buildBookingPayload(booking),
        bookingId: booking.id,
        pushUrl: "/cabinet/master/bookings",
        telegramText: buildTelegramText(title, body),
      });
    }
  }
}

/**
 * RESCHEDULE-CLIENT-APPROVAL: клиент ответил на предложенный мастером перенос.
 * `accepted` — время применено (`confirmBooking`), `declined` — прежнее время
 * сохранено (`declineClientRescheduleRequest`). Получатели — сторона
 * провайдера; типы `BOOKING_CONFIRMED` / `BOOKING_DECLINED` — центр отдаёт им
 * кабинетную ссылку по каналу получателя (`resolveNotificationOpenHref`).
 */
export async function notifyRescheduleAnswered(
  booking: BookingWithRelations,
  answer: "accepted" | "declined",
): Promise<void> {
  const recipientIds = await resolveProviderRecipientUserIds(booking);
  if (recipientIds.length === 0) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = answer === "accepted" ? "Клиент подтвердил перенос" : "Клиент оставил прежнее время";
  const body =
    answer === "accepted"
      ? whenLabel
        ? `${booking.clientName} подтвердил перенос: ${serviceName} ${whenLabel}.`
        : `${booking.clientName} подтвердил перенос: ${serviceName}.`
      : whenLabel
        ? `${booking.clientName} не принял перенос — ${serviceName} остаётся ${whenLabel}.`
        : `${booking.clientName} не принял перенос — ${serviceName} остаётся на прежнее время.`;

  const payload = buildBookingPayload(booking);
  await Promise.all(
    recipientIds.map((userId) =>
      deliverNotification({
        userId,
        type: answer === "accepted" ? NotificationType.BOOKING_CONFIRMED : NotificationType.BOOKING_DECLINED,
        title,
        body,
        payloadJson: payload,
        bookingId: booking.id,
        pushUrl: providerNotificationPushUrl(booking, userId),
        telegramText: buildTelegramText(title, body),
      })
    )
  );
}

/**
 * RESCHEDULE-CLIENT-APPROVAL: мастер не принял перенос, который просил клиент —
 * бронь осталась на прежнем времени. Раньше сюда шёл `notifyBookingRejected`
 * («Запись отклонена»), хотя запись никуда не делась.
 */
export async function notifyRescheduleDeclinedByMaster(booking: BookingWithRelations): Promise<void> {
  const clientUserId = resolveClientUserId(booking);
  if (!clientUserId) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);
  const title = "Мастер оставил прежнее время";
  const body = whenLabel
    ? `Перенос не согласован — ${serviceName} остаётся ${whenLabel}.`
    : `Перенос не согласован — ${serviceName} остаётся на прежнее время.`;

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.BOOKING_DECLINED,
    title,
    body,
    payloadJson: buildBookingPayload(booking),
    bookingId: booking.id,
    pushUrl: bookingPushUrl(booking.id, "CLIENT"),
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyRescheduleRequested(booking: BookingWithRelations): Promise<void> {
  const recipientIds = await resolveProviderRecipientUserIds(booking);
  if (recipientIds.length === 0) return;

  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingRequestedLabel(booking) ?? bookingWhenLabel(booking);
  const title = "Клиент просит перенос";
  const body = whenLabel
    ? `Клиент ${booking.clientName} просит перенести запись на ${serviceName} ${whenLabel}.`
    : `Клиент ${booking.clientName} просит перенести запись на ${serviceName}.`;

  const payload = buildBookingPayload(booking);
  await Promise.all(
    recipientIds.map((userId) =>
      deliverNotification({
        userId,
        type: NotificationType.BOOKING_RESCHEDULE_REQUESTED,
        title,
        body,
        payloadJson: payload,
        bookingId: booking.id,
        pushUrl: providerNotificationPushUrl(booking, userId),
        telegramText: buildTelegramText(title, body),
      })
    )
  );
}

export async function notifyBookingReminder24h(booking: BookingWithRelations): Promise<void> {
  const serviceName = resolveServiceLabel(booking.service);
  const whenLabel = bookingWhenLabel(booking);

  const payload = buildBookingPayload(booking);

  const clientUserId = resolveClientUserId(booking);
  if (clientUserId) {
    const title = "Напоминание о записи";
    const body = whenLabel
      ? `Завтра ${serviceName} в ${whenLabel}`
      : `Завтра запись на ${serviceName}`;
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
    const title = "Напоминание о записи";
    const body = whenLabel
      ? `Завтра в ${whenLabel} — ${booking.clientName} (${serviceName})`
      : `Завтра запись: ${booking.clientName} (${serviceName})`;
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
  const title = "Напоминание о записи";
  const body = whenLabel
    ? `Через 2 часа: ${serviceName} ${whenLabel}`
    : `Через 2 часа: ${serviceName}`;

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
    // REVIEW-PROMPT-01: `?review=` открывает форму отзыва сразу, `?focus=`
    // подсвечивает строку, если отзыв уже оставлен или окно закрылось.
    pushUrl: reviewPromptUrl(booking.id),
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

import {
  MembershipStatus,
  NotificationType,
  Prisma,
  ProviderType,
  StudioRole,
} from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { notificationsNotifier, type NotificationEvent } from "@/lib/notifications/notifier";

type DbClient = Prisma.TransactionClient | typeof prisma;

const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  payloadJson: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} as const;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: Prisma.InputJsonValue;
  bookingId?: string | null;
};

export type BookingNotificationSnapshot = {
  id: string;
  status: string;
  clientUserId: string | null;
  clientName: string;
  startAtUtc: Date | null;
  studioId: string | null;
  provider: {
    id: string;
    type: ProviderType;
    name: string;
    timezone: string;
    ownerUserId: string | null;
    masterProfile: { userId: string } | null;
  };
  masterProvider: {
    id: string;
    name: string;
    ownerUserId: string | null;
    masterProfile: { userId: string } | null;
  } | null;
  service: {
    id: string;
    name: string;
    title: string | null;
  };
};

export type BookingNotificationPayload = {
  bookingId: string;
  bookingStatus: string;
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  masterProviderId: string | null;
  masterName: string | null;
  serviceId: string;
  serviceName: string;
  startAtUtc: string | null;
  clientName: string;
  clientUserId: string | null;
  studioId: string | null;
};

export type BookingReminderKind = "REMINDER_24H" | "REMINDER_2H";

function toNotificationEvent(record: NotificationRecord): NotificationEvent {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    payloadJson: record.payloadJson,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function createNotification(
  input: CreateNotificationInput,
  db: DbClient = prisma
): Promise<NotificationRecord> {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      payloadJson: input.payloadJson,
      bookingId: input.bookingId ?? null,
    },
    select: notificationSelect,
  });
}

async function createNotifications(
  inputs: CreateNotificationInput[],
  db: DbClient = prisma
): Promise<NotificationRecord[]> {
  const results: NotificationRecord[] = [];
  for (const item of inputs) {
    results.push(await createNotification(item, db));
  }
  return results;
}

export function publishRealtime(userId: string, event: NotificationEvent) {
  void (async () => {
    const notifier = await notificationsNotifier;
    notifier.publish(userId, event);
  })();
}

export function publishNotifications(events: NotificationRecord[]): void {
  for (const event of events) {
    publishRealtime(event.userId, toNotificationEvent(event));
  }
}

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

function buildBookingPayload(snapshot: BookingNotificationSnapshot): BookingNotificationPayload {
  return {
    bookingId: snapshot.id,
    bookingStatus: snapshot.status,
    providerId: snapshot.provider.id,
    providerName: snapshot.provider.name,
    providerType: snapshot.provider.type,
    masterProviderId: snapshot.masterProvider?.id ?? null,
    masterName: snapshot.masterProvider?.name ?? null,
    serviceId: snapshot.service.id,
    serviceName: resolveServiceLabel(snapshot.service),
    startAtUtc: snapshot.startAtUtc ? snapshot.startAtUtc.toISOString() : null,
    clientName: snapshot.clientName,
    clientUserId: snapshot.clientUserId,
    studioId: snapshot.studioId,
  };
}

export async function loadBookingSnapshot(
  bookingId: string,
  db: DbClient = prisma
): Promise<BookingNotificationSnapshot | null> {
  return db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientUserId: true,
      clientName: true,
      startAtUtc: true,
      studioId: true,
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
    },
  });
}

function resolveMasterOwnerId(snapshot: BookingNotificationSnapshot): string | null {
  return (
    snapshot.masterProvider?.ownerUserId ??
    snapshot.masterProvider?.masterProfile?.userId ??
    snapshot.provider.ownerUserId ??
    snapshot.provider.masterProfile?.userId ??
    null
  );
}

async function resolveStudioAdminIds(
  snapshot: BookingNotificationSnapshot,
  db: DbClient = prisma
): Promise<string[]> {
  let studioId = snapshot.studioId;

  if (!studioId && snapshot.provider.type === ProviderType.STUDIO) {
    const studio = await db.studio.findUnique({
      where: { providerId: snapshot.provider.id },
      select: { id: true },
    });
    studioId = studio?.id ?? null;
  }

  if (!studioId) return [];

  const memberships = await db.studioMembership.findMany({
    where: {
      studioId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
    },
    select: { userId: true },
  });

  return memberships.map((item) => item.userId);
}

export function buildBookingRequestTitle(): string {
  return "Новая запись";
}

export function buildBookingRequestBody(snapshot: BookingNotificationSnapshot): string {
  const serviceName = resolveServiceLabel(snapshot.service);
  const whenLabel = formatDateLabel(snapshot.startAtUtc, snapshot.provider.timezone);
  if (whenLabel) {
    return `К вам записался клиент ${snapshot.clientName} на ${serviceName} ${whenLabel}`;
  }
  return `К вам записался клиент ${snapshot.clientName} на ${serviceName}`;
}

type BookingConfirmMode = "AUTO" | "MANUAL";

export function buildBookingConfirmedTitle(mode: BookingConfirmMode): string {
  return mode === "AUTO" ? "Новая запись (авто)" : "Запись подтверждена";
}

export function buildBookingConfirmedBody(
  snapshot: BookingNotificationSnapshot,
  audience: "CLIENT" | "MASTER",
  mode: BookingConfirmMode
): string {
  const serviceName = resolveServiceLabel(snapshot.service);
  const whenLabel = formatDateLabel(snapshot.startAtUtc, snapshot.provider.timezone);
  if (audience === "MASTER") {
    const prefix = mode === "AUTO" ? "Автоподтверждение" : "Запись подтверждена";
    if (whenLabel) {
      return `${prefix}: клиент ${snapshot.clientName} на ${serviceName} ${whenLabel}`;
    }
    return `${prefix}: клиент ${snapshot.clientName} на ${serviceName}`;
  }
  if (whenLabel) {
    return `Ваша запись подтверждена: ${serviceName} ${whenLabel}`;
  }
  return `Ваша запись подтверждена: ${serviceName}`;
}

export function buildBookingDeclinedTitle(): string {
  return "Запись отклонена";
}

export function buildBookingDeclinedBody(snapshot: BookingNotificationSnapshot): string {
  const serviceName = resolveServiceLabel(snapshot.service);
  const whenLabel = formatDateLabel(snapshot.startAtUtc, snapshot.provider.timezone);
  if (whenLabel) {
    return `Запись на ${serviceName} ${whenLabel} была отклонена.`;
  }
  return `Запись на ${serviceName} была отклонена.`;
}

function resolveReminderType(kind: BookingReminderKind): NotificationType {
  return kind === "REMINDER_24H"
    ? NotificationType.BOOKING_REMINDER_24H
    : NotificationType.BOOKING_REMINDER_2H;
}

function buildBookingReminderTitle(kind: BookingReminderKind, audience: "CLIENT" | "MASTER"): string {
  const suffix = kind === "REMINDER_24H" ? "за 24 часа" : "за 2 часа";
  if (audience === "MASTER") {
    return `Напоминание о записи ${suffix}`;
  }
  return `Напоминание ${suffix}`;
}

function buildBookingReminderBody(
  snapshot: BookingNotificationSnapshot,
  audience: "CLIENT" | "MASTER"
): string {
  const serviceName = resolveServiceLabel(snapshot.service);
  const whenLabel = formatDateLabel(snapshot.startAtUtc, snapshot.provider.timezone);
  if (audience === "MASTER") {
    const clientLabel = snapshot.clientName ? `клиент ${snapshot.clientName}` : "клиент";
    if (whenLabel) {
      return `${clientLabel} на ${serviceName} ${whenLabel}`;
    }
    return `${clientLabel} на ${serviceName}`;
  }
  if (whenLabel) {
    return `Ваша запись на ${serviceName} ${whenLabel}`;
  }
  return `Ваша запись на ${serviceName}`;
}

export async function createBookingReminderNotifications(input: {
  bookingId: string;
  kind: BookingReminderKind;
  db?: DbClient;
  snapshot?: BookingNotificationSnapshot | null;
}): Promise<NotificationRecord[]> {
  const db = input.db ?? prisma;
  const snapshot = input.snapshot ?? (await loadBookingSnapshot(input.bookingId, db));
  if (!snapshot) return [];

  const records: CreateNotificationInput[] = [];
  const payload = buildBookingPayload(snapshot);
  const type = resolveReminderType(input.kind);

  if (snapshot.clientUserId) {
    records.push({
      userId: snapshot.clientUserId,
      type,
      title: buildBookingReminderTitle(input.kind, "CLIENT"),
      body: buildBookingReminderBody(snapshot, "CLIENT"),
      payloadJson: payload,
      bookingId: snapshot.id,
    });
  }

  const masterOwnerId = resolveMasterOwnerId(snapshot);
  if (masterOwnerId) {
    records.push({
      userId: masterOwnerId,
      type,
      title: buildBookingReminderTitle(input.kind, "MASTER"),
      body: buildBookingReminderBody(snapshot, "MASTER"),
      payloadJson: payload,
      bookingId: snapshot.id,
    });
  }

  if (records.length === 0) return [];
  return createNotifications(records, db);
}

export async function createBookingRequestNotifications(input: {
  bookingId: string;
  db?: DbClient;
  snapshot?: BookingNotificationSnapshot | null;
}): Promise<NotificationRecord[]> {
  const db = input.db ?? prisma;
  const snapshot = input.snapshot ?? (await loadBookingSnapshot(input.bookingId, db));
  if (!snapshot) return [];

  const recipients = new Set<string>();
  const providerOwnerId =
    snapshot.provider.ownerUserId ?? snapshot.provider.masterProfile?.userId ?? null;
  if (providerOwnerId) recipients.add(providerOwnerId);

  const masterOwnerId =
    snapshot.masterProvider?.ownerUserId ?? snapshot.masterProvider?.masterProfile?.userId ?? null;
  if (masterOwnerId) recipients.add(masterOwnerId);

  const studioAdmins = await resolveStudioAdminIds(snapshot, db);
  studioAdmins.forEach((id) => recipients.add(id));

  if (recipients.size === 0) return [];

  const payload = buildBookingPayload(snapshot);
  const title = buildBookingRequestTitle();
  const body = buildBookingRequestBody(snapshot);

  return createNotifications(
    Array.from(recipients).map((userId) => ({
      userId,
      type: NotificationType.BOOKING_REQUEST,
      title,
      body,
      payloadJson: payload,
      bookingId: snapshot.id,
    })),
    db
  );
}

export async function createBookingConfirmedNotifications(input: {
  bookingId: string;
  notifyClient?: boolean;
  notifyMaster?: boolean;
  masterMode?: BookingConfirmMode;
  db?: DbClient;
  snapshot?: BookingNotificationSnapshot | null;
}): Promise<NotificationRecord[]> {
  const db = input.db ?? prisma;
  const snapshot = input.snapshot ?? (await loadBookingSnapshot(input.bookingId, db));
  if (!snapshot) return [];

  const payload = buildBookingPayload(snapshot);
  const records: CreateNotificationInput[] = [];
  const notifyClient = input.notifyClient ?? true;
  const notifyMaster = input.notifyMaster ?? false;
  const masterMode = input.masterMode ?? "MANUAL";

  if (notifyClient && snapshot.clientUserId) {
    records.push({
      userId: snapshot.clientUserId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: buildBookingConfirmedTitle("MANUAL"),
      body: buildBookingConfirmedBody(snapshot, "CLIENT", "MANUAL"),
      payloadJson: payload,
      bookingId: snapshot.id,
    });
  }

  if (notifyMaster) {
    const masterOwnerId = resolveMasterOwnerId(snapshot);
    if (masterOwnerId) {
      records.push({
        userId: masterOwnerId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: buildBookingConfirmedTitle(masterMode),
        body: buildBookingConfirmedBody(snapshot, "MASTER", masterMode),
        payloadJson: payload,
        bookingId: snapshot.id,
      });
    }
  }

  if (records.length === 0) return [];
  return createNotifications(records, db);
}

export async function createBookingDeclinedNotifications(input: {
  bookingId: string;
  db?: DbClient;
  snapshot?: BookingNotificationSnapshot | null;
}): Promise<NotificationRecord[]> {
  const db = input.db ?? prisma;
  const snapshot = input.snapshot ?? (await loadBookingSnapshot(input.bookingId, db));
  if (!snapshot || !snapshot.clientUserId) return [];

  const payload = buildBookingPayload(snapshot);
  return createNotifications(
    [
      {
        userId: snapshot.clientUserId,
        type: NotificationType.BOOKING_DECLINED,
        title: buildBookingDeclinedTitle(),
        body: buildBookingDeclinedBody(snapshot),
        payloadJson: payload,
        bookingId: snapshot.id,
      },
    ],
    db
  );
}

type BookingNotificationKind =
  | "CREATED"
  | "CANCELLED"
  | "RESCHEDULED"
  | "CONFIRMED"
  | "REJECTED"
  | "NO_SHOW";

type BookingNotificationContext = {
  bookingId: string;
  kind: BookingNotificationKind;
};

function mapType(kind: BookingNotificationKind): NotificationType {
  switch (kind) {
    case "CANCELLED":
    case "REJECTED":
    case "NO_SHOW":
      return NotificationType.BOOKING_CANCELLED;
    case "RESCHEDULED":
      return NotificationType.BOOKING_RESCHEDULED;
    case "CONFIRMED":
      return NotificationType.BOOKING_CONFIRMED;
    default:
      return NotificationType.BOOKING_CREATED;
  }
}

function buildTitle(kind: BookingNotificationKind): string {
  switch (kind) {
    case "CANCELLED":
      return "Запись отменена";
    case "RESCHEDULED":
      return "Запись перенесена";
    case "CONFIRMED":
      return "Запись подтверждена";
    case "REJECTED":
      return "Запись отклонена";
    case "NO_SHOW":
      return "Клиент не пришел";
    default:
      return "Новая запись";
  }
}

function buildBody(input: {
  providerName: string;
  masterName: string | null;
  serviceName: string;
  startAtUtc: Date | null;
  clientName: string;
}): string {
  const parts: string[] = [input.providerName];
  if (input.masterName) {
    parts.push(input.masterName);
  }
  parts.push(input.serviceName, input.clientName);
  if (input.startAtUtc) {
    const label = input.startAtUtc.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    parts.push(label);
  }
  return parts.join(" В· ");
}

export async function createBookingNotifications(
  input: BookingNotificationContext,
  db: DbClient = prisma
): Promise<NotificationRecord[]> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      clientName: true,
      startAtUtc: true,
      status: true,
      studioId: true,
      service: {
        select: {
          id: true,
          name: true,
          title: true,
        },
      },
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
    },
  });

  if (!booking) return [];

  const recipientIds = new Set<string>();
  if (booking.clientUserId) recipientIds.add(booking.clientUserId);

  const masterOwnerId =
    booking.masterProvider?.ownerUserId ??
    booking.masterProvider?.masterProfile?.userId ??
    booking.provider.ownerUserId ??
    booking.provider.masterProfile?.userId ??
    null;
  if (masterOwnerId) recipientIds.add(masterOwnerId);

  if (recipientIds.size === 0) return [];

  const type = mapType(input.kind);
  const title = buildTitle(input.kind);
  const body = buildBody({
    providerName: booking.provider.name,
    masterName: booking.masterProvider?.name ?? null,
    serviceName: booking.service.title?.trim() || booking.service.name,
    startAtUtc: booking.startAtUtc ?? null,
    clientName: booking.clientName,
  });

  const payload = buildBookingPayload({
    id: booking.id,
    status: booking.status,
    clientUserId: booking.clientUserId,
    clientName: booking.clientName,
    startAtUtc: booking.startAtUtc ?? null,
    studioId: booking.studioId,
    provider: booking.provider,
    masterProvider: booking.masterProvider,
    service: booking.service,
  });

  const users = Array.from(recipientIds);
  const existing = await db.notification.findMany({
    where: {
      bookingId: booking.id,
      type,
      title,
      userId: { in: users },
    },
    select: { userId: true },
  });
  const existingUsers = new Set(existing.map((item) => item.userId));
  const toCreate = users.filter((userId) => !existingUsers.has(userId));
  if (toCreate.length === 0) return [];

  return createNotifications(
    toCreate.map((userId) => ({
      userId,
      type,
      title,
      body,
      payloadJson: payload,
      bookingId: booking.id,
    })),
    db
  );
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<{ id: string }> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true },
  });
  if (!notification || notification.userId !== userId) {
    throw new AppError("Notification not found", 404, "NOT_FOUND");
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });

  return { id: notificationId };
}

export async function listNotifications(input: {
  userId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ items: NotificationRecord[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const cursorDate = input.cursor ? new Date(input.cursor) : null;
  const where: Prisma.NotificationWhereInput = {
    userId: input.userId,
    ...(cursorDate && !Number.isNaN(cursorDate.getTime())
      ? { createdAt: { lt: cursorDate } }
      : {}),
  };

  const items = await prisma.notification.findMany({
    where,
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: notificationSelect,
  });

  const nextCursor = items.length === limit ? items[items.length - 1]?.createdAt.toISOString() ?? null : null;
  return { items, nextCursor };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

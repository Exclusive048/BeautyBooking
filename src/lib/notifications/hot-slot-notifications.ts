import { DiscountType, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications/delivery";

const hotSlotInclude = {
  provider: {
    select: {
      id: true,
      name: true,
      timezone: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  },
  service: { select: { id: true, name: true, title: true } },
} as const;

export type HotSlotWithRelations = Prisma.HotSlotGetPayload<{
  include: typeof hotSlotInclude;
}>;

function formatDiscount(type: DiscountType, value: number): string {
  return type === "PERCENT" ? `${value}%` : `${value} руб.`;
}

function formatSlotLabel(startAtUtc: Date, timezone: string): string {
  return startAtUtc.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function resolveServiceLabel(service: { name: string; title: string | null } | null): string | null {
  if (!service) return null;
  return service.title?.trim() || service.name;
}

function resolveMasterUserId(slot: HotSlotWithRelations): string | null {
  return slot.provider.ownerUserId ?? slot.provider.masterProfile?.userId ?? null;
}

function buildTelegramText(title: string, body: string): string {
  return `${title}\n${body}`;
}

export async function loadHotSlotWithRelations(
  hotSlotId: string
): Promise<HotSlotWithRelations | null> {
  return prisma.hotSlot.findUnique({
    where: { id: hotSlotId },
    include: hotSlotInclude,
  });
}

export async function notifyHotSlotPublished(hotSlot: HotSlotWithRelations): Promise<void> {
  const masterUserId = resolveMasterUserId(hotSlot);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(hotSlot.service);
  const slotLabel = formatSlotLabel(hotSlot.startAtUtc, hotSlot.provider.timezone);
  const discountLabel = formatDiscount(hotSlot.discountType, hotSlot.discountValue);

  const title = "Горящее окошко опубликовано";
  const body = serviceName
    ? `Окошко ${slotLabel} для услуги ${serviceName}. Скидка ${discountLabel}.`
    : `Окошко ${slotLabel}. Скидка ${discountLabel}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.HOT_SLOT_PUBLISHED,
    title,
    body,
    payloadJson: {
      hotSlotId: hotSlot.id,
      providerId: hotSlot.providerId,
      startAtUtc: hotSlot.startAtUtc.toISOString(),
      discountType: hotSlot.discountType,
      discountValue: hotSlot.discountValue,
      serviceId: hotSlot.serviceId,
    },
    pushUrl: "/cabinet/master/dashboard",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyHotSlotBooked(
  hotSlot: HotSlotWithRelations,
  clientName: string
): Promise<void> {
  const masterUserId = resolveMasterUserId(hotSlot);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(hotSlot.service);
  const slotLabel = formatSlotLabel(hotSlot.startAtUtc, hotSlot.provider.timezone);
  const title = "Горящее окошко забронировано";
  const body = serviceName
    ? `Клиент ${clientName} забронировал окошко ${slotLabel} (${serviceName}).`
    : `Клиент ${clientName} забронировал окошко ${slotLabel}.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.HOT_SLOT_BOOKED,
    title,
    body,
    payloadJson: {
      hotSlotId: hotSlot.id,
      providerId: hotSlot.providerId,
      startAtUtc: hotSlot.startAtUtc.toISOString(),
      clientName,
      serviceId: hotSlot.serviceId,
    },
    pushUrl: "/cabinet/master/dashboard",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyHotSlotExpiring(hotSlot: HotSlotWithRelations): Promise<void> {
  const masterUserId = resolveMasterUserId(hotSlot);
  if (!masterUserId) return;

  const serviceName = resolveServiceLabel(hotSlot.service);
  const slotLabel = formatSlotLabel(hotSlot.startAtUtc, hotSlot.provider.timezone);
  const title = "Горящее окошко скоро истекает";
  const body = serviceName
    ? `Окошко ${slotLabel} для услуги ${serviceName} истекает через 1 час.`
    : `Окошко ${slotLabel} истекает через 1 час.`;

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.HOT_SLOT_EXPIRING,
    title,
    body,
    payloadJson: {
      hotSlotId: hotSlot.id,
      providerId: hotSlot.providerId,
      startAtUtc: hotSlot.startAtUtc.toISOString(),
      serviceId: hotSlot.serviceId,
    },
    pushUrl: "/cabinet/master/dashboard",
    telegramText: buildTelegramText(title, body),
  });
}

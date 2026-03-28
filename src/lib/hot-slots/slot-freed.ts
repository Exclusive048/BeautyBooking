import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as cache from "@/lib/cache/cache";
import { deliverNotification } from "@/lib/notifications/delivery";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError, logInfo } from "@/lib/logging/logger";
import { UI_TEXT } from "@/lib/ui/text";
import type { SlotFreedPayload } from "@/lib/queue/types";

const ANTI_SPAM_TTL_SECONDS = 86400;
const MAX_SLOT_HORIZON_MS = 48 * 60 * 60 * 1000;

function buildAntiSpamKey(userId: string, providerId: string): string {
  return `slot-freed-notify:${userId}:${providerId}`;
}

function formatSlotDateTime(startAtUtc: string, timezone: string): string {
  const date = new Date(startAtUtc);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

export async function processSlotFreed(payload: SlotFreedPayload): Promise<void> {
  const slotStart = new Date(payload.slotStartAtUtc);
  const now = new Date();

  if (slotStart.getTime() - now.getTime() > MAX_SLOT_HORIZON_MS) {
    logInfo("slot.freed skipped: slot beyond 48h horizon", {
      providerId: payload.providerId,
      slotStartAtUtc: payload.slotStartAtUtc,
    });
    return;
  }

  if (slotStart.getTime() <= now.getTime()) {
    return;
  }

  const subscribers = await prisma.hotSlotSubscription.findMany({
    where: { providerId: payload.providerId },
    select: { userId: true },
  });

  if (subscribers.length === 0) return;

  const dateTime = formatSlotDateTime(payload.slotStartAtUtc, payload.timezone);
  const title = UI_TEXT.notifications.slotFreed.title;
  const body = UI_TEXT.notifications.slotFreed.body(payload.providerName, dateTime);

  const appUrl = getAppPublicUrl();
  const bookingPath = payload.providerPublicUsername
    ? `/u/${payload.providerPublicUsername}/booking?slotStartAt=${encodeURIComponent(payload.slotStartAtUtc)}`
    : null;
  const fullBookingUrl = appUrl && bookingPath ? `${appUrl}${bookingPath}` : null;

  const notificationPayload = {
    providerId: payload.providerId,
    providerName: payload.providerName,
    providerPublicUsername: payload.providerPublicUsername,
    slotStartAtUtc: payload.slotStartAtUtc,
    slotEndAtUtc: payload.slotEndAtUtc,
    serviceName: payload.serviceName,
    bookingPath,
  };

  let notified = 0;
  for (const sub of subscribers) {
    if (sub.userId === payload.cancelledByUserId) continue;

    const antiSpamKey = buildAntiSpamKey(sub.userId, payload.providerId);
    const isFirst = await cache.setNx(antiSpamKey, "1", ANTI_SPAM_TTL_SECONDS);
    if (!isFirst) continue;

    const telegramText = UI_TEXT.notifications.slotFreed.telegram(
      payload.providerName,
      dateTime,
      fullBookingUrl
    );

    try {
      await deliverNotification({
        userId: sub.userId,
        type: NotificationType.SLOT_FREED,
        title,
        body,
        payloadJson: notificationPayload,
        bookingId: null,
        pushUrl: bookingPath ?? undefined,
        telegramText,
      });
      notified++;
    } catch (error) {
      logError("slot.freed notification delivery failed", {
        userId: sub.userId,
        providerId: payload.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (notified > 0) {
    logInfo("slot.freed notifications sent", {
      providerId: payload.providerId,
      notified,
      total: subscribers.length,
    });
  }
}

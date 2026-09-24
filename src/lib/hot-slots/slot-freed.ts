import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimNotificationDedup } from "@/lib/notifications/dedup-guard";
import { deliverNotification } from "@/lib/notifications/delivery";
import { formatBookingWhenLabel } from "@/lib/notifications/format-booking-when";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError, logInfo } from "@/lib/logging/logger";
import { UI_TEXT } from "@/lib/ui/text";
import type { SlotFreedPayload } from "@/lib/queue/types";

const ANTI_SPAM_TTL_SECONDS = 86400;
const MAX_SLOT_HORIZON_MS = 48 * 60 * 60 * 1000;

function buildAntiSpamKey(userId: string, providerId: string): string {
  return `slot-freed-notify:${userId}:${providerId}`;
}

// Rule 17: salon-tz с меткой зоны — подписчик может жить в другом поясе.
function formatSlotDateTime(startAtUtc: string, timezone: string): string {
  const date = new Date(startAtUtc);
  return formatBookingWhenLabel(date, timezone) ?? startAtUtc;
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

  /**
   * FIX-C12 — сторож опрашивается ДО первой доставки, а не по ходу рассылки.
   *
   * 🔴 Отказ сторожа — свойство ПРОГОНА (зависимость недоступна), а не
   * подписчика. Пока `claimNotificationDedup` стоял внутри цикла доставки,
   * обрыв на k-м подписчике оставлял k−1 уже уведомлённых и ронял задачу в
   * ретраи: то есть решение «не рассылать» принималось после того, как часть
   * рассылки состоялась. Два прохода делают его один раз и на весь прогон —
   * бросает здесь, когда доставок ещё ноль.
   *
   * Порядок «claim → deliver» сохранён и по отношению к сбою ДОСТАВКИ: ключ
   * занимался до `deliverNotification` и раньше, поэтому проваленная доставка
   * так же не повторяется. Это не регресс, а прежнее поведение.
   */
  const recipients: string[] = [];
  for (const sub of subscribers) {
    if (sub.userId === payload.cancelledByUserId) continue;
    const antiSpamKey = buildAntiSpamKey(sub.userId, payload.providerId);
    const isFirst = await claimNotificationDedup(antiSpamKey, ANTI_SPAM_TTL_SECONDS);
    if (isFirst) recipients.push(sub.userId);
  }

  let notified = 0;
  for (const userId of recipients) {
    const telegramText = UI_TEXT.notifications.slotFreed.telegram(
      payload.providerName,
      dateTime,
      fullBookingUrl
    );

    try {
      await deliverNotification({
        userId,
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
        userId,
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

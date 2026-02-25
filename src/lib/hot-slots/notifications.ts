import { NotificationType, type DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { createTelegramSendJob } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError } from "@/lib/logging/logger";

type HotSlotNotificationInput = {
  providerId: string;
  providerName: string;
  providerPublicUsername: string | null;
  timezone: string;
  discountType: DiscountType;
  discountValue: number;
  serviceTitle?: string | null;
  slots: { startAtUtc: Date }[];
};

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

function buildNotificationBody(input: HotSlotNotificationInput, slotLabel: string): string {
  const parts: string[] = [`Мастер: ${input.providerName}`];
  if (input.serviceTitle) {
    parts.push(`Услуга: ${input.serviceTitle}`);
  }
  parts.push(`Скидка: ${formatDiscount(input.discountType, input.discountValue)}`);
  parts.push(`Ближайший слот: ${slotLabel}`);
  if (input.slots.length > 1) {
    parts.push(`Всего слотов: ${input.slots.length}`);
  }
  return parts.join(" · ");
}

function buildTelegramText(input: HotSlotNotificationInput, slotLabel: string, linkUrl: string | null): string {
  const lines: string[] = ["🔥 Горячий слот доступен"];
  lines.push(`Мастер: ${input.providerName}`);
  if (input.serviceTitle) {
    lines.push(`Услуга: ${input.serviceTitle}`);
  }
  lines.push(`Скидка: ${formatDiscount(input.discountType, input.discountValue)}`);
  lines.push(`Ближайший слот: ${slotLabel}`);
  if (input.slots.length > 1) {
    lines.push(`Всего слотов: ${input.slots.length}`);
  }
  if (linkUrl) {
    lines.push(`Ссылка: ${linkUrl}`);
  }
  return lines.join("\n");
}

export async function notifyHotSlotSubscribers(input: HotSlotNotificationInput): Promise<void> {
  const subscribers = await prisma.hotSlotSubscription.findMany({
    where: { providerId: input.providerId },
    select: { userId: true },
  });
  if (subscribers.length === 0) return;

  const sortedSlots = [...input.slots].sort(
    (a, b) => a.startAtUtc.getTime() - b.startAtUtc.getTime()
  );
  const primarySlot = sortedSlots[0];
  if (!primarySlot) return;

  const slotLabel = formatSlotLabel(primarySlot.startAtUtc, input.timezone);
  const title = "Горячий слот доступен";
  const body = buildNotificationBody(input, slotLabel);

  const appUrl = getAppPublicUrl();
  const bookingPath = input.providerPublicUsername
    ? `/u/${input.providerPublicUsername}/booking?slotStartAt=${encodeURIComponent(
        primarySlot.startAtUtc.toISOString()
      )}`
    : null;
  const linkUrl = appUrl && bookingPath ? `${appUrl}${bookingPath}` : null;

  const payload = {
    providerId: input.providerId,
    providerName: input.providerName,
    providerPublicUsername: input.providerPublicUsername,
    slotStartAtUtc: primarySlot.startAtUtc.toISOString(),
    discountType: input.discountType,
    discountValue: input.discountValue,
    serviceTitle: input.serviceTitle ?? null,
    slotsCount: input.slots.length,
    bookingPath,
  };

  const records = [];
  for (const sub of subscribers) {
    records.push(
      await createNotification({
        userId: sub.userId,
        type: NotificationType.HOT_SLOT_AVAILABLE,
        title,
        body,
        payloadJson: payload,
        bookingId: null,
      })
    );
  }

  if (records.length > 0) {
    publishNotifications(records);
  }

  const telegramText = buildTelegramText(input, slotLabel, linkUrl);
  await Promise.all(
    subscribers.map(async (sub) => {
      const chatId = await getTelegramChatIdForUser(sub.userId);
      if (!chatId) return;
      try {
        await enqueue(
          createTelegramSendJob({
            chatId,
            text: telegramText,
          })
        );
      } catch (error) {
        logError("Failed to enqueue hot slot telegram notification", {
          providerId: input.providerId,
          userId: sub.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );
}

import type { NotificationType, Prisma } from "@prisma/client";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { createTelegramSendJob } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { logError } from "@/lib/logging/logger";
import { sendPushToUser } from "@/lib/notifications/push/send";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";

type DeliveryInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: Prisma.InputJsonValue;
  bookingId?: string | null;
  pushUrl?: string;
  telegramText?: string;
};

async function enqueueTelegramMessage(userId: string, text: string): Promise<void> {
  const chatId = await getTelegramChatIdForUser(userId);
  if (!chatId) return;
  try {
    await enqueue(
      createTelegramSendJob({
        chatId,
        text,
      })
    );
  } catch (error) {
    logError("Failed to enqueue telegram notification", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deliverNotification(input: DeliveryInput): Promise<void> {
  const record = await createNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    payloadJson: input.payloadJson,
    bookingId: input.bookingId ?? null,
  });

  publishNotifications([record]);

  void sendPushToUser(input.userId, {
    title: record.title,
    body: record.body,
    url: input.pushUrl,
  });

  if (input.telegramText) {
    void (async () => {
      try {
        const plan = await getCurrentPlan(input.userId);
        if (!plan.features.tgNotifications) return;
        await enqueueTelegramMessage(input.userId, input.telegramText!);
      } catch (error) {
        logError("Failed to check tgNotifications feature", {
          userId: input.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }
}

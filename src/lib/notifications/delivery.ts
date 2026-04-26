import type { NotificationType, Prisma } from "@prisma/client";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { createTelegramSendJob } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { logError } from "@/lib/logging/logger";
import { sendPushToUser } from "@/lib/notifications/push/send";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { prisma } from "@/lib/prisma";
import { sendEmail, isEmailConfigured } from "@/lib/email/sender";
import {
  buildNotificationEmailHtml,
  buildNotificationEmailText,
} from "@/lib/email/templates/notification";
import { resolvePublicAppUrl } from "@/lib/app-url";

type DeliveryInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: Prisma.InputJsonValue;
  bookingId?: string | null;
  pushUrl?: string;
  telegramText?: string;
  /** Override the CTA URL in email. Defaults to pushUrl if not set. */
  emailCtaUrl?: string;
};

// Notification types that should be delivered via email (important, non-spammy)
const EMAIL_NOTIFICATION_TYPES = new Set<NotificationType>([
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_CANCELLED_BY_MASTER",
  "BOOKING_CANCELLED_BY_CLIENT",
  "BOOKING_RESCHEDULED",
  "BOOKING_RESCHEDULE_REQUESTED",
  "BOOKING_REMINDER_24H",
  "BOOKING_REMINDER_2H",
  "REVIEW_LEFT",
]);

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

async function deliverEmailNotification(
  userId: string,
  title: string,
  body: string,
  ctaUrl?: string
): Promise<void> {
  if (!isEmailConfigured()) return;

  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { email: true, emailNotificationsEnabled: true },
  });

  if (!user?.email || !user.emailNotificationsEnabled) return;

  const baseUrl = resolvePublicAppUrl() ?? "";
  const unsubscribeUrl = `${baseUrl}/cabinet/settings`;
  const resolvedCtaUrl = ctaUrl ? (ctaUrl.startsWith("http") ? ctaUrl : `${baseUrl}${ctaUrl}`) : undefined;

  await sendEmail({
    to: user.email,
    subject: title,
    html: buildNotificationEmailHtml({
      title,
      body,
      ctaUrl: resolvedCtaUrl,
      ctaLabel: "Посмотреть",
      unsubscribeUrl,
    }),
    text: buildNotificationEmailText({ title, body, ctaUrl: resolvedCtaUrl }),
  });
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

  // Email channel — silent fail, only for important notification types
  if (EMAIL_NOTIFICATION_TYPES.has(input.type)) {
    void deliverEmailNotification(
      input.userId,
      input.title,
      input.body,
      input.emailCtaUrl ?? input.pushUrl
    ).catch((error) => {
      logError("Email notification delivery failed", {
        userId: input.userId,
        type: input.type,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

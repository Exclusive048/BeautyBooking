import type { NotificationType, Prisma } from "@prisma/client";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { isTelegramEnabled } from "@/lib/env";
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

/**
 * EMAIL-ADDRESS-OCCUPATION: сервисная почта уходит ТОЛЬКО на ПОДТВЕРЖДЁННЫЙ
 * адрес.
 *
 * Пока проверки `emailVerifiedAt` не было, вторая половина squat'а была не про
 * доступность, а про ПДн: держатель заявки на чужой адрес получал письма о
 * СВОИХ записях в ЧУЖОЙ ящик — то есть имя, услугу и время визита третьего
 * лица уезжали постороннему человеку. Частичный уникальный индекс это НЕ
 * закрывает: он про уникальность владения, а не про доставку.
 *
 * Вынесено отдельным предикатом, а не оставлено условием в теле, чтобы
 * проверялось поведение, а не строка исходника.
 */
type ServiceEmailRecipient = {
  email: string | null;
  emailNotificationsEnabled: boolean;
  emailVerifiedAt: Date | null;
};

export function canDeliverServiceEmail(
  user: ServiceEmailRecipient | null,
): user is ServiceEmailRecipient & { email: string } {
  if (!user) return false;
  if (!user.email) return false;
  if (!user.emailNotificationsEnabled) return false;
  return user.emailVerifiedAt !== null;
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
    select: { email: true, emailNotificationsEnabled: true, emailVerifiedAt: true },
  });

  if (!canDeliverServiceEmail(user)) return;

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

  // HARDENING-01 FIX-4: fire-and-forget MUST carry a .catch — a rejected
  // detached promise inside the worker (booking reminders run here) hits the
  // global unhandledRejection handler, which exits the whole worker process.
  // Mirrors the existing pattern in `admin-initiated.ts`.
  void sendPushToUser(input.userId, {
    title: record.title,
    body: record.body,
    url: input.pushUrl,
  }).catch((error) => {
    logError("Push notification delivery failed", {
      userId: input.userId,
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // FIX-TELEGRAM-KILLSWITCH: fast env-ceiling skip (sync, no DB) before the
  // plan check. The effective admin-toggle check happens at the recipients
  // chokepoint (`getTelegramChatIdForUser`), which covers every enqueue path.
  if (input.telegramText && isTelegramEnabled) {
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

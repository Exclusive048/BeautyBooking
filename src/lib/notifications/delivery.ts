import type { NotificationType, Prisma } from "@prisma/client";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { isTelegramEnabled } from "@/lib/env";
import { createTelegramSendJob } from "@/lib/queue/types";
import { enqueue } from "@/lib/queue/queue";
import { logError, logInfo } from "@/lib/logging/logger";
import { filterUsersWithMarketingConsent } from "@/lib/legal/consent";
import { isMarketingNotificationType } from "@/lib/notifications/marketing-types";
import { sendPushToUser } from "@/lib/notifications/push/send";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { prisma } from "@/lib/prisma";
import { sendEmail, isEmailConfigured } from "@/lib/email/sender";
import {
  buildNotificationEmailHeaders,
  buildNotificationEmailHtml,
  buildNotificationEmailText,
} from "@/lib/email/templates/notification";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { enqueueVkNotification } from "@/lib/vk/notify";

type DeliveryInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: Prisma.InputJsonValue;
  bookingId?: string | null;
  pushUrl?: string;
  /** Ключ схлопывания push в шторке (см. `sendPushToUser`). */
  pushTag?: string;
  telegramText?: string;
  /** Override the CTA URL in email. Defaults to pushUrl if not set. */
  emailCtaUrl?: string;
};

// Важные и не-спамные типы: уходят на почту и во ВКонтакте. Чат и прочие
// частые события остаются в центре уведомлений и пуше — в мессенджере они
// превратились бы в поток.
const IMPORTANT_NOTIFICATION_TYPES = new Set<NotificationType>([
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
  // SCHEDULE-PATTERNS-01 (этап 3): одно на дату окончания, а пропуск стоит
  // пустого расписания — клиенты перестают видеть окошки.
  "SCHEDULE_ENDING",
  "STUDIO_SCHEDULE_ENDING",
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
    headers: buildNotificationEmailHeaders({ unsubscribeUrl }),
  });
}

/**
 * PUSH-COVERAGE-01 — внешние каналы (push + почта + ВКонтакте) для УЖЕ созданной и
 * закоммиченной in-app записи. Единственное место, где решается, куда ещё
 * уходит уведомление, кроме центра: `deliverNotification` зовёт его сам, а
 * пути, которые создают запись ВНУТРИ транзакции (напоминания о записи:
 * запись + отметка «отправлено» атомарны), зовут его после коммита.
 *
 * До этого такие пути ограничивались `publishNotifications` (только SSE) —
 * и напоминания за 24 ч / 2 ч, самое полезное уведомление продукта, не
 * приходили ни пушем, ни письмом, хотя оба типа стоят в почтовом списке.
 *
 * Звать ТОЛЬКО после коммита: push, отправленный до него, может сообщить о
 * том, чего не случилось (откат), а ретрай джоба пришлёт его второй раз.
 */
export function deliverExternalChannels(
  record: { userId: string; type: NotificationType; title: string; body: string },
  urls: { pushUrl?: string; emailCtaUrl?: string; pushTag?: string } = {},
): void {
  // HARDENING-01 FIX-4: fire-and-forget MUST carry a .catch — a rejected
  // detached promise inside the worker (booking reminders run here) hits the
  // global unhandledRejection handler, which exits the whole worker process.
  // Mirrors the existing pattern in `admin-initiated.ts`.
  void sendPushToUser(record.userId, {
    title: record.title,
    body: record.body,
    url: urls.pushUrl,
    tag: urls.pushTag,
  }).catch((error) => {
    logError("Push notification delivery failed", {
      userId: record.userId,
      type: record.type,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // Email channel — silent fail, only for important notification types
  if (IMPORTANT_NOTIFICATION_TYPES.has(record.type)) {
    void deliverEmailNotification(
      record.userId,
      record.title,
      record.body,
      urls.emailCtaUrl ?? urls.pushUrl
    ).catch((error) => {
      logError("Email notification delivery failed", {
        userId: record.userId,
        type: record.type,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // VK-COMMUNITY-NOTIFY-01: личное сообщение от сообщества ВКонтакте. Для
    // всех ролей, без тарифа; условия и отказы — в `vk/notify.ts`.
    void enqueueVkNotification({
      userId: record.userId,
      title: record.title,
      body: record.body,
      url: urls.emailCtaUrl ?? urls.pushUrl,
    }).catch((error) => {
      logError("VK notification delivery failed", {
        userId: record.userId,
        type: record.type,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

export async function deliverNotification(input: DeliveryInput): Promise<void> {
  // 29.09 доработки · 16 (ENFORCEMENT: ConsentType.MARKETING): рекламный тип
  // (`notifications/marketing-types.ts`) без активного согласия на рекламу не
  // создаётся ни в одном канале — ни записи в центре, ни пуша, ни почты. Это
  // единственная точка: оба отправителя горящих окошек идут через неё, а прямой
  // вызов `createNotification` с рекламным типом запрещает сторож
  // `notifications/marketing-types.test.ts`. В лог — только тип и id, без
  // телефона и имени.
  if (isMarketingNotificationType(input.type)) {
    const allowed = await filterUsersWithMarketingConsent([input.userId]);
    if (!allowed.has(input.userId)) {
      logInfo("notification.marketing.skipped", { type: input.type, userId: input.userId });
      return;
    }
  }

  const record = await createNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    payloadJson: input.payloadJson,
    bookingId: input.bookingId ?? null,
  });

  publishNotifications([record]);

  deliverExternalChannels(record, {
    pushUrl: input.pushUrl,
    emailCtaUrl: input.emailCtaUrl,
    pushTag: input.pushTag,
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
}

import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { isEmailConfigured, trySendEmail } from "@/lib/email/sender";
import { describeSmtpFailure, type SmtpFailure } from "@/lib/email/smtp-failure";
import {
  buildNotificationEmailHeaders,
  buildNotificationEmailHtml,
  buildNotificationEmailText,
} from "@/lib/email/templates/notification";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { toExternalSafeLink } from "@/lib/notifications/external-link";
import { enqueue } from "@/lib/queue/queue";
import { decideRetry } from "@/lib/queue/retry-policy";
import { createEmailSendJob, type EmailSendJob, type EmailSendPayload } from "@/lib/queue/types";

/**
 * NOTIFICATION-EMAIL-QUEUE (A-06, 2026-10-30) — письма-уведомления важных типов
 * идут задачей очереди `email.send`, а не отправкой из процесса запроса.
 *
 * Было: `deliverExternalChannels` звал отправку через `void …catch`, а
 * `sendEmail` глотал ошибку SMTP и возвращал `false`. Временный отказ Яндекс 360
 * (451, лимит отправки), обрыв соединения, таймаут или рестарт контейнера на
 * автодеплое — и письмо о записи терялось без повтора. Для человека без
 * приложения и с выключенным push почта — единственный внешний канал, при этом
 * ВКонтакте и push для тех же событий уже шли очередью с повторами.
 *
 * Стало:
 *  - постановка (`enqueueEmailNotification`) кладёт в задачу только id
 *    уведомления, тип и внешнюю ссылку — без адреса и текста (ПДн);
 *  - воркер перечитывает уведомление и получателя, отправляет и по ошибке SMTP
 *    решает (`describeSmtpFailure`): временная — повтор по таблице типа
 *    (`retry-policy.ts`, ~1 ч), постоянная (5xx) — задача закрыта сразу;
 *  - повторы кончились — то же, что раньше при любом отказе: строка ошибки в
 *    логе, письма нет, уведомление остаётся в центре. В мёртвые задачи такое
 *    письмо не кладётся: «повторить» оттуда через часы прислало бы напоминание
 *    о визите, который уже прошёл.
 *
 * Дубль письма возможен: SMTP принял письмо, а ответ потерян (таймаут сокета
 * после DATA, рестарт воркера до подтверждения задачи) — повтор отправит его
 * ещё раз. Это сознательный размен (at-least-once), потерянное письмо о записи
 * хуже лишнего.
 *
 * Письма входа (OTP) сюда не относятся: интерфейс ждёт ответа отправки, они
 * по-прежнему идут `sendEmail` синхронно.
 */

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

const RECIPIENT_SELECT = {
  email: true,
  emailNotificationsEnabled: true,
  emailVerifiedAt: true,
} as const;

export type EmailSendOutcome =
  | { kind: "sent" }
  | { kind: "skipped"; reason: "not-configured" | "notification-missing" | "recipient" }
  | { kind: "retry"; failure: SmtpFailure }
  | { kind: "rejected"; failure: SmtpFailure };

/** Код ошибки без текста ответа сервера: в тексте бывает адрес получателя. */
function failureLog(failure: SmtpFailure) {
  return { code: failure.code, responseCode: failure.responseCode, command: failure.command };
}

/**
 * Одна отправка письма-уведомления. Решение о повторе — у вызывающего, здесь
 * только исход. Получатель проверяется заново: между постановкой и отправкой
 * человек мог выключить почту или сменить адрес (смена снимает подтверждение).
 */
export async function processEmailSendPayload(payload: EmailSendPayload): Promise<EmailSendOutcome> {
  if (!isEmailConfigured()) return { kind: "skipped", reason: "not-configured" };

  const notification = await prisma.notification.findUnique({
    where: { id: payload.notificationId },
    select: { title: true, body: true, user: { select: RECIPIENT_SELECT } },
  });
  if (!notification) {
    // Удалено вместе с аккаунтом — писать некому.
    logInfo("email.send.skipped", { notificationId: payload.notificationId, reason: "notification-missing" });
    return { kind: "skipped", reason: "notification-missing" };
  }
  if (!canDeliverServiceEmail(notification.user)) {
    logInfo("email.send.skipped", { notificationId: payload.notificationId, reason: "recipient" });
    return { kind: "skipped", reason: "recipient" };
  }

  const baseUrl = resolvePublicAppUrl() ?? "";
  const unsubscribeUrl = `${baseUrl}/cabinet/settings`;
  // EXTERNAL-LINK-NO-IDS: письмо хранят почтовые сервисы — в ссылке только
  // раздел. Ссылка очищена при постановке; здесь — ещё раз, потому что правило
  // обязано стоять у сборщика письма, а задачу можно поставить и в обход
  // `enqueueEmailNotification` (повторная очистка своей ссылки её не меняет).
  const ctaUrl = toExternalSafeLink(payload.link ?? undefined) ?? undefined;

  const result = await trySendEmail({
    to: notification.user.email,
    subject: notification.title,
    html: buildNotificationEmailHtml({
      title: notification.title,
      body: notification.body,
      ctaUrl,
      ctaLabel: "Посмотреть",
      unsubscribeUrl,
    }),
    text: buildNotificationEmailText({ title: notification.title, body: notification.body, ctaUrl }),
    headers: buildNotificationEmailHeaders({ unsubscribeUrl }),
  });

  if (result.status === "sent") return { kind: "sent" };
  if (result.status === "not-configured") return { kind: "skipped", reason: "not-configured" };

  const failure = describeSmtpFailure(result.error);
  if (failure.transient) {
    logError("email.send.transient-failure", {
      notificationId: payload.notificationId,
      type: payload.type,
      ...failureLog(failure),
      __skipAlert: true,
    });
    return { kind: "retry", failure };
  }

  // Постоянный отказ (5xx: адреса нет, неверный логин SMTP) — как раньше,
  // ошибка с алертом: неверный логин касается всех писем сразу.
  logError("Email notification delivery failed", {
    notificationId: payload.notificationId,
    type: payload.type,
    reason: "rejected",
    ...failureLog(failure),
  });
  return { kind: "rejected", failure };
}

/**
 * Задача `email.send` целиком: временный отказ — повтор по таблице типа,
 * повторы кончились — строка ошибки и задача закрыта. `retry` — постановка
 * повтора воркером (её отказ Redis — `QueueBookkeepingError`, задача остаётся
 * в processing, WORKER-CATCH-REDIS-SAFE).
 */
export async function runEmailSendJob(
  job: EmailSendJob,
  deps: { retry: (job: EmailSendJob, delayMs: number) => Promise<void> },
): Promise<void> {
  const outcome = await processEmailSendPayload(job.payload);
  if (outcome.kind !== "retry") return;

  const decision = decideRetry(job);
  if (decision.kind === "retry") {
    await deps.retry({ ...job, attempts: decision.attempts }, decision.delayMs);
    return;
  }

  logError("Email notification delivery failed", {
    notificationId: job.payload.notificationId,
    type: job.payload.type,
    reason: "retries-exhausted",
    attempts: decision.attempts,
    ...failureLog(outcome.failure),
  });
}

/**
 * Ставит письмо-уведомление в очередь, если его есть куда отправить. Не
 * бросает. Получатель проверяется и здесь — чтобы не ставить задач тем, у кого
 * почта не подтверждена или выключена (их большинство), — и ещё раз в воркере.
 *
 * Очередь недоступна — письмо отправляется сразу, как до A-06: отказ Redis не
 * должен отнимать канал, который без очереди работал. При brownout Redis
 * постановка могла и пройти, тогда письмо придёт дважды — at-least-once.
 */
export async function enqueueEmailNotification(input: {
  notificationId: string;
  userId: string;
  type: NotificationType;
  url?: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  const user = await prisma.userProfile.findUnique({
    where: { id: input.userId },
    select: RECIPIENT_SELECT,
  });
  if (!canDeliverServiceEmail(user)) return;

  // EXTERNAL-LINK-NO-IDS: письмо хранят почтовые сервисы — в ссылке только раздел.
  const payload: EmailSendPayload = {
    notificationId: input.notificationId,
    type: input.type,
    link: toExternalSafeLink(input.url),
  };

  try {
    await enqueue(createEmailSendJob(payload));
    return;
  } catch (error) {
    logError("Failed to enqueue email notification", {
      notificationId: input.notificationId,
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }

  const outcome = await processEmailSendPayload(payload);
  if (outcome.kind === "retry") {
    logError("Email notification delivery failed", {
      notificationId: input.notificationId,
      type: input.type,
      reason: "queue-unavailable",
      ...failureLog(outcome.failure),
    });
  }
}

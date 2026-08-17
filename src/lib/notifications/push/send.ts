import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { webpush, isPushEnabled } from "@/lib/notifications/push/vapid";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * RES-22 — граница запроса к push-сервису.
 *
 * 10 с: FCM/Mozilla/Apple отвечают за доли секунды, и push — уведомление, а не
 * транзакция: ждать дольше нечего, ретраить самим тоже нечего (доставку
 * гарантирует сам push-сервис после приёма).
 */
const PUSH_REQUEST_TIMEOUT_MS = 10_000;

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { statusCode?: unknown };
  return typeof record.statusCode === "number" ? record.statusCode : null;
}

/**
 * HARDENING-01 FIX-4: this promise structurally CANNOT reject — the whole
 * body (including the Prisma reads that previously ran before any try/catch)
 * is wrapped, and failures are logged internally. Callers fire-and-forget
 * (`void sendPushToUser(...)`) from worker-reachable code, where a rejected
 * detached promise would hit the global unhandledRejection handler and
 * `process.exit(1)` the whole worker. Call sites still carry a `.catch` as a
 * belt-and-suspenders layer.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isPushEnabled) return;

  try {
    // FIX-EXP-NOTIFICATIONS (EXP-027/028): per-user push preference gates ALL
    // push send paths (delivery / billing / admin-initiated all call this).
    // A user who turned push off receives nothing, even if a stale subscription
    // row still exists. Single chokepoint — keep it here, not in callers.
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { pushNotificationsEnabled: true },
    });
    if (!profile?.pushNotificationsEnabled) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            // RES-22: третий аргумент отсутствовал, то есть у запроса к
            // push-сервису не было верхней границы вовсе. Адресат тут —
            // ЧУЖОЙ сервис (FCM, Mozilla, Apple), выбранный браузером
            // пользователя, и отправка идёт `Promise.all` по всем подпискам:
            // один зависший эндпоинт держал бы весь пакет и слот воркера.
            // `web-push` кладёт значение в `https.request` и на событии
            // `timeout` рвёт сокет — то есть промис ОТКЛОНЯЕТСЯ и попадает в
            // существующий `catch` ниже (410-ветка не срабатывает: кода
            // статуса у такой ошибки нет, подписка не удаляется).
            { timeout: PUSH_REQUEST_TIMEOUT_MS }
          );
          logInfo("Push sent", { userId, subscriptionId: sub.id });
        } catch (error) {
          const statusCode = getStatusCode(error);
          if (statusCode === 410) {
            try {
              await prisma.pushSubscription.delete({ where: { id: sub.id } });
            } catch (cleanupError) {
              logError("Failed to cleanup expired push subscription", {
                userId,
                subscriptionId: sub.id,
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
              });
            }
          }

          logError("Push notification failed", {
            userId,
            subscriptionId: sub.id,
            statusCode,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  } catch (error) {
    // Transient DB failure (or any other unexpected throw) — log and resolve.
    logError("Push delivery failed before dispatch", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

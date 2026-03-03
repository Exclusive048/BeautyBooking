import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { webpush } from "@/lib/notifications/push/vapid";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { statusCode?: unknown };
  return typeof record.statusCode === "number" ? record.statusCode : null;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
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
          body
        );
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
}

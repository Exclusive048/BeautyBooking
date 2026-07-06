import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { webpush, isPushEnabled } from "@/lib/notifications/push/vapid";

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
            body
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

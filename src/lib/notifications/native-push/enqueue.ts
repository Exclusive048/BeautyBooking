import "server-only";
import { logError } from "@/lib/logging/logger";
import { enqueue } from "@/lib/queue/queue";
import { createNativePushSendJob } from "@/lib/queue/types";
import { isNativePushSendingEnabled } from "@/lib/notifications/native-push/config";
import { hasPushDevices } from "@/lib/notifications/native-push/devices";
import { buildNativePushMessage, type NativePushSource } from "@/lib/notifications/native-push/payload";

/**
 * MOBILE-B2 — постановка push в приложение. Вызывается из `sendPushToUser`
 * (единая точка всех push продукта) и сама ничего не отправляет: запросы к
 * FCM / APNs / RuStore идут из воркера (`push.native.send`), где у них есть
 * повторы и таймауты, а не из запроса пользователя.
 *
 * Не бросает никогда: push — побочный канал, сбой постановки не должен ронять
 * создание уведомления (и воркер — см. HARDENING-01 FIX-4 у `sendPushToUser`).
 */
export async function enqueueNativePush(userId: string, source: NativePushSource): Promise<void> {
  try {
    if (!isNativePushSendingEnabled()) return;
    const message = buildNativePushMessage(source);
    if (!message) return;
    if (!(await hasPushDevices(userId))) return;
    await enqueue(createNativePushSendJob({ userId, message }));
  } catch (error) {
    logError("Native push enqueue failed", {
      userId,
      type: source.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

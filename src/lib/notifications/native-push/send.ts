import "server-only";
import type { MobilePushProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { getUnreadBadgeCount } from "@/lib/notifications/badge";
import {
  isNativePushSendingEnabled,
  readApnsConfig,
  readFcmConfig,
  readRustorePushConfig,
} from "@/lib/notifications/native-push/config";
import {
  deleteInvalidPushDevices,
  loadDeliverableDevices,
  type DeliverableDevice,
} from "@/lib/notifications/native-push/devices";
import { createApnsClient } from "@/lib/notifications/native-push/providers/apns";
import { createFcmClient } from "@/lib/notifications/native-push/providers/fcm";
import { createRustoreClient } from "@/lib/notifications/native-push/providers/rustore";
import type {
  NativePushOutgoing,
  NativePushProviderClient,
  NativePushSendResult,
} from "@/lib/notifications/native-push/types";
import type { NativePushSendPayload } from "@/lib/queue/types";

/**
 * MOBILE-B2 — отправка push в приложение из воркера (`push.native.send`).
 *
 * Всё, что могло поменяться с момента постановки, перечитывается здесь:
 * выключатель отправки, тумблер `pushNotificationsEnabled`, удаление аккаунта,
 * список устройств (и живость их сессий). Провайдер без настроек пропускается
 * со строкой в логе — устройство остаётся, push уйдёт, когда ключи появятся.
 *
 * В логе — id пользователя и устройства, провайдер и код ответа; ни токена, ни
 * текста уведомления (он общий, но правило одно для всех каналов).
 */

export type NativePushClients = Partial<Record<MobilePushProvider, NativePushProviderClient | null>>;

let defaultClients: Record<MobilePushProvider, NativePushProviderClient | null> | null = null;

/** Клиенты живут весь процесс воркера: кэш access token FCM, JWT и HTTP/2-сессия APNs. */
function getDefaultClients(): Record<MobilePushProvider, NativePushProviderClient | null> {
  if (!defaultClients) {
    const fcm = readFcmConfig();
    const apns = readApnsConfig();
    const rustore = readRustorePushConfig();
    defaultClients = {
      FCM: fcm ? createFcmClient(fcm) : null,
      APNS: apns ? createApnsClient(apns) : null,
      RUSTORE: rustore ? createRustoreClient(rustore) : null,
    };
  }
  return defaultClients;
}

export type NativePushProcessResult =
  | { status: "skipped"; reason: "sending-disabled" | "user-opted-out" | "no-devices" }
  | {
      status: "done";
      sent: number;
      invalid: number;
      failed: number;
      unconfigured: number;
      /** Устройства с временным сбоем — их и только их повторяет задача. */
      retryDeviceIds: string[];
    };

async function readBadge(userId: string): Promise<number | undefined> {
  try {
    const { count } = await getUnreadBadgeCount({ userId, phone: null });
    return count;
  } catch {
    // Счётчик — украшение: без него push уходит, просто без цифры на иконке.
    return undefined;
  }
}

export async function processNativePushPayload(
  payload: NativePushSendPayload,
  deps: { clients?: NativePushClients } = {},
): Promise<NativePushProcessResult> {
  if (!isNativePushSendingEnabled()) return { status: "skipped", reason: "sending-disabled" };
  const { userId } = payload;

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { pushNotificationsEnabled: true, isDeleted: true },
  });
  if (!profile || profile.isDeleted || !profile.pushNotificationsEnabled) {
    return { status: "skipped", reason: "user-opted-out" };
  }

  const devices = await loadDeliverableDevices(userId, payload.deviceIds);
  if (devices.length === 0) return { status: "skipped", reason: "no-devices" };

  const clients = deps.clients ?? getDefaultClients();
  const outgoing: NativePushOutgoing = { ...payload.message };
  const badge = await readBadge(userId);
  if (badge !== undefined) outgoing.badge = badge;

  const results = await Promise.all(
    devices.map(async (device): Promise<{ device: DeliverableDevice; result: NativePushSendResult | null }> => {
      const client = clients[device.provider] ?? null;
      if (!client) return { device, result: null };
      try {
        const result = await client.send(
          { token: device.token, apnsEnvironment: device.apnsEnvironment },
          outgoing,
        );
        return { device, result };
      } catch {
        // Клиенты не бросают по контракту; на всякий случай — как сбой сети.
        return { device, result: { outcome: "retry", reason: "CLIENT_THREW" } };
      }
    }),
  );

  const invalid: DeliverableDevice[] = [];
  const retryDeviceIds: string[] = [];
  let sent = 0;
  let failed = 0;
  let unconfigured = 0;

  for (const { device, result } of results) {
    const meta = { userId, deviceId: device.id, provider: device.provider, type: payload.message.type };
    if (result === null) {
      unconfigured += 1;
      logInfo("Native push skipped: provider not configured", meta);
      continue;
    }
    switch (result.outcome) {
      case "sent":
        sent += 1;
        break;
      case "invalid-token":
        invalid.push(device);
        logInfo("Native push token rejected, device unlinked", { ...meta, reason: result.reason });
        break;
      case "retry":
        retryDeviceIds.push(device.id);
        logError("Native push transient failure", { ...meta, reason: result.reason });
        break;
      case "failed":
        failed += 1;
        logError("Native push failed", { ...meta, reason: result.reason });
        break;
    }
  }

  if (invalid.length > 0) {
    try {
      await deleteInvalidPushDevices(invalid.map((device) => ({ id: device.id, token: device.token })));
    } catch (error) {
      logError("Native push: failed to delete rejected devices", {
        userId,
        count: invalid.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logInfo("Native push processed", {
    userId,
    type: payload.message.type,
    sent,
    invalid: invalid.length,
    failed,
    unconfigured,
    retry: retryDeviceIds.length,
  });

  return { status: "done", sent, invalid: invalid.length, failed, unconfigured, retryDeviceIds };
}

/** Только для тестов: сбросить клиентов, собранных из env. */
export function resetNativePushClientsForTests(): void {
  defaultClients = null;
}

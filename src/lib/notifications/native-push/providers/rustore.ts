import type { RustorePushConfig } from "@/lib/notifications/native-push/config";
import { readGoogleStyleError, requestJson } from "@/lib/notifications/native-push/providers/http";
import {
  NATIVE_PUSH_TTL_SECONDS,
  type NativePushOutgoing,
  type NativePushProviderClient,
  type NativePushSendResult,
} from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — RuStore Push (VK Push Notification Service), для Android-устройств
 * без сервисов Google. API повторяет FCM v1: `POST /v1/projects/{id}/messages:send`
 * с сервисным токеном проекта из RuStore Консоли (без обмена на OAuth).
 * Сервис российский — трансграничной передачи нет (в отличие от FCM/APNs).
 */

export const RUSTORE_PUSH_ORIGIN = "https://vkpns.rustore.ru";

export function rustoreSendUrl(projectId: string): string {
  return `${RUSTORE_PUSH_ORIGIN}/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
}

export function buildRustoreMessage(token: string, message: NativePushOutgoing) {
  const data: Record<string, string> = { ...message.data };
  if (typeof message.badge === "number") data.badge = String(message.badge);
  // В отличие от FCM — всегда с блоком notification, и для записи, ждущей
  // решения, тоже: у Flutter-плагина RuStore нет фонового обработчика, data-only
  // при закрытом приложении потерялся бы. Уведомление показывает сам SDK (в любом
  // состоянии приложения), поэтому кнопок «Подтвердить / Отклонить» в RuStore
  // нет — тап открывает запись по `data.link`.
  return {
    message: {
      token,
      data,
      notification: { title: message.title, body: message.body },
      android: {
        ttl: `${NATIVE_PUSH_TTL_SECONDS}s`,
        notification: {
          title: message.title,
          body: message.body,
          channel_id: message.androidChannelId,
        },
      },
    },
  };
}

/**
 * Ответ RuStore → судьба строки (документация «API для отправки push-уведомлений»):
 *  · 404 `NOT_FOUND` — push-токен не найден: удалить;
 *  · 400 `INVALID_ARGUMENT` — токен, только если об этом сказано в сообщении;
 *  · 401/403 `PERMISSION_DENIED` — сервисный токен проекта: нужен человек;
 *  · 429, 5xx — повтор.
 */
export function classifyRustoreResponse(status: number, json: unknown): NativePushSendResult {
  if (status >= 200 && status < 300) return { outcome: "sent" };
  const error = readGoogleStyleError(json);
  const code = error.status ?? `HTTP_${status}`;
  if (status === 404 || code === "NOT_FOUND") return { outcome: "invalid-token", reason: code };
  if (status === 400 && /token/i.test(error.message)) return { outcome: "invalid-token", reason: "INVALID_ARGUMENT_TOKEN" };
  if (status === 429 || status >= 500) return { outcome: "retry", reason: code };
  return { outcome: "failed", reason: code };
}

export type RustoreClientDeps = { fetchImpl?: typeof fetch };

export function createRustoreClient(config: RustorePushConfig, deps: RustoreClientDeps = {}): NativePushProviderClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return {
    provider: "RUSTORE",
    async send(target, message) {
      try {
        const res = await requestJson(fetchImpl, rustoreSendUrl(config.projectId), {
          headers: {
            Authorization: `Bearer ${config.serviceToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(buildRustoreMessage(target.token, message)),
        });
        return classifyRustoreResponse(res.status, res.json);
      } catch {
        return { outcome: "retry", reason: "NETWORK" };
      }
    },
  };
}

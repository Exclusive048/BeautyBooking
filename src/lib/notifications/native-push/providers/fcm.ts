import type { FcmConfig } from "@/lib/notifications/native-push/config";
import { parsePrivateKey, signJwt } from "@/lib/notifications/native-push/jwt";
import { isRecord, readGoogleStyleError, requestJson } from "@/lib/notifications/native-push/providers/http";
import {
  NATIVE_PUSH_TTL_SECONDS,
  type NativePushOutgoing,
  type NativePushProviderClient,
  type NativePushSendResult,
  type NativePushTarget,
} from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — Firebase Cloud Messaging, HTTP v1 API.
 *
 * Авторизация — сервисный аккаунт Google: JWT (RS256) меняется на access token
 * OAuth2 (живёт час, кэшируется до минуты до конца). Токен FCM может
 * принадлежать и Android, и iOS (Firebase сам ходит в APNs по ключу,
 * загруженному в консоль Firebase), поэтому сообщение собрано по платформам:
 *  · Android — `android.notification` с каналом, а для записи, ждущей решения
 *    мастера, — сообщение БЕЗ блока notification (только `data`): уведомление с
 *    кнопками «Подтвердить / Отклонить» строит приложение, увидев
 *    `data.actions = "BOOKING_DECISION"`;
 *  · iOS — `apns.payload.aps` с `alert`, `category`, `badge`, `thread-id`.
 */

export const FCM_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export function fcmSendUrl(projectId: string): string {
  return `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
}

export function buildFcmMessage(token: string, message: NativePushOutgoing, nowSeconds: number) {
  const data: Record<string, string> = { ...message.data };
  if (typeof message.badge === "number") data.badge = String(message.badge);
  const dataOnly = message.actions !== undefined;

  return {
    message: {
      token,
      data,
      android: {
        priority: "HIGH",
        ttl: `${NATIVE_PUSH_TTL_SECONDS}s`,
        ...(message.collapseKey ? { collapse_key: message.collapseKey } : {}),
        ...(dataOnly
          ? {}
          : {
              notification: {
                title: message.title,
                body: message.body,
                channel_id: message.androidChannelId,
                ...(message.collapseKey ? { tag: message.collapseKey } : {}),
                ...(typeof message.badge === "number" ? { notification_count: message.badge } : {}),
              },
            }),
      },
      apns: {
        headers: {
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": String(nowSeconds + NATIVE_PUSH_TTL_SECONDS),
          ...(message.collapseKey ? { "apns-collapse-id": message.collapseKey } : {}),
        },
        payload: {
          aps: {
            alert: { title: message.title, body: message.body },
            sound: "default",
            ...(typeof message.badge === "number" ? { badge: message.badge } : {}),
            ...(message.actions ? { category: message.actions } : {}),
            ...(message.threadId ? { "thread-id": message.threadId } : {}),
          },
        },
      },
    },
  };
}

const FCM_ERROR_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError";

function readFcmErrorCode(details: unknown[]): string | null {
  for (const item of details) {
    if (isRecord(item) && item["@type"] === FCM_ERROR_TYPE && typeof item.errorCode === "string") {
      return item.errorCode;
    }
  }
  return null;
}

/**
 * Ответ FCM → судьба строки. По документации FCM v1 (`ErrorCode`):
 *  · `UNREGISTERED` (404) — токен больше не действует;
 *  · `SENDER_ID_MISMATCH` (403) — токен другого проекта Firebase;
 *  · `INVALID_ARGUMENT` (400) — битый запрос ИЛИ битый токен; токеном считаем,
 *    только если об этом сказано в сообщении (иначе удалили бы живые токены
 *    из-за своей же ошибки в форме запроса);
 *  · `QUOTA_EXCEEDED` (429), `UNAVAILABLE` (503), `INTERNAL` (500) — повтор;
 *  · `UNAUTHENTICATED` (401) — протух access token: повтор со свежим;
 *  · `THIRD_PARTY_AUTH_ERROR` — сломан ключ APNs в консоли Firebase: повтор не
 *    поможет, нужен человек.
 */
export function classifyFcmResponse(status: number, json: unknown): NativePushSendResult {
  if (status >= 200 && status < 300) return { outcome: "sent" };
  const error = readGoogleStyleError(json);
  const code = readFcmErrorCode(error.details) ?? error.status ?? `HTTP_${status}`;

  if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH" || status === 404) {
    return { outcome: "invalid-token", reason: code };
  }
  if (code === "INVALID_ARGUMENT" && /registration token/i.test(error.message)) {
    return { outcome: "invalid-token", reason: "INVALID_ARGUMENT_TOKEN" };
  }
  if (code === "THIRD_PARTY_AUTH_ERROR") return { outcome: "failed", reason: code };
  if (status === 401 || code === "UNAUTHENTICATED") return { outcome: "retry", reason: "UNAUTHENTICATED" };
  if (status === 429 || status >= 500 || code === "QUOTA_EXCEEDED" || code === "UNAVAILABLE" || code === "INTERNAL") {
    return { outcome: "retry", reason: code };
  }
  return { outcome: "failed", reason: code };
}

type AccessToken = { value: string; expiresAtMs: number };

export type FcmClientDeps = { fetchImpl?: typeof fetch; now?: () => number };

export function createFcmClient(config: FcmConfig, deps: FcmClientDeps = {}): NativePushProviderClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  let cached: AccessToken | null = null;
  let pending: Promise<AccessToken | NativePushSendResult> | null = null;

  async function fetchAccessToken(): Promise<AccessToken | NativePushSendResult> {
    let assertion: string;
    try {
      const iat = Math.floor(now() / 1000);
      assertion = signJwt(
        "RS256",
        {},
        { iss: config.clientEmail, scope: FCM_SCOPE, aud: FCM_TOKEN_URL, iat, exp: iat + 3600 },
        parsePrivateKey(config.privateKey),
      );
    } catch {
      return { outcome: "failed", reason: "FCM_PRIVATE_KEY_INVALID" };
    }
    try {
      const res = await requestJson(fetchImpl, FCM_TOKEN_URL, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
      });
      const json = isRecord(res.json) ? res.json : {};
      if (res.status >= 200 && res.status < 300 && typeof json.access_token === "string") {
        const ttlSeconds = typeof json.expires_in === "number" ? json.expires_in : 3600;
        return { value: json.access_token, expiresAtMs: now() + ttlSeconds * 1000 };
      }
      // 400/401 `invalid_grant` — ключ отозван или не тот аккаунт: нужен человек.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return { outcome: "failed", reason: "FCM_OAUTH_REJECTED" };
      }
      return { outcome: "retry", reason: `FCM_OAUTH_HTTP_${res.status}` };
    } catch {
      return { outcome: "retry", reason: "FCM_OAUTH_NETWORK" };
    }
  }

  async function getAccessToken(): Promise<AccessToken | NativePushSendResult> {
    if (cached && cached.expiresAtMs - 60_000 > now()) return cached;
    if (!pending) {
      pending = fetchAccessToken().finally(() => {
        pending = null;
      });
    }
    const result = await pending;
    if ("value" in result) cached = result;
    return result;
  }

  async function sendOnce(target: NativePushTarget, message: NativePushOutgoing): Promise<NativePushSendResult> {
    const token = await getAccessToken();
    if (!("value" in token)) return token;
    try {
      const res = await requestJson(fetchImpl, fcmSendUrl(config.projectId), {
        headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(buildFcmMessage(target.token, message, Math.floor(now() / 1000))),
      });
      const result = classifyFcmResponse(res.status, res.json);
      if (result.outcome === "retry" && result.reason === "UNAUTHENTICATED") cached = null;
      return result;
    } catch {
      return { outcome: "retry", reason: "NETWORK" };
    }
  }

  return {
    provider: "FCM",
    async send(target, message) {
      const first = await sendOnce(target, message);
      // Протухший access token — сразу второй заход со свежим, не ждать повтора задачи.
      if (first.outcome === "retry" && first.reason === "UNAUTHENTICATED") return sendOnce(target, message);
      return first;
    },
  };
}

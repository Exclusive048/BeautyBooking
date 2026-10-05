import http2 from "node:http2";
import type { KeyObject } from "node:crypto";
import type { ApnsConfig } from "@/lib/notifications/native-push/config";
import { parsePrivateKey, signJwt } from "@/lib/notifications/native-push/jwt";
import { isRecord } from "@/lib/notifications/native-push/providers/http";
import {
  NATIVE_PUSH_REQUEST_TIMEOUT_MS,
  NATIVE_PUSH_TTL_SECONDS,
  type NativePushOutgoing,
  type NativePushProviderClient,
  type NativePushSendResult,
  type NativePushTarget,
} from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — Apple Push Notification service, провайдерский токен (`.p8`).
 *
 * APNs говорит только по HTTP/2 — `fetch` (undici) этого не умеет, поэтому
 * транспорт — `node:http2` с одной долгоживущей сессией на хост (так просит
 * Apple: не открывать соединение на каждое уведомление). Окружение
 * (sandbox / production) — у каждого устройства своё: сборка из Xcode/TestFlight
 * выдаёт sandbox-токены, App Store — production. JWT провайдера (ES256) живёт до
 * часа и не чаще раза в 20 минут — обновляем раз в 50 минут.
 */

export const APNS_PRODUCTION_ORIGIN = "https://api.push.apple.com";
export const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000;

export type ApnsHttpResponse = { status: number; body: string };

/** Транспорт отдельно — тесты подменяют его, не поднимая HTTP/2. */
export interface ApnsTransport {
  post(
    origin: string,
    path: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
  ): Promise<ApnsHttpResponse>;
}

export function createHttp2Transport(): ApnsTransport {
  const sessions = new Map<string, http2.ClientHttp2Session>();

  function getSession(origin: string): http2.ClientHttp2Session {
    const existing = sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = http2.connect(origin);
    const forget = () => {
      if (sessions.get(origin) === session) sessions.delete(origin);
    };
    // Ошибка сессии ляжет на поток (`req.on("error")`); здесь — только забыть её,
    // чтобы следующий запрос открыл новую.
    session.on("error", forget);
    session.on("goaway", forget);
    session.on("close", forget);
    // Простаивающая сессия не держит процесс при остановке воркера.
    session.unref();
    sessions.set(origin, session);
    return session;
  }

  return {
    post(origin, path, headers, body, timeoutMs) {
      return new Promise<ApnsHttpResponse>((resolve, reject) => {
        let req: http2.ClientHttp2Stream;
        try {
          req = getSession(origin).request({ ":method": "POST", ":path": path, ...headers });
        } catch (error) {
          reject(error instanceof Error ? error : new Error("APNS_CONNECT"));
          return;
        }
        let status = 0;
        let data = "";
        const timer = setTimeout(() => {
          req.close(http2.constants.NGHTTP2_CANCEL);
          reject(new Error("APNS_TIMEOUT"));
        }, timeoutMs);
        req.setEncoding("utf8");
        req.on("response", (responseHeaders) => {
          status = Number(responseHeaders[":status"] ?? 0);
        });
        req.on("data", (chunk: string) => {
          data += chunk;
        });
        req.on("end", () => {
          clearTimeout(timer);
          resolve({ status, body: data });
        });
        req.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        req.end(body);
      });
    },
  };
}

export function buildApnsPayload(message: NativePushOutgoing) {
  return {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
      ...(typeof message.badge === "number" ? { badge: message.badge } : {}),
      ...(message.actions ? { category: message.actions } : {}),
      ...(message.threadId ? { "thread-id": message.threadId } : {}),
    },
    // Ключи `data` — на верхнем уровне, рядом с `aps` (так их читает и
    // firebase_messaging, и нативный код): одна форма с Android.
    ...message.data,
    ...(typeof message.badge === "number" ? { badge: String(message.badge) } : {}),
  };
}

export function buildApnsHeaders(
  bundleId: string,
  providerToken: string,
  message: NativePushOutgoing,
  nowSeconds: number,
): Record<string, string> {
  return {
    authorization: `bearer ${providerToken}`,
    "apns-topic": bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(nowSeconds + NATIVE_PUSH_TTL_SECONDS),
    ...(message.collapseKey ? { "apns-collapse-id": message.collapseKey } : {}),
    "content-type": "application/json",
  };
}

/**
 * Ответ APNs → судьба строки (Apple, «Handling notification responses»):
 *  · 410 `Unregistered` / `ExpiredToken`, 400 `BadDeviceToken`,
 *    `DeviceTokenNotForTopic` — токена больше нет или он от другого приложения;
 *  · 403 `ExpiredProviderToken` / `InvalidProviderToken` — наш JWT: новый и повтор;
 *  · 429, 500, 503 — повтор;
 *  · прочее (`BadTopic`, `PayloadTooLarge`, `MissingTopic`…) — наша ошибка: лог.
 */
export function classifyApnsResponse(status: number, body: string): NativePushSendResult {
  if (status === 200) return { outcome: "sent" };
  let reason = `HTTP_${status}`;
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && typeof parsed.reason === "string") reason = parsed.reason;
  } catch {
    // тело не JSON — остаётся код статуса
  }
  if (
    status === 410 ||
    reason === "BadDeviceToken" ||
    reason === "DeviceTokenNotForTopic" ||
    reason === "Unregistered" ||
    reason === "ExpiredToken"
  ) {
    return { outcome: "invalid-token", reason };
  }
  if (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") return { outcome: "retry", reason };
  if (status === 429 || status >= 500) return { outcome: "retry", reason };
  return { outcome: "failed", reason };
}

const DEVICE_TOKEN_PATTERN = /^[0-9a-fA-F]{32,200}$/;

export type ApnsClientDeps = { transport?: ApnsTransport; now?: () => number };

export function createApnsClient(config: ApnsConfig, deps: ApnsClientDeps = {}): NativePushProviderClient {
  const now = deps.now ?? Date.now;
  let transport = deps.transport ?? null;
  let key: KeyObject | null = null;
  let providerToken: { value: string; issuedAtMs: number } | null = null;

  function getProviderToken(): string | null {
    if (providerToken && now() - providerToken.issuedAtMs < PROVIDER_TOKEN_TTL_MS) return providerToken.value;
    try {
      key ??= parsePrivateKey(config.privateKey);
      const issuedAtMs = now();
      const value = signJwt("ES256", { kid: config.keyId }, { iss: config.teamId, iat: Math.floor(issuedAtMs / 1000) }, key);
      providerToken = { value, issuedAtMs };
      return value;
    } catch {
      return null;
    }
  }

  async function sendOnce(target: NativePushTarget, message: NativePushOutgoing): Promise<NativePushSendResult> {
    const jwt = getProviderToken();
    if (!jwt) return { outcome: "failed", reason: "APNS_PRIVATE_KEY_INVALID" };
    const origin = target.apnsEnvironment === "SANDBOX" ? APNS_SANDBOX_ORIGIN : APNS_PRODUCTION_ORIGIN;
    transport ??= createHttp2Transport();
    try {
      const res = await transport.post(
        origin,
        `/3/device/${target.token}`,
        buildApnsHeaders(config.bundleId, jwt, message, Math.floor(now() / 1000)),
        JSON.stringify(buildApnsPayload(message)),
        NATIVE_PUSH_REQUEST_TIMEOUT_MS,
      );
      const result = classifyApnsResponse(res.status, res.body);
      if (result.outcome === "retry" && (result.reason === "ExpiredProviderToken" || result.reason === "InvalidProviderToken")) {
        providerToken = null;
      }
      return result;
    } catch {
      return { outcome: "retry", reason: "NETWORK" };
    }
  }

  return {
    provider: "APNS",
    async send(target, message) {
      // Токен идёт в путь запроса — чужие символы туда не пускаем.
      if (!DEVICE_TOKEN_PATTERN.test(target.token)) return { outcome: "invalid-token", reason: "MALFORMED_TOKEN" };
      const first = await sendOnce(target, message);
      if (first.outcome === "retry" && first.reason === "ExpiredProviderToken") return sendOnce(target, message);
      return first;
    },
  };
}

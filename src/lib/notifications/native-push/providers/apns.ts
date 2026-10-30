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

/**
 * APNS-SESSION-RESET (находка A-07, 2026-10-30): простой сессии дольше этого —
 * перед повторным использованием она проверяется PING'ом.
 */
export const APNS_IDLE_PING_AFTER_MS = 60_000;
/** Сколько ждать ответа на PING, прежде чем считать соединение мёртвым. */
export const APNS_PING_TIMEOUT_MS = 3_000;

export type Http2TransportDeps = {
  connect?: (origin: string) => http2.ClientHttp2Session;
  now?: () => number;
  pingTimeoutMs?: number;
};

/**
 * APNS-SESSION-RESET (находка A-07, 2026-10-30). Долгоживущее соединение к
 * APNs может умереть МОЛЧА: NAT или фаервол облака выбрасывает простаивающее
 * соединение без RST, пакеты просто теряются. Сессия при этом не `closed` и не
 * `destroyed`, и прежний кэш отдавал её снова: каждый запрос ждал 10 с таймаута,
 * закрывался только поток, а сессия оставалась в Map — все повторы
 * `push.native.send` шли в то же мёртвое соединение, пока ядро через ~15 минут
 * ретрансмиссий не объявит TCP мёртвым. Отсюда два правила:
 *  · таймаут запроса или ошибка потока — соединение уничтожается и забывается,
 *    следующий запрос открывает новое (другие потоки этой сессии тоже
 *    оборвутся — для них это повтор, а не потеря);
 *  · сессия, простоявшая дольше `APNS_IDLE_PING_AFTER_MS`, перед использованием
 *    проверяется PING'ом; нет ответа за `APNS_PING_TIMEOUT_MS` — новое
 *    соединение. Без этого первый push после ночи тратил бы 10 с таймаута и
 *    попытку повтора на соединение, которого уже нет.
 */
export function createHttp2Transport(deps: Http2TransportDeps = {}): ApnsTransport {
  const connect = deps.connect ?? ((origin: string) => http2.connect(origin));
  const now = deps.now ?? Date.now;
  const pingTimeoutMs = deps.pingTimeoutMs ?? APNS_PING_TIMEOUT_MS;
  const sessions = new Map<string, { session: http2.ClientHttp2Session; lastUsedAt: number }>();

  function forget(origin: string, session: http2.ClientHttp2Session) {
    if (sessions.get(origin)?.session === session) sessions.delete(origin);
  }

  function drop(origin: string, session: http2.ClientHttp2Session) {
    forget(origin, session);
    if (!session.destroyed) session.destroy();
  }

  function open(origin: string): http2.ClientHttp2Session {
    const session = connect(origin);
    // Ошибка сессии ляжет на поток (`req.on("error")`); здесь — только забыть её,
    // чтобы следующий запрос открыл новую.
    session.on("error", () => forget(origin, session));
    session.on("goaway", () => forget(origin, session));
    session.on("close", () => forget(origin, session));
    // Простаивающая сессия не держит процесс при остановке воркера.
    session.unref();
    sessions.set(origin, { session, lastUsedAt: now() });
    return session;
  }

  function answersPing(session: http2.ClientHttp2Session): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), pingTimeoutMs);
      try {
        const sent = session.ping((error) => {
          clearTimeout(timer);
          resolve(!error);
        });
        if (!sent) {
          clearTimeout(timer);
          resolve(false);
        }
      } catch {
        clearTimeout(timer);
        resolve(false);
      }
    });
  }

  async function getSession(origin: string): Promise<http2.ClientHttp2Session> {
    const entry = sessions.get(origin);
    if (entry && !entry.session.closed && !entry.session.destroyed) {
      const idle = now() - entry.lastUsedAt >= APNS_IDLE_PING_AFTER_MS;
      if (!idle || (await answersPing(entry.session))) {
        entry.lastUsedAt = now();
        return entry.session;
      }
      drop(origin, entry.session);
    }
    return open(origin);
  }

  return {
    async post(origin, path, headers, body, timeoutMs) {
      const session = await getSession(origin);
      return new Promise<ApnsHttpResponse>((resolve, reject) => {
        let settled = false;
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // Поток, не дождавшийся ответа, — признак мёртвого соединения:
          // переиспользовать его значит отправить и повтор туда же.
          drop(origin, session);
          reject(error);
        };
        let req: http2.ClientHttp2Stream;
        try {
          req = session.request({ ":method": "POST", ":path": path, ...headers });
        } catch (error) {
          drop(origin, session);
          reject(error instanceof Error ? error : new Error("APNS_CONNECT"));
          return;
        }
        let status = 0;
        let data = "";
        const timer = setTimeout(() => {
          req.close(http2.constants.NGHTTP2_CANCEL);
          fail(new Error("APNS_TIMEOUT"));
        }, timeoutMs);
        req.setEncoding("utf8");
        req.on("response", (responseHeaders) => {
          status = Number(responseHeaders[":status"] ?? 0);
        });
        req.on("data", (chunk: string) => {
          data += chunk;
        });
        req.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const entry = sessions.get(origin);
          if (entry?.session === session) entry.lastUsedAt = now();
          resolve({ status, body: data });
        });
        req.on("error", (error) => fail(error));
        // Поток, закрытый без ответа (сессию уничтожил таймаут соседнего потока),
        // не должен ждать своих 10 с.
        req.on("close", () => fail(new Error("APNS_STREAM_CLOSED")));
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

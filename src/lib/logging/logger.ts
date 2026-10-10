import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { sendAlertWithCooldown } from "@/lib/monitoring/alert-cooldown";

export type LogMeta = Record<string, unknown>;

type RequestContext = {
  requestId: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function withRequestId<T>(requestId: string, fn: () => T): T {
  const normalized = normalizeRequestId(requestId) ?? randomUUID();
  return requestContext.run({ requestId: normalized }, fn);
}

export function logInfo(message: string, meta: LogMeta = {}) {
  const { requestId: rawRequestId, ...restMeta } = meta;
  const requestId = normalizeRequestId(rawRequestId) ?? getRequestId();
  console.log(
    JSON.stringify({
      level: "info",
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...restMeta,
    })
  );
}

const ERROR_RATE_WINDOW_MS = 5 * 60_000;
const ERROR_RATE_CRITICAL_THRESHOLD = 5;
const errorTimestamps: number[] = [];

/**
 * OPS-ALERT-COOLDOWN-ON-LOGERROR. Алерт из `logError` — с паузой по тексту
 * сообщения: одна и та же ошибка шлёт в Telegram одно сообщение за окно, а
 * следующее несёт число скрытых повторов. Тексты `logError` — это имена
 * событий («GET /api/… failed», «Redis client error»), id в них не вклеиваются,
 * поэтому группировка по тексту и есть группировка по смыслу. Детали первого
 * случая (requestId, стек, маршрут) уходят в алерт как прежде.
 *
 * `connect: false`: соединение с Redis ради алерта не открывается — иначе
 * скрипт (`deploy:post`), записавший ошибку, не завершился бы сам; без
 * открытого соединения пауза держится в памяти процесса.
 */
const LOG_ERROR_ALERT_COOLDOWN_MS = 5 * 60_000;
const LOG_ERROR_ALERT_KEY_PREFIX = "log-error:";
const ERROR_RATE_ALERT_KEY = "log-error:rate";

/** Длина уточнения группы в ключе: хватает различить события, ключ не пухнет. */
const ALERT_GROUP_MAX_LENGTH = 200;

function alertLoggedError(
  level: "error" | "critical",
  message: string,
  context: LogMeta,
  key: string,
  cooldownMs: number
): void {
  void sendAlertWithCooldown(level, message, context, { key, cooldownMs, connect: false }).catch(
    () => undefined
  );
}

/**
 * Ключ паузы алерта. Обычно — текст сообщения. Где под одним текстом живут
 * РАЗНЫЕ события (`[client-error-boundary]` — любое падение страницы в
 * браузере), вызывающий уточняет группу полем `__alertGroup`: иначе второе,
 * другое падение молчало бы пять минут за первым.
 */
function logErrorAlertKey(message: string, alertGroup: unknown): string {
  const base = `${LOG_ERROR_ALERT_KEY_PREFIX}${message}`;
  if (typeof alertGroup !== "string" || alertGroup.trim().length === 0) return base;
  return `${base}:${alertGroup.trim().slice(0, ALERT_GROUP_MAX_LENGTH)}`;
}

function trackErrorRate(message: string, requestId: string): void {
  const now = Date.now();
  errorTimestamps.push(now);
  while (errorTimestamps.length > 0 && now - errorTimestamps[0]! > ERROR_RATE_WINDOW_MS) {
    errorTimestamps.shift();
  }
  // Пока частота выше порога — напоминание раз в окно (раньше алерт был только
  // в момент пересечения порога, и затяжной шторм выглядел одним сообщением).
  if (errorTimestamps.length >= ERROR_RATE_CRITICAL_THRESHOLD) {
    alertLoggedError(
      "critical",
      "Высокая частота ошибок API",
      {
        countInWindow: errorTimestamps.length,
        windowMinutes: ERROR_RATE_WINDOW_MS / 60_000,
        lastMessage: message,
        lastRequestId: requestId,
      },
      ERROR_RATE_ALERT_KEY,
      ERROR_RATE_WINDOW_MS
    );
  }
}

export function logError(message: string, meta: LogMeta = {}) {
  const { requestId: rawRequestId, __alertGroup: alertGroup, ...restMeta } = meta;
  const requestId = normalizeRequestId(rawRequestId) ?? getRequestId();
  console.error(
    JSON.stringify({
      level: "error",
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...restMeta,
    })
  );
  const skipAlert = Boolean((meta as { __skipAlert?: boolean }).__skipAlert);
  if (typeof window === "undefined" && !skipAlert) {
    alertLoggedError(
      "error",
      message,
      { requestId, ...restMeta },
      logErrorAlertKey(message, alertGroup),
      LOG_ERROR_ALERT_COOLDOWN_MS
    );
    trackErrorRate(message, requestId);
  }
}

export function getRequestId(req?: Request): string {
  const headerRequestId = req ? normalizeRequestId(req.headers.get("x-request-id")) : null;
  if (headerRequestId) {
    const current = requestContext.getStore()?.requestId;
    if (current !== headerRequestId) {
      requestContext.enterWith({ requestId: headerRequestId });
    }
    return headerRequestId;
  }

  const contextRequestId = requestContext.getStore()?.requestId;
  if (contextRequestId) return contextRequestId;

  const generated = randomUUID();
  requestContext.enterWith({ requestId: generated });
  return generated;
}

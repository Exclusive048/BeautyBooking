import { createHash } from "crypto";
import { env, isProduction } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import { sendAlert, type AlertContext, type AlertLevel } from "@/lib/monitoring/alert";
import {
  getRedisConnection,
  peekRedisConnection,
  withRedisCommandTimeout,
} from "@/lib/redis/connection";

/**
 * OPS-ALERT-COOLDOWN-ON-LOGERROR — пауза для ops-алертов в Telegram: одно
 * сообщение на событие за окно, а не по сообщению на каждую запись.
 *
 * Пауза жила только в `sendTelegramAlert` (`alerts.ts`), а самый частый путь —
 * `logError` → `sendAlert` — шёл мимо неё: одна запись об ошибке = один запрос
 * к Telegram Bot API. Живой случай 2026-10-10: приостановленный аккаунт Object
 * Storage давал отдельный ERROR на каждое фото страницы. Под штормом такой
 * канал упирается в лимит самого Telegram (429) и глохнет ровно тогда, когда
 * нужен. Тем же страдали «подробные» алерты `api-alerts.ts`: к каждому
 * событию шёл второй, уже без паузы (неявка воркера — на каждый опрос
 * `/api/health/status`, перебор OTP — на каждую попытку).
 *
 * Здесь пауза — одна для всех:
 *   · общий счётчик в Redis (`SET NX PX`, ключ — sha256 ключа события), чтобы
 *     web, api и воркер не слали по копии;
 *   · без Redis — пауза в памяти процесса (было и раньше);
 *   · процесс помнит, что ключ на паузе, и не спрашивает Redis на каждую
 *     запись: под штормом это и есть основная экономия;
 *   · одновременные записи по одному ключу ждут одного ответа Redis, а не
 *     спрашивают каждая (`pendingKeys`);
 *   · скрытые повторы считаются, и алерт по ключу несёт их число
 *     (`suppressedRepeats`: сколько записей этот процесс промолчал до этой
 *     отправки, включая пришедшие, пока решалось, слать ли её) — иначе один
 *     алерт за пять минут неотличим от тысячи ошибок за те же пять минут.
 *
 * Вне production ничего не делается: `sendAlert` там и так не отправляет.
 */

const ALERT_COOLDOWN_KEY_PREFIX = "mon:alert:cooldown:";
const COOLDOWN_DEGRADED_LOG_INTERVAL_MS = 60_000;

/**
 * Когда Redis ответил «уже на паузе», процесс не знает, сколько ей осталось
 * (TTL не спрашиваем — лишняя команда). Перепроверяем не чаще раза в минуту.
 */
const SHARED_COOLDOWN_RECHECK_MS = 60_000;

/** Потолок ключей в памяти: ключ — текст события, а тексты бывают с id. */
const MAX_TRACKED_KEYS = 1_000;

export const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60_000;

/** Ключ события → момент, до которого этот процесс считает его на паузе. */
const localCooldownUntil = new Map<string, number>();
/** Ключ события → сколько раз этот процесс промолчал с прошлого алерта. */
const suppressedByKey = new Map<string, number>();
/**
 * Ключи, по которым процесс уже ждёт ответа Redis. Пачка одинаковых ошибок в
 * одном тике иначе прошла бы проверку памяти целиком (ответа ещё нет) — и
 * отправила бы по команде Redis и, без Redis, по алерту на каждую запись.
 */
const pendingKeys = new Set<string>();
let lastCooldownDegradedLogAt = 0;

type SharedCooldownResult = "sent" | "cooldown" | "degraded" | "no-connection";

export type AlertCooldownOptions = {
  key: string;
  cooldownMs?: number;
  /**
   * `true` — открыть соединение с Redis, если процесс его ещё не открыл (так
   * всегда работал `sendTelegramAlert`). `false` — только уже открытое: алерт
   * из `logError` не должен открывать соединение в скрипте, которому Redis не
   * нужен (см. `peekRedisConnection`).
   */
  connect?: boolean;
};

function buildCooldownStoreKey(alertKey: string): string {
  const digest = createHash("sha256").update(alertKey).digest("hex");
  return `${ALERT_COOLDOWN_KEY_PREFIX}${digest}`;
}

/** Запомнить значение, не давая карте расти без предела (старейший ключ уходит). */
function setBounded<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  while (map.size >= MAX_TRACKED_KEYS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  map.set(key, value);
}

function setLocalCooldown(key: string, until: number, now: number): void {
  if (localCooldownUntil.size >= MAX_TRACKED_KEYS) {
    for (const [storedKey, storedUntil] of localCooldownUntil) {
      if (storedUntil <= now) localCooldownUntil.delete(storedKey);
    }
  }
  setBounded(localCooldownUntil, key, until);
}

async function acquireSharedCooldown(
  alertKey: string,
  cooldownMs: number,
  connect: boolean,
): Promise<SharedCooldownResult> {
  const pending = connect ? getRedisConnection() : peekRedisConnection();
  if (!pending) return "no-connection";
  const client = await pending;
  if (!client) return "degraded";

  const result = await withRedisCommandTimeout(
    "monitoring:alerts:cooldown-set",
    client.set(buildCooldownStoreKey(alertKey), String(Date.now()), {
      NX: true,
      PX: cooldownMs,
    }),
  );
  return result === "OK" ? "sent" : "cooldown";
}

function maybeLogCooldownDegraded(message: string, details: Record<string, unknown>): void {
  const now = Date.now();
  if (now - lastCooldownDegradedLogAt < COOLDOWN_DEGRADED_LOG_INTERVAL_MS) return;
  lastCooldownDegradedLogAt = now;
  logError(message, { ...details, __skipAlert: true });
}

/**
 * Можно ли этому вызывающему отправить алерт по ключу сейчас. `true` — пауза
 * взята (общая или, без Redis, в памяти); `false` — по ключу уже отправлено.
 * Не бросает: сбой хранилища паузы сводится к паузе в памяти.
 */
export async function acquireAlertCooldown(
  alertKey: string,
  cooldownMs: number,
  options: { connect: boolean },
): Promise<boolean> {
  const now = Date.now();
  if ((localCooldownUntil.get(alertKey) ?? 0) > now) return false;
  // Решение по ключу уже принимается — отправит (или нет) тот, кто спросил первым.
  if (pendingKeys.has(alertKey)) return false;

  pendingKeys.add(alertKey);
  let shared: SharedCooldownResult;
  try {
    shared = await acquireSharedCooldown(alertKey, cooldownMs, options.connect);
  } catch (error) {
    if (isProduction) {
      maybeLogCooldownDegraded("Alert cooldown check failed; using local protective cooldown", {
        alertKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    shared = "degraded";
  } finally {
    pendingKeys.delete(alertKey);
  }

  const settledAt = Date.now();
  if (shared === "cooldown") {
    setLocalCooldown(alertKey, settledAt + Math.min(cooldownMs, SHARED_COOLDOWN_RECHECK_MS), settledAt);
    return false;
  }
  if (shared === "degraded" && isProduction) {
    maybeLogCooldownDegraded("Alert cooldown shared store unavailable; using local protective cooldown", {
      alertKey,
    });
  }
  // «sent» — пауза взята в Redis; «degraded» / «no-connection» — пауза в памяти.
  setLocalCooldown(alertKey, settledAt + cooldownMs, settledAt);
  return true;
}

function takeSuppressed(key: string): number {
  const count = suppressedByKey.get(key) ?? 0;
  suppressedByKey.delete(key);
  return count;
}

function noteSuppressed(key: string): void {
  setBounded(suppressedByKey, key, (suppressedByKey.get(key) ?? 0) + 1);
}

/**
 * Алерт с паузой по ключу события. `true` — отправка ушла (в `sendAlert`),
 * `false` — промолчали: не production либо ключ на паузе.
 */
export async function sendAlertWithCooldown(
  level: AlertLevel,
  message: string,
  context: AlertContext | undefined,
  options: AlertCooldownOptions,
): Promise<boolean> {
  if (env.NODE_ENV !== "production") return false;
  const cooldownMs = options.cooldownMs ?? DEFAULT_ALERT_COOLDOWN_MS;
  const acquired = await acquireAlertCooldown(options.key, cooldownMs, {
    connect: options.connect ?? true,
  });
  if (!acquired) {
    noteSuppressed(options.key);
    return false;
  }
  const suppressed = takeSuppressed(options.key);
  void sendAlert(level, message, suppressed > 0 ? { ...context, suppressedRepeats: suppressed } : context);
  return true;
}

import { createHash } from "crypto";
import { alertWarning } from "@/lib/monitoring";
import { logError } from "@/lib/logging/logger";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

const ERROR_WINDOW_MS = 60_000;
const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60_000;
const ALERT_COOLDOWN_KEY_PREFIX = "mon:alert:cooldown:";
const isProduction = process.env.NODE_ENV === "production";
const COOLDOWN_DEGRADED_LOG_INTERVAL_MS = 60_000;

const errorCounts = new Map<string, number[]>();
const lastAlertAt = new Map<string, number>();
let lastCooldownDegradedLogAt = 0;

export function trackError(key: string): number {
  const now = Date.now();
  const timestamps = (errorCounts.get(key) ?? []).filter((timestamp) => now - timestamp < ERROR_WINDOW_MS);
  timestamps.push(now);
  errorCounts.set(key, timestamps);
  return timestamps.length;
}

function buildCooldownStoreKey(alertKey: string): string {
  const digest = createHash("sha256").update(alertKey).digest("hex");
  return `${ALERT_COOLDOWN_KEY_PREFIX}${digest}`;
}

async function acquireSharedCooldown(
  alertKey: string,
  cooldownMs: number
): Promise<"sent" | "cooldown" | "degraded"> {
  const client = await getRedisConnection();
  if (!client) {
    return "degraded";
  }

  const result = await withRedisCommandTimeout(
    "monitoring:alerts:cooldown-set",
    client.set(buildCooldownStoreKey(alertKey), String(Date.now()), {
      NX: true,
      PX: cooldownMs,
    })
  );
  if (result === "OK") {
    return "sent";
  }
  return "cooldown";
}

function acquireMemoryCooldown(alertKey: string, cooldownMs: number): boolean {
  const now = Date.now();
  const lastSentAt = lastAlertAt.get(alertKey) ?? 0;
  if (now - lastSentAt < cooldownMs) {
    return false;
  }
  lastAlertAt.set(alertKey, now);
  return true;
}

function maybeLogCooldownDegraded(message: string, details: Record<string, unknown>): void {
  const now = Date.now();
  if (now - lastCooldownDegradedLogAt < COOLDOWN_DEGRADED_LOG_INTERVAL_MS) return;
  lastCooldownDegradedLogAt = now;
  logError(message, { ...details, __skipAlert: true });
}

export async function sendTelegramAlert(
  message: string,
  alertKey?: string,
  cooldownMs = DEFAULT_ALERT_COOLDOWN_MS
): Promise<boolean> {
  const normalizedAlertKey = alertKey?.trim() || message;
  try {
    const sharedCooldown = await acquireSharedCooldown(normalizedAlertKey, cooldownMs);
    if (sharedCooldown === "cooldown") {
      return false;
    }

    if (sharedCooldown === "degraded") {
      if (isProduction) {
        maybeLogCooldownDegraded("Alert cooldown shared store unavailable; using local protective cooldown", {
          alertKey: normalizedAlertKey,
        });
      }
      if (!acquireMemoryCooldown(normalizedAlertKey, cooldownMs)) {
        return false;
      }
    }
  } catch (error) {
    if (isProduction) {
      maybeLogCooldownDegraded("Alert cooldown check failed; using local protective cooldown", {
        alertKey: normalizedAlertKey,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      logError("Alert cooldown check failed; fallback policy applied", {
        alertKey: normalizedAlertKey,
        error: error instanceof Error ? error.message : String(error),
        __skipAlert: true,
      });
    }

    if (!acquireMemoryCooldown(normalizedAlertKey, cooldownMs)) {
      return false;
    }
  }

  void alertWarning(message, { alertKey: normalizedAlertKey, __skipAlert: true });
  return true;
}

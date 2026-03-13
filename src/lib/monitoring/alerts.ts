import { createHash } from "crypto";
import { alertWarning } from "@/lib/monitoring";
import { logError } from "@/lib/logging/logger";
import { getRedisConnection } from "@/lib/redis/connection";

const ERROR_WINDOW_MS = 60_000;
const ALERT_COOLDOWN_MS = 5 * 60_000;
const ALERT_COOLDOWN_KEY_PREFIX = "mon:alert:cooldown:";
const isProduction = process.env.NODE_ENV === "production";

const errorCounts = new Map<string, number[]>();
const lastAlertAt = new Map<string, number>();

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

async function acquireSharedCooldown(alertKey: string): Promise<"sent" | "cooldown" | "degraded"> {
  const client = await getRedisConnection();
  if (!client) {
    return "degraded";
  }

  const result = await client.set(buildCooldownStoreKey(alertKey), String(Date.now()), {
    NX: true,
    PX: ALERT_COOLDOWN_MS,
  });
  if (result === "OK") {
    return "sent";
  }
  return "cooldown";
}

function acquireMemoryCooldown(alertKey: string): boolean {
  const now = Date.now();
  const lastSentAt = lastAlertAt.get(alertKey) ?? 0;
  if (now - lastSentAt < ALERT_COOLDOWN_MS) {
    return false;
  }
  lastAlertAt.set(alertKey, now);
  return true;
}

export async function sendTelegramAlert(message: string, alertKey?: string): Promise<boolean> {
  const normalizedAlertKey = alertKey?.trim() || message;
  try {
    const sharedCooldown = await acquireSharedCooldown(normalizedAlertKey);
    if (sharedCooldown === "cooldown") {
      return false;
    }

    if (sharedCooldown === "degraded") {
      if (isProduction) {
        logError("Alert cooldown shared store unavailable; sending alert without cooldown", {
          alertKey: normalizedAlertKey,
          __skipAlert: true,
        });
      } else if (!acquireMemoryCooldown(normalizedAlertKey)) {
        return false;
      }
    }
  } catch (error) {
    logError("Alert cooldown check failed; fallback policy applied", {
      alertKey: normalizedAlertKey,
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });

    if (!isProduction && !acquireMemoryCooldown(normalizedAlertKey)) {
      return false;
    }
  }

  void alertWarning(message, { alertKey: normalizedAlertKey, __skipAlert: true });
  return true;
}

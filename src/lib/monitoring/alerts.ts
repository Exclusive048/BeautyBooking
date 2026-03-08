import { alertWarning } from "@/lib/monitoring";

const ERROR_WINDOW_MS = 60_000;
const ALERT_COOLDOWN_MS = 5 * 60_000;

const errorCounts = new Map<string, number[]>();
const lastAlertAt = new Map<string, number>();

export function trackError(key: string): number {
  const now = Date.now();
  const timestamps = (errorCounts.get(key) ?? []).filter((timestamp) => now - timestamp < ERROR_WINDOW_MS);
  timestamps.push(now);
  errorCounts.set(key, timestamps);
  return timestamps.length;
}

export function sendTelegramAlert(message: string, alertKey?: string): boolean {
  const normalizedAlertKey = alertKey?.trim() || message;
  const now = Date.now();
  const lastSentAt = lastAlertAt.get(normalizedAlertKey) ?? 0;
  if (now - lastSentAt < ALERT_COOLDOWN_MS) {
    return false;
  }

  lastAlertAt.set(normalizedAlertKey, now);
  void alertWarning(message, { alertKey: normalizedAlertKey, __skipAlert: true });
  return true;
}

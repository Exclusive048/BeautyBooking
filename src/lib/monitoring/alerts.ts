import {
  DEFAULT_ALERT_COOLDOWN_MS,
  sendAlertWithCooldown,
} from "@/lib/monitoring/alert-cooldown";

const ERROR_WINDOW_MS = 60_000;

const errorCounts = new Map<string, number[]>();

export function trackError(key: string): number {
  const now = Date.now();
  const timestamps = (errorCounts.get(key) ?? []).filter((timestamp) => now - timestamp < ERROR_WINDOW_MS);
  timestamps.push(now);
  errorCounts.set(key, timestamps);
  return timestamps.length;
}

/**
 * Предупреждение в Telegram с паузой по ключу (по умолчанию — 5 минут).
 * Механика паузы — `alert-cooldown.ts` (общая с алертами из `logError`,
 * OPS-ALERT-COOLDOWN-ON-LOGERROR). `true` — отправка ушла, `false` — по ключу
 * уже отправлено либо это не production.
 */
export async function sendTelegramAlert(
  message: string,
  alertKey?: string,
  cooldownMs = DEFAULT_ALERT_COOLDOWN_MS
): Promise<boolean> {
  const key = alertKey?.trim() || message;
  return sendAlertWithCooldown("warning", message, { alertKey: key }, { key, cooldownMs, connect: true });
}

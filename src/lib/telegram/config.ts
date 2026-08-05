import { env } from "@/lib/env";

/**
 * SEC-14 — конфигурация Telegram читается через `env`, а не `process.env`.
 *
 * Все четыре значения брались скобочной нотацией (`process.env[BOT_TOKEN_ENV]`),
 * то есть минули Zod-валидацию `env.ts` — и, что важнее, оказались невидимы
 * для ручного грепа `process\.env\.`, которым правило 11 до сих пор и держалось.
 * Файл в список исключений правила 11 не входил никогда.
 *
 * Цена промаха здесь не абстрактная: опечатка в имени `TELEGRAM_WEBHOOK_SECRET`
 * давала `null`, а вебхук трактует `null` как «секрет не настроен» и
 * пропускает ВЕСЬ блок проверки подлинности. Сегодня это не эксплуатируется
 * только потому, что выше стоит kill-switch FZ-199.
 */

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getTelegramBotUsername(): string | null {
  const raw = normalize(env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);
  if (!raw) return null;
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

export function getTelegramBotToken(): string | null {
  return normalize(env.TELEGRAM_BOT_TOKEN);
}

export function getAppPublicUrl(): string | null {
  return normalize(env.APP_PUBLIC_URL);
}

export function getTelegramWebhookSecret(): string | null {
  return normalize(env.TELEGRAM_WEBHOOK_SECRET);
}

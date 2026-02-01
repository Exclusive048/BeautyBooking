const BOT_USERNAME_ENV = "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME";
const BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN";
const APP_PUBLIC_URL_ENV = "APP_PUBLIC_URL";
const WEBHOOK_SECRET_ENV = "TELEGRAM_WEBHOOK_SECRET";

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getTelegramBotUsername(): string | null {
  const raw = normalize(process.env[BOT_USERNAME_ENV]);
  if (!raw) return null;
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

export function getTelegramBotToken(): string | null {
  return normalize(process.env[BOT_TOKEN_ENV]);
}

export function getAppPublicUrl(): string | null {
  return normalize(process.env[APP_PUBLIC_URL_ENV]);
}

export function getTelegramWebhookSecret(): string | null {
  return normalize(process.env[WEBHOOK_SECRET_ENV]);
}

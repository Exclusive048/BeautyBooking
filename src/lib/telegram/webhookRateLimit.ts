import { checkRateLimit } from "@/lib/rate-limit";

const TELEGRAM_WEBHOOK_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
};

export async function checkTelegramWebhookRateLimit(ip: string): Promise<boolean> {
  return checkRateLimit(
    `rate:telegramWebhook:${ip}`,
    TELEGRAM_WEBHOOK_RATE_LIMIT.limit,
    TELEGRAM_WEBHOOK_RATE_LIMIT.windowSeconds
  );
}

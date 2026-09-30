import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";

const TELEGRAM_WEBHOOK_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
};

/**
 * Лимит вебхука бота по адресу. Шаблон `/api/telegram/webhook` — в точном
 * списке чувствительных (29.09 доработки · 15): при обрыве Redis — отказ
 * (fail-closed), и теперь с причиной (503), а не «слишком много запросов».
 */
export async function checkTelegramWebhookRateLimit(req: Request, ip: string): Promise<RateLimitResult> {
  return checkRateLimit(routeRateLimitKey(req, "ip", ip), {
    maxRequests: TELEGRAM_WEBHOOK_RATE_LIMIT.limit,
    windowSeconds: TELEGRAM_WEBHOOK_RATE_LIMIT.windowSeconds,
  });
}

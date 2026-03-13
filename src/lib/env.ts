// TODO: The following files access process.env directly and should be
// migrated to use this module after launch:
// - src/proxy.ts (NODE_ENV)
// - src/lib/app-url.ts (APP_PUBLIC_URL, NEXT_PUBLIC_APP_URL)
// - src/lib/cache/cache.ts (REDIS_URL)
// - src/lib/auth/access.ts (AUTH_COOKIE_NAME)
// - src/lib/auth/jwt.ts (AUTH_JWT_SECRET)
// - src/lib/auth/otp.ts (OTP_HMAC_SECRET)
// - src/lib/auth/session.ts (AUTH_COOKIE_NAME)
// - src/lib/auth/jwt.test.ts (AUTH_JWT_SECRET)
// - src/lib/auth/otp.test.ts (OTP_HMAC_SECRET)
// - src/lib/auth/__tests__/otp-flow.test.ts (OTP_HMAC_SECRET)
// - src/components/pwa/install-prompt.tsx (NODE_ENV)
// - src/components/pwa/update-prompt.tsx (NODE_ENV)
// - src/components/auth/telegram-login-button.tsx (NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)
// - src/lib/prisma.ts (NODE_ENV)
// - src/lib/maps/address-suggest.ts (YANDEX_SUGGEST_API_KEY)
// - src/lib/payments/yookassa/client.ts (YOOKASSA_SECRET_KEY, YOOKASSA_SHOP_ID)
// - src/lib/vk/cookies.ts (AUTH_JWT_SECRET)
// - src/lib/monitoring/alert.ts (MONITORING_TELEGRAM_BOT_TOKEN, MONITORING_TELEGRAM_CHAT_ID, NODE_ENV)
// - src/lib/visual-search/openai.ts (OPENAI_API_KEY)
// - src/lib/visual-search/config.ts (OPENAI_API_KEY, VISUAL_SEARCH_ENABLED)
// - src/lib/redis/connection.ts (REDIS_URL)
// - src/lib/media/storage/index.ts (STORAGE_PROVIDER)
// - src/lib/media/storage/local.ts (MEDIA_LOCAL_ROOT)
// - src/lib/media/storage/s3.ts (S3_ACCESS_KEY, S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_SECRET_KEY)
// - src/lib/notifications/push/vapid.ts (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_EMAIL, VAPID_PRIVATE_KEY)
// - src/worker.ts (APP_PUBLIC_URL, NEXT_PUBLIC_APP_URL, WORKER_SECRET)
// - src/lib/schedule/usecases.ts (NODE_ENV)
// - src/features/admin/components/admin-billing.tsx (NODE_ENV)
// - src/features/booking/components/slot-picker/slot-picker.tsx (NODE_ENV)
// - src/features/catalog/components/catalog-map.tsx (NEXT_PUBLIC_YANDEX_MAPS_API_KEY)
// - src/features/public-profile/master/public-booking-widget.tsx (NODE_ENV)
// - src/features/public-profile/master/server/block-error.ts (NODE_ENV)
// - src/features/public-studio/server/block-error.ts (NODE_ENV)
// - src/app/robots.ts (NODE_ENV)
// - src/app/logout/route.ts (AUTH_COOKIE_NAME, NODE_ENV)
// - src/app/api/address/geocode/route.ts (YANDEX_GEOCODER_API_KEY)
// - src/app/api/auth/otp/verify/route.ts (AUTH_COOKIE_NAME, NODE_ENV)
// - src/app/api/auth/profile/ensure/route.ts (AUTH_COOKIE_NAME)
// - src/app/api/auth/telegram/login/route.ts (AUTH_COOKIE_NAME, NODE_ENV, TELEGRAM_BOT_TOKEN)
// - src/app/api/auth/vk/start/route.ts (NODE_ENV)
// - src/app/api/auth/vk/callback/route.ts (AUTH_COOKIE_NAME, NODE_ENV)
// - src/app/api/integrations/vk/start/route.ts (NODE_ENV)
// - src/app/api/integrations/vk/callback/route.ts (NODE_ENV)
// - src/app/api/billing/renew/run/route.ts (BILLING_RENEW_SECRET)
// - src/app/api/payments/yookassa/webhook/route.ts (YOOKASSA_SECRET_KEY, YOOKASSA_WEBHOOK_TOKEN)
// - src/app/api/health/worker/route.ts (WORKER_SECRET)
// - src/app/api/support/tickets/route.ts (SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER, SUPPORT_TO)
// - src/app/api/me/delete/route.ts (AUTH_COOKIE_NAME, NODE_ENV)
import { z } from "zod";

const STORAGE_PROVIDERS = ["local", "s3"] as const;
const NODE_ENVS = ["development", "test", "production"] as const;
const BOOLEAN_LITERALS = ["true", "false"] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default("development"),
  DATABASE_URL: z.string().trim().optional(),
  AUTH_JWT_SECRET: z.string().trim().optional(),
  OTP_HMAC_SECRET: z.string().trim().optional(),
  VK_CLIENT_ID: z.string().trim().optional(),
  VK_CLIENT_SECRET: z.string().trim().optional(),
  VK_REDIRECT_URI: z.string().trim().optional(),
  TELEGRAM_BOT_TOKEN: z.string().trim().optional(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().trim().optional(),
  NEXT_PUBLIC_VK_ENABLED: z.string().trim().optional(),
  DEFAULT_TIMEZONE: z.string().trim().optional().default("Europe/Moscow"),
  AUTH_COOKIE_NAME: z.string().trim().min(1).default("bh_session"),
  WORKER_SECRET: z.string().trim().optional(),
  STORAGE_PROVIDER: z.enum(STORAGE_PROVIDERS).default("local"),
  VISUAL_SEARCH_ENABLED: z.enum(BOOLEAN_LITERALS).default("false"),
  YOOKASSA_SECRET_KEY: z.string().trim().optional(),
  YOOKASSA_SHOP_ID: z.string().trim().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().trim().optional(),
  VAPID_PRIVATE_KEY: z.string().trim().optional(),
  VAPID_EMAIL: z.string().trim().optional(),
  S3_ACCESS_KEY: z.string().trim().optional(),
  S3_SECRET_KEY: z.string().trim().optional(),
  S3_BUCKET: z.string().trim().optional(),
  S3_ENDPOINT: z.string().trim().optional(),
  S3_REGION: z.string().trim().optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  YANDEX_GEOCODER_API_KEY: z.string().trim().optional(),
  YANDEX_SUGGEST_API_KEY: z.string().trim().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

let cachedEnv: ValidatedEnv | null = null;

export function validateEnv(): ValidatedEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.parse(process.env);
  const missing = new Set<string>();

  const requireVar = (name: keyof ValidatedEnv) => {
    const value = parsed[name];
    if (typeof value !== "string" || isMissing(value)) {
      missing.add(name);
    }
  };

  requireVar("AUTH_JWT_SECRET");
  requireVar("OTP_HMAC_SECRET");
  requireVar("DATABASE_URL");

  requireVar("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  requireVar("VAPID_PRIVATE_KEY");
  requireVar("VAPID_EMAIL");

  requireVar("YANDEX_GEOCODER_API_KEY");
  requireVar("YANDEX_SUGGEST_API_KEY");

  if (parsed.NODE_ENV === "production") {
    requireVar("WORKER_SECRET");
    requireVar("YOOKASSA_SECRET_KEY");
    requireVar("YOOKASSA_SHOP_ID");
  }

  if (parsed.STORAGE_PROVIDER === "s3") {
    requireVar("S3_ACCESS_KEY");
    requireVar("S3_SECRET_KEY");
    requireVar("S3_BUCKET");
    requireVar("S3_ENDPOINT");
    requireVar("S3_REGION");
  }

  if (parsed.VISUAL_SEARCH_ENABLED === "true") {
    requireVar("OPENAI_API_KEY");
  }

  if (missing.size > 0) {
    const missingList = Array.from(missing).sort().join(", ");
    throw new Error(`Environment validation failed. Missing required variables: ${missingList}`);
  }

  cachedEnv = parsed;
  return parsed;
}

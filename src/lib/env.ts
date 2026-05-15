import { z } from "zod";

// String env var → boolean. Accepts any string; only "true" (case-insensitive) → true.
const boolFlag = z
  .string()
  .optional()
  .default("false")
  .transform((v) => v.trim().toLowerCase() === "true");

const envSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Required always ──────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — postgresql://user:pass@host:5432/db"),
  AUTH_JWT_SECRET: z
    .string()
    .min(32, "AUTH_JWT_SECRET must be at least 32 chars (generate: openssl rand -hex 64)"),
  OTP_HMAC_SECRET: z
    .string()
    .min(16, "OTP_HMAC_SECRET must be at least 16 chars (generate: openssl rand -hex 32)"),

  // ── Database ──────────────────────────────────────────────────────────────
  DIRECT_URL: z.string().optional(),

  // ── App URL ───────────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  APP_PUBLIC_URL: z.url().optional(),

  // ── Auth ──────────────────────────────────────────────────────────────────
  AUTH_COOKIE_NAME: z.string().min(1).default("bh_session"),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // ── Worker / cron ─────────────────────────────────────────────────────────
  WORKER_SECRET: z.string().optional(),
  BILLING_RENEW_SECRET: z.string().optional(),
  MRR_SNAPSHOT_SECRET: z.string().optional(),

  // ── Storage ───────────────────────────────────────────────────────────────
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_ROOT: z.string().optional(),
  MEDIA_LOCAL_PUBLIC_URL: z.string().optional(),
  MEDIA_DELIVERY_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  // ── Telegram ──────────────────────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),

  // ── VK OAuth ──────────────────────────────────────────────────────────────
  VK_CLIENT_ID: z.string().optional(),
  VK_CLIENT_SECRET: z.string().optional(),
  VK_REDIRECT_URI: z.string().optional(),
  NEXT_PUBLIC_VK_ENABLED: boolFlag,

  // ── YooKassa ─────────────────────────────────────────────────────────────
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  YOOKASSA_WEBHOOK_TOKEN: z.string().optional(),

  // ── Push (VAPID) ─────────────────────────────────────────────────────────
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),

  // ── Yandex ────────────────────────────────────────────────────────────────
  YANDEX_GEOCODER_API_KEY: z.string().optional(),
  YANDEX_SUGGEST_API_KEY: z.string().optional(),
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: z.string().optional(),

  // ── OpenAI ────────────────────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),

  // ── SMTP ──────────────────────────────────────────────────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SUPPORT_TO: z.string().optional(),
  // Partnership inquiries from /partners. Falls back to SUPPORT_TO when unset.
  SUPPORT_TO_PARTNERSHIP: z.string().optional(),

  // ── Monitoring ────────────────────────────────────────────────────────────
  MONITORING_TELEGRAM_BOT_TOKEN: z.string().optional(),
  MONITORING_TELEGRAM_CHAT_ID: z.string().optional(),

  // ── Feature flags (boolean after transform) ───────────────────────────────
  VISUAL_SEARCH_ENABLED: boolFlag,
  AI_FEATURES_ENABLED: boolFlag,
  EMAIL_AUTH_ENABLED: boolFlag,

  // ── Timezone ─────────────────────────────────────────────────────────────
  DEFAULT_TIMEZONE: z.string().min(1).default("Europe/Moscow"),
});

// ── Conditional refinements ───────────────────────────────────────────────────
const refinedSchema = envSchema
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.REDIS_URL),
    "REDIS_URL is required in production"
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.WORKER_SECRET),
    "WORKER_SECRET is required in production"
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.MEDIA_DELIVERY_SECRET),
    "MEDIA_DELIVERY_SECRET is required in production"
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.NEXT_PUBLIC_APP_URL ?? e.APP_PUBLIC_URL),
    "NEXT_PUBLIC_APP_URL is required in production"
  )
  .refine(
    (e) =>
      e.STORAGE_PROVIDER !== "s3" ||
      (Boolean(e.S3_BUCKET) && Boolean(e.S3_ACCESS_KEY) && Boolean(e.S3_SECRET_KEY)),
    "S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY are required when STORAGE_PROVIDER=s3"
  )
  .refine(
    (e) => !e.VISUAL_SEARCH_ENABLED || Boolean(e.OPENAI_API_KEY),
    "OPENAI_API_KEY is required when VISUAL_SEARCH_ENABLED=true"
  )
  .refine(
    (e) => !e.AI_FEATURES_ENABLED || Boolean(e.OPENAI_API_KEY),
    "OPENAI_API_KEY is required when AI_FEATURES_ENABLED=true"
  );

// ── Parse ─────────────────────────────────────────────────────────────────────
// Never crash the process during Next.js static build or Vitest runs.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isTestEnv = process.env.NODE_ENV === "test";
const isProdRuntime = process.env.NODE_ENV === "production" && !isBuildPhase;

const _parsed = refinedSchema.safeParse(process.env);

if (!_parsed.success) {
  const lines = _parsed.error.issues
    .map((i) => `  • ${i.path.length ? i.path.join(".") : "root"}: ${i.message}`)
    .join("\n");

  if (isProdRuntime) {
    console.error(`\n❌ Invalid environment variables:\n${lines}\n\nCheck .env.example for required variables.\n`);
    process.exit(1);
  } else if (!isTestEnv) {
    console.warn(`\n⚠️  Environment variables:\n${lines}\n`);
  }
}

export type AppEnv = z.infer<typeof refinedSchema>;

export const env: AppEnv = _parsed.success
  ? _parsed.data
  : (process.env as unknown as AppEnv);

// ── Computed flags ────────────────────────────────────────────────────────────
export const isPushEnabled = Boolean(
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_EMAIL
);
export const isPaymentsEnabled = Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
export const isTelegramAuthEnabled = Boolean(env.TELEGRAM_BOT_TOKEN);
export const isVkAuthEnabled = env.NEXT_PUBLIC_VK_ENABLED && Boolean(env.VK_CLIENT_ID);
export const isEmailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
export const isS3Enabled = env.STORAGE_PROVIDER === "s3";
export const isVisualSearchEnabled = env.VISUAL_SEARCH_ENABLED;
export const isAiFeaturesEnabled = env.AI_FEATURES_ENABLED;

// ── Backward compat shim (used in src/lib/startup.ts, src/lib/master/profile.service.ts) ─
export type ValidatedEnv = AppEnv;
export function validateEnv(): AppEnv {
  return env;
}

import { z } from "zod";

const STORAGE_PROVIDERS = ["local", "s3"] as const;
const NODE_ENVS = ["development", "test", "production"] as const;
const BOOLEAN_LITERALS = ["true", "false"] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default("development"),
  DATABASE_URL: z.string().trim().optional(),
  AUTH_JWT_SECRET: z.string().trim().optional(),
  AUTH_COOKIE_NAME: z.string().trim().min(1).default("bh_session"),
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
  requireVar("DATABASE_URL");

  requireVar("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  requireVar("VAPID_PRIVATE_KEY");
  requireVar("VAPID_EMAIL");

  requireVar("YANDEX_GEOCODER_API_KEY");
  requireVar("YANDEX_SUGGEST_API_KEY");

  if (parsed.NODE_ENV === "production") {
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

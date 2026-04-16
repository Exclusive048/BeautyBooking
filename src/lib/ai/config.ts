import { AppError } from "@/lib/api/errors";
import { env, isAiFeaturesEnabled } from "@/lib/env";
import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

export const AI_FEATURES_SYSTEM_CONFIG_KEY = "aiFeaturesEnabled";
export const AI_FEATURES_CACHE_KEY = "system:ai-features-enabled";
const AI_FEATURES_CACHE_TTL_SECONDS = 30;

export function getAiFeaturesEnabledByEnv(): boolean {
  return isAiFeaturesEnabled;
}

export function ensureAiFeaturesStartupConfig(): void {
  if (!isAiFeaturesEnabled) return;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (apiKey) return;
  throw new AppError(
    "OPENAI_API_KEY is required when AI_FEATURES_ENABLED=true",
    500,
    "INTERNAL_ERROR",
  );
}

export async function getAiFeaturesEnabled(): Promise<boolean> {
  const cached = await get<boolean>(AI_FEATURES_CACHE_KEY);
  if (typeof cached === "boolean") return cached;

  const setting = await prisma.systemConfig.findUnique({
    where: { key: AI_FEATURES_SYSTEM_CONFIG_KEY },
    select: { value: true },
  });

  const resolved =
    typeof setting?.value === "boolean"
      ? setting.value
      : getAiFeaturesEnabledByEnv();

  await set(AI_FEATURES_CACHE_KEY, resolved, AI_FEATURES_CACHE_TTL_SECONDS);
  return resolved;
}

export async function clearAiFeaturesEnabledCache(): Promise<void> {
  await del(AI_FEATURES_CACHE_KEY);
}

export async function assertAiFeaturesEnabled(): Promise<void> {
  const enabled = await getAiFeaturesEnabled();
  if (!enabled) {
    throw new AppError("AI features are disabled", 503, "SYSTEM_FEATURE_DISABLED");
  }
}

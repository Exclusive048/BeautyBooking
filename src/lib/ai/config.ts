import { AppError } from "@/lib/api/errors";
import { env, isAiFeaturesEnabled } from "@/lib/env";
import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

/**
 * Post-OPENAI-CLEANUP-A (2026-05-31): single AI provider — Yandex Cloud
 * Foundation Models. Provider-switching helpers (`AIProvider` type,
 * `getCurrentAIProvider()`) removed — they had no callers outside this file
 * after the migration. `client.ts` constructs Yandex client unconditionally;
 * env.ts refine guarantees YANDEX_API_KEY + YANDEX_FOLDER_ID present when
 * AI_FEATURES_ENABLED.
 */

export const AI_FEATURES_SYSTEM_CONFIG_KEY = "aiFeaturesEnabled";
export const AI_FEATURES_CACHE_KEY = "system:ai-features-enabled";
const AI_FEATURES_CACHE_TTL_SECONDS = 30;

export function getAiFeaturesEnabledByEnv(): boolean {
  return isAiFeaturesEnabled;
}

export function ensureAiFeaturesStartupConfig(): void {
  if (!isAiFeaturesEnabled) return;
  const apiKey = env.YANDEX_API_KEY?.trim();
  const folderId = env.YANDEX_FOLDER_ID?.trim();
  if (apiKey && folderId) return;
  throw new AppError(
    "Не настроены YANDEX_API_KEY и YANDEX_FOLDER_ID — AI-функции включить нельзя.",
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
    throw new AppError("AI-функции отключены.", 503, "SYSTEM_FEATURE_DISABLED");
  }
}

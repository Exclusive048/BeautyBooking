import { AppError } from "@/lib/api/errors";
import { env, isVisualSearchEnabled } from "@/lib/env";
import { createSystemDisabledError } from "@/lib/billing/guards";
import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

export const VISUAL_SEARCH_SYSTEM_CONFIG_KEY = "visualSearchEnabled";
export const VISUAL_SEARCH_CACHE_KEY = "system:visual-search-enabled";
const VISUAL_SEARCH_CACHE_TTL_SECONDS = 30;

export type VisualSearchConfig = {
  enabled: boolean;
};

export function getVisualSearchEnabledByEnv(): boolean {
  return isVisualSearchEnabled;
}

export function ensureVisualSearchStartupConfig(): void {
  if (!isVisualSearchEnabled) return;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (apiKey) return;
  throw new AppError(
    "OPENAI_API_KEY is required when VISUAL_SEARCH_ENABLED=true",
    500,
    "INTERNAL_ERROR"
  );
}

export async function getVisualSearchEnabled(): Promise<boolean> {
  const cached = await get<boolean>(VISUAL_SEARCH_CACHE_KEY);
  if (typeof cached === "boolean") {
    return cached;
  }

  const setting = await prisma.systemConfig.findUnique({
    where: { key: VISUAL_SEARCH_SYSTEM_CONFIG_KEY },
    select: { value: true },
  });

  const resolved =
    typeof setting?.value === "boolean"
      ? setting.value
      : getVisualSearchEnabledByEnv();

  await set(VISUAL_SEARCH_CACHE_KEY, resolved, VISUAL_SEARCH_CACHE_TTL_SECONDS);
  return resolved;
}

export async function getVisualSearchConfig(): Promise<VisualSearchConfig> {
  return {
    enabled: await getVisualSearchEnabled(),
  };
}

export async function clearVisualSearchEnabledCache(): Promise<void> {
  await del(VISUAL_SEARCH_CACHE_KEY);
}

export async function assertVisualSearchEnabled(): Promise<void> {
  const enabled = await getVisualSearchEnabled();
  if (!enabled) {
    throw createSystemDisabledError("visualSearch");
  }
}


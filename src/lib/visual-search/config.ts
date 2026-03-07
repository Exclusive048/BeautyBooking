import { AppError } from "@/lib/api/errors";
import { createSystemDisabledError } from "@/lib/billing/guards";
import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

export const VISUAL_SEARCH_SYSTEM_CONFIG_KEY = "visualSearchEnabled";
export const VISUAL_SEARCH_CACHE_KEY = "system:visual-search-enabled";
const VISUAL_SEARCH_CACHE_TTL_SECONDS = 30;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function getVisualSearchEnabledByEnv(): boolean {
  return parseBoolean(process.env.VISUAL_SEARCH_ENABLED, false);
}

export function ensureVisualSearchStartupConfig(): void {
  if (!getVisualSearchEnabledByEnv()) return;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
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

export async function clearVisualSearchEnabledCache(): Promise<void> {
  await del(VISUAL_SEARCH_CACHE_KEY);
}

export async function assertVisualSearchEnabled(): Promise<void> {
  const enabled = await getVisualSearchEnabled();
  if (!enabled) {
    throw createSystemDisabledError("visualSearch");
  }
}


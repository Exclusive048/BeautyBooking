import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

function parseEnvFlag(): boolean | null {
  const raw = process.env.VISUAL_SEARCH_ENABLED;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function parseSystemFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function isVisualSearchEnabled(): Promise<boolean> {
  const fallback = parseEnvFlag() ?? false;
  const record = await prisma.systemConfig.findUnique({
    where: { key: "visualSearchEnabled" },
    select: { value: true },
  });
  return parseSystemFlag(record?.value, fallback);
}

export async function ensureVisualSearchEnabled(): Promise<void> {
  const enabled = await isVisualSearchEnabled();
  if (!enabled) {
    throw new AppError("Visual search is disabled", 403, "SYSTEM_FEATURE_DISABLED");
  }
}

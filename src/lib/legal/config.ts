import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

/**
 * Legal documents (Terms, Privacy) carry a visible "Черновик" banner until
 * legal review is complete. Stored in `SystemConfig` so we can flip it via
 * the existing /api/admin/system-config endpoint without a redeploy.
 *
 * Default: TRUE (banner visible). To remove the banner once a lawyer signs
 * off the documents:
 *   PATCH /api/admin/system-config { key: "legalDraftMode", value: false }
 * or directly in psql:
 *   INSERT INTO "SystemConfig" (key, value) VALUES ('legalDraftMode', 'false')
 *   ON CONFLICT (key) DO UPDATE SET value = 'false';
 */

export const LEGAL_DRAFT_SYSTEM_CONFIG_KEY = "legalDraftMode";
const LEGAL_DRAFT_CACHE_KEY = "system:legal-draft-mode";
const LEGAL_DRAFT_CACHE_TTL_SECONDS = 30;

export async function getLegalDraftMode(): Promise<boolean> {
  const cached = await get<boolean>(LEGAL_DRAFT_CACHE_KEY);
  if (typeof cached === "boolean") return cached;

  const setting = await prisma.systemConfig.findUnique({
    where: { key: LEGAL_DRAFT_SYSTEM_CONFIG_KEY },
    select: { value: true },
  });

  // Default to draft mode unless explicitly disabled.
  const resolved = typeof setting?.value === "boolean" ? setting.value : true;

  await set(LEGAL_DRAFT_CACHE_KEY, resolved, LEGAL_DRAFT_CACHE_TTL_SECONDS);
  return resolved;
}

export async function clearLegalDraftModeCache(): Promise<void> {
  await del(LEGAL_DRAFT_CACHE_KEY);
}

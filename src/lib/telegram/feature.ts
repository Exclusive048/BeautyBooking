import { isTelegramEnabled } from "@/lib/env";
import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

/**
 * FIX-TELEGRAM-KILLSWITCH — user-facing Telegram is a legal launch-blocker and
 * is gated behind a TWO-LAYER flag:
 *
 *   1. Env ceiling — `isTelegramEnabled` (src/lib/env.ts). ENV-SPLIT-01:
 *      прежний флаг NEXT_PUBLIC_TELEGRAM_ENABLED удалён, потолок теперь —
 *      НАЛИЧИЕ NEXT_PUBLIC_TELEGRAM_BOT_USERNAME (выключить = убрать username
 *      из env). This is the LEGAL GUARANTEE: when off, Telegram is absent from
 *      the UI + inert in delivery, with no DB read required.
 *   2. Admin toggle in `SystemConfig` (key `telegramEnabled`), default ON, but
 *      only effective *within* an env that already allows Telegram.
 *
 * 🔴 HARD CEILING — deliberately NOT the `visualSearchEnabled` env-as-fallback
 * semantic. The effective value is:
 *
 *     envOff ? false : dbToggle
 *
 * The DB toggle can only turn Telegram off-or-on *below* the env ceiling; it can
 * NEVER re-enable Telegram when the env says off. Get the boolean direction
 * right — env wins unconditionally (the legal guarantee must not be
 * DB-overridable).
 *
 * NOTE — the internal ops-monitoring Telegram (`MONITORING_TELEGRAM_BOT_TOKEN`
 * / `MONITORING_TELEGRAM_CHAT_ID`, see src/lib/monitoring/alert.ts) is a
 * SEPARATE system (admin-only private alerts, not user data). It is
 * intentionally NOT gated by this flag.
 *
 * Server-only (imports prisma). Client UI gating reads `isTelegramEnabled`
 * (the env flag) directly — never this resolver.
 */

export const TELEGRAM_SYSTEM_CONFIG_KEY = "telegramEnabled";
export const TELEGRAM_CACHE_KEY = "system:telegram-enabled";
const TELEGRAM_CACHE_TTL_SECONDS = 30;

export async function getTelegramEnabled(): Promise<boolean> {
  // Env hard ceiling — short-circuit BEFORE any DB read (the legal guarantee).
  if (!isTelegramEnabled) return false;

  const cached = await get<boolean>(TELEGRAM_CACHE_KEY);
  if (typeof cached === "boolean") return cached;

  const setting = await prisma.systemConfig.findUnique({
    where: { key: TELEGRAM_SYSTEM_CONFIG_KEY },
    select: { value: true },
  });

  // Env already allows → admin toggle, default ON when unset.
  const resolved = typeof setting?.value === "boolean" ? setting.value : true;
  await set(TELEGRAM_CACHE_KEY, resolved, TELEGRAM_CACHE_TTL_SECONDS);
  return resolved;
}

export async function clearTelegramEnabledCache(): Promise<void> {
  await del(TELEGRAM_CACHE_KEY);
}

import { prisma } from "@/lib/prisma";
import { isTelegramEnabled } from "@/lib/env";
import type { SystemFlags } from "@/features/admin-cabinet/settings/types";

const FLAG_KEYS: ReadonlyArray<keyof SystemFlags> = [
  "onlinePaymentsEnabled",
  "visualSearchEnabled",
  "legalDraftMode",
  "telegramEnabled",
];

const DEFAULTS: SystemFlags = {
  onlinePaymentsEnabled: false,
  visualSearchEnabled: false,
  // `legalDraftMode` defaults to true so the banner stays visible until a
  // human flips it. Mirrors `getLegalDraftMode()` semantics.
  legalDraftMode: true,
  // `telegramEnabled` admin toggle defaults to ON, but only *below* the env
  // ceiling — see the env-clamp in `getSystemFlags` below.
  telegramEnabled: true,
};

function parseFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function getSystemFlags(): Promise<SystemFlags> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: [...FLAG_KEYS] } },
    select: { key: true, value: true },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  // FIX-TELEGRAM-KILLSWITCH: the displayed telegram value is the EFFECTIVE
  // value (env hard ceiling applied) so the admin sees reality — when the env
  // is off the toggle shows/stays false ("locked off") regardless of the
  // stored DB toggle. Mirrors `getTelegramEnabled()`.
  const telegramEnabled = isTelegramEnabled
    ? parseFlag(byKey.get("telegramEnabled"), DEFAULTS.telegramEnabled)
    : false;

  return {
    onlinePaymentsEnabled: parseFlag(byKey.get("onlinePaymentsEnabled"), DEFAULTS.onlinePaymentsEnabled),
    visualSearchEnabled: parseFlag(byKey.get("visualSearchEnabled"), DEFAULTS.visualSearchEnabled),
    legalDraftMode: parseFlag(byKey.get("legalDraftMode"), DEFAULTS.legalDraftMode),
    telegramEnabled,
  };
}

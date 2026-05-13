import { prisma } from "@/lib/prisma";
import type { SystemFlags } from "@/features/admin-cabinet/settings/types";

const FLAG_KEYS: ReadonlyArray<keyof SystemFlags> = [
  "onlinePaymentsEnabled",
  "visualSearchEnabled",
  "legalDraftMode",
];

const DEFAULTS: SystemFlags = {
  onlinePaymentsEnabled: false,
  visualSearchEnabled: false,
  // `legalDraftMode` defaults to true so the banner stays visible until a
  // human flips it. Mirrors `getLegalDraftMode()` semantics.
  legalDraftMode: true,
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

  return {
    onlinePaymentsEnabled: parseFlag(byKey.get("onlinePaymentsEnabled"), DEFAULTS.onlinePaymentsEnabled),
    visualSearchEnabled: parseFlag(byKey.get("visualSearchEnabled"), DEFAULTS.visualSearchEnabled),
    legalDraftMode: parseFlag(byKey.get("legalDraftMode"), DEFAULTS.legalDraftMode),
  };
}

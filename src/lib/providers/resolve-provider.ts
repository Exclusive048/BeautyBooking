import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const DEFAULT_PROVIDER_SELECT = {
  id: true,
  publicUsername: true,
  type: true,
  isPublished: true,
} satisfies Prisma.ProviderSelect;

type DefaultProviderSelect = typeof DEFAULT_PROVIDER_SELECT;

export type ProviderResult<TSelect extends Prisma.ProviderSelect | undefined = undefined> =
  Prisma.ProviderGetPayload<{
    select: TSelect extends Prisma.ProviderSelect ? TSelect : DefaultProviderSelect;
  }>;

function normalizeProviderKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;
  return trimmed;
}

export function looksLikeProviderId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 20 && trimmed.startsWith("c");
}

export async function resolveProviderBySlugOrId<TSelect extends Prisma.ProviderSelect | undefined = undefined>(args: {
  key: string | null | undefined;
  select?: TSelect;
  client?: typeof prisma;
}): Promise<ProviderResult<TSelect> | null> {
  const normalized = normalizeProviderKey(args.key);
  if (!normalized) return null;

  const where = looksLikeProviderId(normalized) ? { id: normalized } : { publicUsername: normalized };
  const client = args.client ?? prisma;
  const provider = await client.provider.findUnique({
    where,
    select: (args.select ?? DEFAULT_PROVIDER_SELECT) as Prisma.ProviderSelect,
  });

  return provider as ProviderResult<TSelect> | null;
}

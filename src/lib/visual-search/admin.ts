import { MediaEntityType, MediaKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";
import { createVisualSearchIndexJob } from "@/lib/queue/types";

export async function queueVisualSearchReindex(input: {
  categorySlug?: string;
  promptVersion?: string;
}): Promise<{ queued: number }> {
  const conditions: Prisma.MediaAssetWhereInput[] = [{ visualIndexed: false }];

  if (input.promptVersion) {
    conditions.push({ visualPromptVersion: { not: input.promptVersion } });
  }

  if (input.categorySlug) {
    conditions.push({ visualCategory: input.categorySlug });
  }

  const assets = await prisma.mediaAsset.findMany({
    where: {
      kind: MediaKind.PORTFOLIO,
      deletedAt: null,
      entityType: { in: [MediaEntityType.MASTER, MediaEntityType.STUDIO] },
      OR: conditions,
    },
    select: { id: true },
  });

  await Promise.all(
    assets.map((asset) => enqueue(createVisualSearchIndexJob({ assetId: asset.id })))
  );

  return { queued: assets.length };
}

export async function getVisualSearchStats(): Promise<{
  total: number;
  indexed: number;
  unrecognized: number;
  byCategory: Record<string, { indexed: number }>;
  byPromptVersion: Record<string, number>;
}> {
  const baseWhere: Prisma.MediaAssetWhereInput = {
    kind: MediaKind.PORTFOLIO,
    deletedAt: null,
    entityType: { in: [MediaEntityType.MASTER, MediaEntityType.STUDIO] },
  };

  const [total, indexed, unrecognized, byCategoryRows, byPromptRows] = await Promise.all([
    prisma.mediaAsset.count({ where: baseWhere }),
    prisma.mediaAsset.count({ where: { ...baseWhere, visualIndexed: true } }),
    prisma.mediaAsset.count({
      where: { ...baseWhere, visualIndexed: true, visualCategory: null },
    }),
    prisma.mediaAsset.groupBy({
      by: ["visualCategory"],
      where: { ...baseWhere, visualIndexed: true, visualCategory: { not: null } },
      _count: { _all: true },
    }),
    prisma.mediaAsset.groupBy({
      by: ["visualPromptVersion"],
      where: { ...baseWhere, visualIndexed: true, visualPromptVersion: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const byCategory: Record<string, { indexed: number }> = {};
  for (const row of byCategoryRows) {
    if (!row.visualCategory) continue;
    byCategory[row.visualCategory] = { indexed: row._count._all };
  }

  const byPromptVersion: Record<string, number> = {};
  for (const row of byPromptRows) {
    if (!row.visualPromptVersion) continue;
    byPromptVersion[row.visualPromptVersion] = row._count._all;
  }

  return {
    total,
    indexed,
    unrecognized,
    byCategory,
    byPromptVersion,
  };
}

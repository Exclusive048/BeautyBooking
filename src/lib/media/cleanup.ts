import { MediaAssetStatus, Prisma } from "@prisma/client";
import { logError, logInfo } from "@/lib/logging/logger";
import { getStorageProvider } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";

const STALE_PENDING_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
/** Пачка добора данных визуального поиска у удалённых фото (29.09 · 16). */
export const DELETED_VISUAL_DATA_BATCH = 500;

/**
 * 29.09 доработки · 16 (RKN-AUDIT-01) — у мягко удалённых фото не должно
 * оставаться данных, выведенных для визуального поиска: эмбеддинга и
 * `visualDescription` / `visualMeta` / `visualCategory`. Новые удаления чистит
 * сам `deleteAssetById`; этот проход подбирает исторические строки (до
 * изменения) пачками по 500 — за один-два часовых прохода воркера после
 * деплоя, отдельный пост-деплойный шаг не нужен. Живые фото (`deletedAt IS
 * NULL`) не трогаются никогда — условие закреплено тестом.
 */
export async function purgeDeletedAssetVisualData(limit = DELETED_VISUAL_DATA_BATCH): Promise<number> {
  const rows = await prisma.mediaAsset.findMany({
    where: {
      deletedAt: { not: null },
      OR: [
        { visualDescription: { not: null } },
        { visualCategory: { not: null } },
        { visualMeta: { not: Prisma.DbNull } },
        { embedding: { isNot: null } },
      ],
    },
    select: { id: true },
    take: limit,
  });
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row.id);
  await prisma.$transaction([
    prisma.mediaAssetEmbedding.deleteMany({ where: { assetId: { in: ids } } }),
    prisma.mediaAsset.updateMany({
      where: { id: { in: ids }, deletedAt: { not: null } },
      data: { visualDescription: null, visualMeta: Prisma.DbNull, visualCategory: null },
    }),
  ]);
  logInfo("Deleted media visual data purged", { count: ids.length });
  return ids.length;
}

function getPendingCutoffDate(): Date {
  return new Date(Date.now() - STALE_PENDING_MS);
}

export async function getMediaCleanupStats(): Promise<{
  stalePendingCount: number;
  brokenCount: number;
  staleBefore: string;
}> {
  const staleBefore = getPendingCutoffDate();
  const [stalePendingCount, brokenCount] = await Promise.all([
    prisma.mediaAsset.count({
      where: {
        deletedAt: null,
        status: MediaAssetStatus.PENDING,
        createdAt: { lt: staleBefore },
      },
    }),
    prisma.mediaAsset.count({
      where: {
        deletedAt: null,
        status: MediaAssetStatus.BROKEN,
      },
    }),
  ]);

  return {
    stalePendingCount,
    brokenCount,
    staleBefore: staleBefore.toISOString(),
  };
}

export async function runMediaCleanup(limit = DEFAULT_BATCH_SIZE): Promise<number> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), DEFAULT_BATCH_SIZE);
  const staleBefore = getPendingCutoffDate();
  const storage = getStorageProvider();

  const staleAssets = await prisma.mediaAsset.findMany({
    where: {
      deletedAt: null,
      status: MediaAssetStatus.PENDING,
      createdAt: { lt: staleBefore },
    },
    take: safeLimit,
    orderBy: { createdAt: "asc" },
    select: { id: true, storageKey: true },
  });

  let cleaned = 0;
  for (const asset of staleAssets) {
    try {
      await storage.deleteObject(asset.storageKey);
    } catch {
      // storage delete is best-effort for stale pending files
    }

    const updated = await prisma.mediaAsset.updateMany({
      where: { id: asset.id, deletedAt: null, status: MediaAssetStatus.PENDING },
      data: { status: MediaAssetStatus.BROKEN },
    });

    if (updated.count > 0) {
      cleaned += 1;
      logError("Cleaned up stale media asset", { assetId: asset.id });
    }
  }

  if (cleaned > 0) {
    logInfo("Media cleanup completed", { cleaned });
  }

  // 29.09 доработки · 16: заодно — данные визуального поиска удалённых фото.
  // Сбой добора не должен ронять основную уборку: следующий проход повторит.
  try {
    await purgeDeletedAssetVisualData();
  } catch (error) {
    logError("Deleted media visual data purge failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return cleaned;
}

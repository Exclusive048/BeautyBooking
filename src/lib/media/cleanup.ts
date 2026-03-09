import { MediaAssetStatus } from "@prisma/client";
import { logError, logInfo } from "@/lib/logging/logger";
import { getStorageProvider } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";

const STALE_PENDING_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;

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

  return cleaned;
}

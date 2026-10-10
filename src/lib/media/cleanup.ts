import { MediaAssetStatus, Prisma } from "@prisma/client";
import { logError, logInfo } from "@/lib/logging/logger";
import { deleteMediaPreviews } from "@/lib/media/preview-variants";
import { getStorageProvider } from "@/lib/media/storage";
import { isStorageUnavailableError } from "@/lib/media/storage/unavailable";
import { prisma } from "@/lib/prisma";

const STALE_PENDING_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
/** Пачка добора данных визуального поиска у удалённых фото (29.09 · 16). */
export const DELETED_VISUAL_DATA_BATCH = 500;
/** Сколько удалённых фото уборка дочищает в хранилище за проход. */
export const STORAGE_SWEEP_BATCH = 200;
/**
 * Свежее удаление уборка не трогает: его байты прямо сейчас удаляет сам
 * `deleteAssetById`, повтор был бы лишней работой (не ошибкой — удаление
 * идемпотентно).
 */
export const STORAGE_SWEEP_GRACE_MS = 10 * 60_000;

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

export type StorageSweepResult = {
  /** Строк, у которых байты убраны (или не требовали удаления) и стоит отметка. */
  cleared: number;
  /** Объектов, которые не удалились по иной причине, чем недоступность. */
  failed: number;
  /** Хранилище недоступно — проход остановлен на первом же отказе. */
  storageUnavailable: boolean;
};

/**
 * MEDIA-STORAGE-ORPHAN-SWEEP — байты удалённых фото не остаются в хранилище
 * навсегда.
 *
 * `deleteAssetById` помечает строку удалённой, а объект удаляет best-effort:
 * при недоступном хранилище (живой случай 2026-10-10 — аккаунт Object Storage
 * приостановлен) байты оставались «сиротой», и прежняя уборка их не видела —
 * она метёт только зависшие PENDING-загрузки. Теперь у удалённой строки есть
 * отметка `storageDeletedAt`, а этот проход (раз в час, вместе с уборкой)
 * повторяет удаление у строк без неё: оригинал и превью `?w=`, затем отметка.
 *
 *   · Удаление идемпотентно (отсутствующий объект — не ошибка), поэтому строки,
 *     удалённые до появления отметки, проход один раз «удаляет» повторно и
 *     помечает — это и есть добор исторических сирот.
 *   · Ключ, которым пользуется живая строка, не удаляется (ключи уникальны по
 *     построению, это страховка): строка помечается, объект остаётся.
 *   · Хранилище недоступно — проход останавливается на первом отказе: алерт об
 *     этом уже ушёл из адаптера (`toStorageFailure`), остальные попытки дали бы
 *     только шум. Отметки не ставятся — следующий час повторит.
 *   · Иной отказ (права, подпись) — объект пропускается, проход идёт дальше,
 *     одна запись `logError` на проход: это наша конфигурация, она громкая.
 *
 * Строки не удаляются — мягко удалённое фото остаётся строкой, как и было
 * (на неё ссылаются вложения переписки и карточки клиента).
 */
export async function sweepDeletedAssetStorage(limit = STORAGE_SWEEP_BATCH): Promise<StorageSweepResult> {
  const rows = await prisma.mediaAsset.findMany({
    where: {
      deletedAt: { not: null, lt: new Date(Date.now() - STORAGE_SWEEP_GRACE_MS) },
      storageDeletedAt: null,
    },
    orderBy: { deletedAt: "asc" },
    take: limit,
    select: { id: true, storageKey: true },
  });
  if (rows.length === 0) return { cleared: 0, failed: 0, storageUnavailable: false };

  const liveKeys = new Set(
    (
      await prisma.mediaAsset.findMany({
        where: { storageKey: { in: rows.map((row) => row.storageKey) }, deletedAt: null },
        select: { storageKey: true },
      })
    ).map((row) => row.storageKey),
  );

  const storage = getStorageProvider();
  const clearedIds: string[] = [];
  let failed = 0;
  let firstError: string | null = null;
  let storageUnavailable = false;

  for (const row of rows) {
    if (liveKeys.has(row.storageKey)) {
      clearedIds.push(row.id);
      continue;
    }
    try {
      await storage.deleteObject(row.storageKey);
      await deleteMediaPreviews(storage, row.storageKey);
      clearedIds.push(row.id);
    } catch (error) {
      if (isStorageUnavailableError(error)) {
        storageUnavailable = true;
        break;
      }
      failed += 1;
      firstError ??= error instanceof Error ? error.message : String(error);
    }
  }

  if (clearedIds.length > 0) {
    await prisma.mediaAsset.updateMany({
      where: { id: { in: clearedIds }, storageDeletedAt: null },
      data: { storageDeletedAt: new Date() },
    });
  }

  if (failed > 0) {
    logError("Media storage sweep: objects of deleted assets not removed", {
      failed,
      cleared: clearedIds.length,
      firstError,
    });
  }
  if (clearedIds.length > 0 || storageUnavailable) {
    logInfo("Media storage sweep completed", {
      cleared: clearedIds.length,
      failed,
      storageUnavailable,
    });
  }
  return { cleared: clearedIds.length, failed, storageUnavailable };
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

/**
 * Ежечасная задача воркера `media.cleanup`: уборка зависших загрузок плюс
 * MEDIA-STORAGE-ORPHAN-SWEEP — байты удалённых фото, которые не удалились
 * сразу. Уборка хранилища живёт здесь, а не в `runMediaCleanup`: ту
 * синхронно зовёт и админская кнопка (`/api/admin/media/broken`), и сотни
 * запросов к хранилищу в её ответе не нужны. Сбой уборки хранилища задачу не
 * роняет — следующий час повторит.
 */
export async function runMediaCleanupJob(): Promise<void> {
  await runMediaCleanup();
  try {
    await sweepDeletedAssetStorage();
  } catch (error) {
    logError("Media storage sweep failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

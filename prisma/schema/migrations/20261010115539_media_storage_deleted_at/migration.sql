-- MEDIA-STORAGE-ORPHAN-SWEEP: отметка «объект удалённого фото убран из хранилища».
-- Только ADD COLUMN (nullable, без значения по умолчанию) — строки не переписываются.
-- Prisma дописывал сюда DROP INDEX "media_asset_embeddings_embedding_hnsw_idx" —
-- снят вручную: сырой объект реестра scripts/raw-sql-objects.mjs.

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "storageDeletedAt" TIMESTAMP(3);

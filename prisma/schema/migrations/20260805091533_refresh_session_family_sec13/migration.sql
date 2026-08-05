-- SEC-13. Prisma дописывает сюда `DROP INDEX
-- "media_asset_embeddings_embedding_hnsw_idx"` в КАЖДУЮ новую миграцию: индекс
-- hnsw из pgvector она не выражает в датамодели и потому считает лишним.
-- Строка снята вручную (реестр — scripts/raw-sql-objects.mjs, гейт —
-- check:migration-drops). Применённый DROP молча превратил бы ANN-поиск
-- visual-search в seq-scan, без единой ошибки.

-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN     "familyId" TEXT;

-- CreateIndex
CREATE INDEX "RefreshSession_userId_familyId_revokedAt_idx" ON "RefreshSession"("userId", "familyId", "revokedAt");

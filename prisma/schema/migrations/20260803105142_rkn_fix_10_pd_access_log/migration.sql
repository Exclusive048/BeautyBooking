-- RKN-FIX-10 — append-only след массовых чтений ПДн (scoping инцидента за 24/72 ч).
-- ADD-only: новая таблица + новый enum, существующих данных не касается.

-- NOTE (ручная правка, второй случай подряд): `prisma migrate dev` снова добавил
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- и строка ЗДЕСЬ УДАЛЕНА. Индекс создаётся сырым SQL в
-- 20260713120000_reduce_embedding_dimensions_yandex на колонке
-- `Unsupported("vector(256)")`; Prisma не умеет держать его в датамодели и
-- предлагает дропнуть в КАЖДОЙ новой миграции. Применение убило бы ANN-поиск
-- visual-search, превратив его в seq-scan, без единого сообщения об ошибке.
-- Это уже второй раз (первый — 20260803094523_rkn_fix_12_drop_oauth_tokens):
-- баг воспроизводимый и системный, см. SCHEMA-DRIFT-GATE-BROKEN в BACKLOG.
-- Проверено после apply: индекс на месте.

-- CreateEnum
CREATE TYPE "PdAccessActorType" AS ENUM ('ADMIN', 'MASTER', 'STUDIO', 'SYSTEM');

-- CreateTable
CREATE TABLE "PdAccessLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" "PdAccessActorType" NOT NULL,
    "surface" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "filterFingerprint" TEXT,
    "scopeProviderId" TEXT,
    "scopeStudioId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdAccessLog_actorUserId_createdAt_idx" ON "PdAccessLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdAccessLog_createdAt_idx" ON "PdAccessLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdAccessLog_surface_createdAt_idx" ON "PdAccessLog"("surface", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdAccessLog_scopeProviderId_createdAt_idx" ON "PdAccessLog"("scopeProviderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PdAccessLog" ADD CONSTRAINT "PdAccessLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

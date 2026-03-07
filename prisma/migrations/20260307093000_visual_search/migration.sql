-- AlterTable
ALTER TABLE "MediaAsset"
ADD COLUMN "visualIndexed" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "visualIndexedAt" TIMESTAMP(3),
ADD COLUMN "visualPromptVersion" TEXT,
ADD COLUMN "visualDescription" TEXT,
ADD COLUMN "visualMeta" JSONB,
ADD COLUMN "visualCategory" TEXT;

-- CreateIndex
CREATE INDEX "MediaAsset_kind_visualIndexed_visualCategory_idx"
ON "MediaAsset"("kind", "visualIndexed", "visualCategory");

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "media_asset_embeddings" (
  "id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_asset_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_embeddings_asset_id_key"
ON "media_asset_embeddings"("asset_id");

CREATE INDEX "media_asset_embeddings_asset_id_idx"
ON "media_asset_embeddings"("asset_id");

-- HNSW index for cosine similarity
CREATE INDEX "media_asset_embeddings_embedding_hnsw_idx"
ON "media_asset_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "media_asset_embeddings"
ADD CONSTRAINT "media_asset_embeddings_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;


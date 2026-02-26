-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "visualCategory" TEXT,
ADD COLUMN     "visualDescription" TEXT,
ADD COLUMN     "visualIndexed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visualIndexedAt" TIMESTAMP(3),
ADD COLUMN     "visualMeta" JSONB,
ADD COLUMN     "visualPromptVersion" TEXT;

-- CreateTable
CREATE TABLE "MediaAssetEmbedding" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAssetEmbedding_assetId_key" ON "MediaAssetEmbedding"("assetId");

-- CreateIndex
CREATE INDEX "MediaAssetEmbedding_assetId_idx" ON "MediaAssetEmbedding"("assetId");

-- Vector index
CREATE INDEX ON "MediaAssetEmbedding" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "MediaAssetEmbedding" ADD CONSTRAINT "MediaAssetEmbedding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

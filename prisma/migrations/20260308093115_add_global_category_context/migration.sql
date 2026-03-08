-- DropIndex
DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "GlobalCategory" ADD COLUMN     "context" TEXT;

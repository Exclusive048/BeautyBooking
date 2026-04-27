-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "autoPublishStoriesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "PortfolioItem_isPublic_createdAt_id_idx" ON "PortfolioItem"("isPublic", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Provider_isPublished_autoPublishStoriesEnabled_idx" ON "Provider"("isPublished", "autoPublishStoriesEnabled");

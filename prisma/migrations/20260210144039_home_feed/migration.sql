-- AlterTable
ALTER TABLE "GlobalCategory" ADD COLUMN     "createdByProviderId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "globalCategoryId" TEXT;

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "relatedCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItemTag" (
    "portfolioItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItemTag_pkey" PRIMARY KEY ("portfolioItemId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_isFeatured_usageCount_idx" ON "Tag"("isFeatured", "usageCount");

-- CreateIndex
CREATE INDEX "Tag_relatedCategoryId_idx" ON "Tag"("relatedCategoryId");

-- CreateIndex
CREATE INDEX "PortfolioItemTag_tagId_idx" ON "PortfolioItemTag"("tagId");

-- CreateIndex
CREATE INDEX "GlobalCategory_createdByProviderId_idx" ON "GlobalCategory"("createdByProviderId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_globalCategoryId_fkey" FOREIGN KEY ("globalCategoryId") REFERENCES "GlobalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalCategory" ADD CONSTRAINT "GlobalCategory_createdByProviderId_fkey" FOREIGN KEY ("createdByProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_relatedCategoryId_fkey" FOREIGN KEY ("relatedCategoryId") REFERENCES "GlobalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemTag" ADD CONSTRAINT "PortfolioItemTag_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemTag" ADD CONSTRAINT "PortfolioItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

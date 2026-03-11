-- AlterTable
ALTER TABLE "GlobalCategory" ADD COLUMN     "visibleToAll" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "GlobalCategory_visibleToAll_idx" ON "GlobalCategory"("visibleToAll");

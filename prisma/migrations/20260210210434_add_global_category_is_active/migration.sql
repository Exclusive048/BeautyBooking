-- AlterTable
ALTER TABLE "GlobalCategory" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "icon" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "GlobalCategory_isActive_idx" ON "GlobalCategory"("isActive");

-- CreateEnum
CREATE TYPE "ReviewTagType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "ReviewTag" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "icon" TEXT,
  "type" "ReviewTagType" NOT NULL,
  "category" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTagOnReview" (
  "reviewId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewTagOnReview_pkey" PRIMARY KEY ("reviewId", "tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTag_code_key" ON "ReviewTag"("code");

-- CreateIndex
CREATE INDEX "ReviewTag_type_isActive_idx" ON "ReviewTag"("type", "isActive");

-- CreateIndex
CREATE INDEX "ReviewTagOnReview_tagId_idx" ON "ReviewTagOnReview"("tagId");

-- CreateIndex
CREATE INDEX "ReviewTagOnReview_reviewId_idx" ON "ReviewTagOnReview"("reviewId");

-- AddForeignKey
ALTER TABLE "ReviewTagOnReview"
ADD CONSTRAINT "ReviewTagOnReview_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTagOnReview"
ADD CONSTRAINT "ReviewTagOnReview_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "ReviewTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

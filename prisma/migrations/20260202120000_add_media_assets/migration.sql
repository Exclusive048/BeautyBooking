-- CreateEnum
CREATE TYPE "MediaEntityType" AS ENUM ('USER', 'MASTER', 'STUDIO', 'SITE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('AVATAR', 'PORTFOLIO');

-- AlterTable
ALTER TABLE "UserProfile"
ADD COLUMN "externalPhotoUrl" TEXT;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "entityType" "MediaEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "MediaAsset_entityType_entityId_kind_deletedAt_idx"
ON "MediaAsset"("entityType", "entityId", "kind", "deletedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_storageKey_idx" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_createdByUserId_idx" ON "MediaAsset"("createdByUserId");

-- AddForeignKey
ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "UserProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

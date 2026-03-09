-- Create enum for media asset lifecycle
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'BROKEN');

-- Track upload/storage state for media assets
ALTER TABLE "MediaAsset"
ADD COLUMN "status" "MediaAssetStatus" NOT NULL DEFAULT 'READY';

-- Speed up cleanup scans for stale and broken assets
CREATE INDEX "MediaAsset_status_deletedAt_createdAt_idx"
ON "MediaAsset" ("status", "deletedAt", "createdAt");

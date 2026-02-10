-- AlterTable
ALTER TABLE "VkLink"
ADD COLUMN "accessToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN "refreshToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN "deviceId" TEXT NOT NULL DEFAULT '';

-- Remove defaults added for backfilling existing rows
ALTER TABLE "VkLink"
ALTER COLUMN "accessToken" DROP DEFAULT,
ALTER COLUMN "refreshToken" DROP DEFAULT,
ALTER COLUMN "deviceId" DROP DEFAULT;

-- Drop deprecated columns
ALTER TABLE "VkLink"
DROP COLUMN "username",
DROP COLUMN "avatarUrl";

-- DropForeignKey
ALTER TABLE "TelegramLink" DROP CONSTRAINT "TelegramLink_userId_fkey";

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "telegramId" TEXT,
ADD COLUMN     "telegramUsername" TEXT;

-- DropTable
DROP TABLE "TelegramLink";

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_telegramId_key" ON "UserProfile"("telegramId");
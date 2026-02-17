/*
  Warnings:

  - You are about to alter the column `price` on the `ModelOffer` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to drop the column `masterId` on the `ScheduleChangeRequest` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ScheduleChangeRequest` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ScheduleChangeRequest_masterId_status_createdAt_idx";

-- DropIndex
DROP INDEX "ScheduleChangeRequest_studioId_masterId_createdAt_idx";

-- DropIndex
DROP INDEX "ScheduleOverride_templateId_idx";

-- AlterTable
ALTER TABLE "ModelOffer" ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "ScheduleChangeRequest" DROP COLUMN "masterId",
DROP COLUMN "type";

-- DropEnum
DROP TYPE "ScheduleChangeRequestType";

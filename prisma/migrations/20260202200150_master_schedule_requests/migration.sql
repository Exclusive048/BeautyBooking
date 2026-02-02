-- CreateEnum
CREATE TYPE "ScheduleChangeRequestType" AS ENUM ('OFF', 'SHIFT', 'BLOCK');

-- CreateEnum
CREATE TYPE "ScheduleChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "TimeBlock" ALTER COLUMN "studioId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkException" ALTER COLUMN "studioId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ScheduleChangeRequest" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "type" "ScheduleChangeRequestType" NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" "ScheduleChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_studioId_masterId_createdAt_idx" ON "ScheduleChangeRequest"("studioId", "masterId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_masterId_status_createdAt_idx" ON "ScheduleChangeRequest"("masterId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

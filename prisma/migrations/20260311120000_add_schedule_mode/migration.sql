-- CreateEnum
CREATE TYPE "ScheduleMode" AS ENUM ('FLEXIBLE', 'FIXED');

-- AlterTable
ALTER TABLE "Provider"
ADD COLUMN "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'FLEXIBLE',
ADD COLUMN "fixedSlotTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

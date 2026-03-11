-- CreateEnum MUST come before AlterTable
CREATE TYPE "ScheduleMode" AS ENUM ('FLEXIBLE', 'FIXED');

-- AlterTable
ALTER TABLE "ScheduleOverride" 
  ADD COLUMN "fixedSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isWorkday" BOOLEAN,
  ADD COLUMN "scheduleMode" "ScheduleMode";

-- AlterTable
ALTER TABLE "WeeklyScheduleDay" 
  ADD COLUMN "fixedSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'FLEXIBLE';

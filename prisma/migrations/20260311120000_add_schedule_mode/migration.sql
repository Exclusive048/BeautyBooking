-- CreateEnum (safe)
DO $$ BEGIN
  CREATE TYPE "ScheduleMode" AS ENUM ('FLEXIBLE', 'FIXED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Provider"
ADD COLUMN IF NOT EXISTS "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'FLEXIBLE',
ADD COLUMN IF NOT EXISTS "fixedSlotTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
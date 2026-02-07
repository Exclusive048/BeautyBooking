-- CreateEnum
CREATE TYPE "ScheduleRuleKind" AS ENUM ('WEEKLY', 'CYCLE');

-- CreateEnum
CREATE TYPE "ScheduleOverrideKind" AS ENUM ('OFF', 'TIME_RANGE');

-- AlterTable
ALTER TABLE "MasterProfile"
ADD COLUMN "lastBookingsSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScheduleOverride"
ADD COLUMN "kind" "ScheduleOverrideKind" NOT NULL DEFAULT 'TIME_RANGE',
ADD COLUMN "note" TEXT;

-- Backfill override kind from legacy flag
UPDATE "ScheduleOverride"
SET "kind" = CASE
  WHEN "isDayOff" = TRUE THEN 'OFF'::"ScheduleOverrideKind"
  ELSE 'TIME_RANGE'::"ScheduleOverrideKind"
END;

-- AlterTable
ALTER TABLE "ScheduleBreak"
ADD COLUMN "note" TEXT;

-- CreateTable
CREATE TABLE "ScheduleRule" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "kind" "ScheduleRuleKind" NOT NULL,
  "timezone" TEXT NOT NULL,
  "anchorDate" TIMESTAMP(3),
  "payloadJson" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleRule_providerId_isActive_idx" ON "ScheduleRule"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "ScheduleRule_providerId_updatedAt_idx" ON "ScheduleRule"("providerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ScheduleRule"
ADD CONSTRAINT "ScheduleRule_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

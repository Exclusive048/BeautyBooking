-- CreateEnum
CREATE TYPE "ScheduleBreakKind" AS ENUM ('WEEKLY', 'OVERRIDE');

-- CreateTable
CREATE TABLE "ScheduleBreak" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "ScheduleBreakKind" NOT NULL,
    "dayOfWeek" INTEGER,
    "date" TIMESTAMP(3),
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_idx" ON "ScheduleBreak"("providerId");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_kind_idx" ON "ScheduleBreak"("providerId", "kind");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_kind_dayOfWeek_idx" ON "ScheduleBreak"("providerId", "kind", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_date_idx" ON "ScheduleBreak"("providerId", "date");

-- AddForeignKey
ALTER TABLE "ScheduleBreak" ADD CONSTRAINT "ScheduleBreak_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

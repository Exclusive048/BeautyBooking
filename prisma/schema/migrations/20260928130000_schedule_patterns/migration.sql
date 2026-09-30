-- SCHEDULE-PATTERNS-01 (этап 2, 2026-09-28): графики с датами — чередование
-- недель, смены N/M, периоды «с … по …» (решения владельца 2026-09-28).
--
-- Аддитивно: новые таблицы и две колонки с дефолтами, существующие строки не
-- трогаются. Перенос недель в графики — отдельный идемпотентный шаг
-- (`npm run deploy:post` → `backfillWeeklySchedulePatterns`), а до него движок
-- читает профиль без графика по-прежнему из `WeeklyScheduleConfig`. То есть
-- миграция не может оставить мастера без расписания, даже если перенос не
-- выполнится.

-- CreateEnum
CREATE TYPE "SchedulePatternKind" AS ENUM ('WEEK', 'WEEKS', 'CYCLE');

-- AlterTable
ALTER TABLE "ScheduleTemplate" ADD COLUMN     "fixedSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'FLEXIBLE';

-- CreateTable
CREATE TABLE "SchedulePattern" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "SchedulePatternKind" NOT NULL,
    "cycleDays" INTEGER NOT NULL,
    "anchorOn" VARCHAR(10) NOT NULL,
    "startsOn" VARCHAR(10),
    "endsOn" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePatternDay" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "SchedulePatternDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchedulePattern_providerId_startsOn_idx" ON "SchedulePattern"("providerId", "startsOn");

-- CreateIndex
CREATE INDEX "SchedulePatternDay_templateId_idx" ON "SchedulePatternDay"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePatternDay_patternId_position_key" ON "SchedulePatternDay"("patternId", "position");

-- AddForeignKey
ALTER TABLE "SchedulePattern" ADD CONSTRAINT "SchedulePattern_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePatternDay" ADD CONSTRAINT "SchedulePatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "SchedulePattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePatternDay" ADD CONSTRAINT "SchedulePatternDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

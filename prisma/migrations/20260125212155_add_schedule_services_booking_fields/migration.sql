-- CreateEnum
CREATE TYPE "BookingCancelledBy" AS ENUM ('CLIENT', 'PROVIDER', 'SYSTEM');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledBy" "BookingCancelledBy",
ADD COLUMN     "endAtUtc" TIMESTAMP(3),
ADD COLUMN     "masterProviderId" TEXT,
ADD COLUMN     "startAtUtc" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "studioId" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty';

-- CreateTable
CREATE TABLE "MasterService" (
    "id" TEXT NOT NULL,
    "masterProviderId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "priceOverride" INTEGER,
    "durationOverrideMin" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySchedule" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "startLocal" TEXT,
    "endLocal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterService_masterProviderId_idx" ON "MasterService"("masterProviderId");

-- CreateIndex
CREATE INDEX "MasterService_serviceId_idx" ON "MasterService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterService_masterProviderId_serviceId_key" ON "MasterService"("masterProviderId", "serviceId");

-- CreateIndex
CREATE INDEX "WeeklySchedule_providerId_idx" ON "WeeklySchedule"("providerId");

-- CreateIndex
CREATE INDEX "WeeklySchedule_providerId_dayOfWeek_idx" ON "WeeklySchedule"("providerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleOverride_providerId_idx" ON "ScheduleOverride"("providerId");

-- CreateIndex
CREATE INDEX "ScheduleOverride_providerId_date_idx" ON "ScheduleOverride"("providerId", "date");

-- CreateIndex
CREATE INDEX "ScheduleBlock_providerId_idx" ON "ScheduleBlock"("providerId");

-- CreateIndex
CREATE INDEX "ScheduleBlock_providerId_date_idx" ON "ScheduleBlock"("providerId", "date");

-- CreateIndex
CREATE INDEX "Booking_masterProviderId_idx" ON "Booking"("masterProviderId");

-- CreateIndex
CREATE INDEX "Booking_startAtUtc_idx" ON "Booking"("startAtUtc");

-- CreateIndex
CREATE INDEX "Provider_studioId_idx" ON "Provider"("studioId");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterService" ADD CONSTRAINT "MasterService_masterProviderId_fkey" FOREIGN KEY ("masterProviderId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterService" ADD CONSTRAINT "MasterService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_masterProviderId_fkey" FOREIGN KEY ("masterProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

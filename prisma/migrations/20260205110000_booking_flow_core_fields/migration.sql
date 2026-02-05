-- CreateEnum
CREATE TYPE "BookingRequestedBy" AS ENUM ('CLIENT', 'MASTER');

-- CreateEnum
CREATE TYPE "BookingActionRequiredBy" AS ENUM ('CLIENT', 'MASTER');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CHANGE_REQUESTED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "proposedStartAt" TIMESTAMP(3),
ADD COLUMN "proposedEndAt" TIMESTAMP(3),
ADD COLUMN "requestedBy" "BookingRequestedBy",
ADD COLUMN "changeComment" TEXT,
ADD COLUMN "actionRequiredBy" "BookingActionRequiredBy",
ADD COLUMN "clientChangeRequestsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "masterChangeRequestsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "StudioMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MASTER', 'FINANCE');

-- CreateEnum
CREATE TYPE "StudioMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('MANUAL', 'WEB', 'APP');

-- CreateEnum
CREATE TYPE "TimeBlockType" AS ENUM ('BREAK', 'BLOCK');

-- CreateEnum
CREATE TYPE "WorkExceptionType" AS ENUM ('OFF', 'SHIFT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'NEW';
ALTER TYPE "BookingStatus" ADD VALUE 'PREPAID';
ALTER TYPE "BookingStatus" ADD VALUE 'STARTED';
ALTER TYPE "BookingStatus" ADD VALUE 'FINISHED';
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "clientNameSnapshot" TEXT,
ADD COLUMN     "clientPhoneSnapshot" TEXT,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "masterId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "studioId" TEXT;

-- AlterTable
ALTER TABLE "MasterService" ADD COLUMN     "commissionPct" DOUBLE PRECISION,
ADD COLUMN     "masterId" TEXT,
ADD COLUMN     "studioId" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "masterId" TEXT,
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "replyText" TEXT,
ADD COLUMN     "studioId" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "baseDurationMin" INTEGER,
ADD COLUMN     "basePrice" INTEGER,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "studioId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "StudioMember" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StudioMemberRole" NOT NULL,
    "status" "StudioMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingServiceItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "studioId" TEXT,
    "serviceId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "durationSnapshotMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShiftTemplate" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "masterId" TEXT,
    "title" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakRulesJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDayRule" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkException" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "WorkExceptionType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "type" "TimeBlockType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "studioId" TEXT,
    "masterId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "caption" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItemService" (
    "portfolioItemId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItemService_pkey" PRIMARY KEY ("portfolioItemId","serviceId")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioMember_userId_status_idx" ON "StudioMember"("userId", "status");

-- CreateIndex
CREATE INDEX "StudioMember_studioId_status_idx" ON "StudioMember"("studioId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioMember_studioId_userId_role_key" ON "StudioMember"("studioId", "userId", "role");

-- CreateIndex
CREATE INDEX "ServiceCategory_studioId_sortOrder_idx" ON "ServiceCategory"("studioId", "sortOrder");

-- CreateIndex
CREATE INDEX "BookingServiceItem_bookingId_idx" ON "BookingServiceItem"("bookingId");

-- CreateIndex
CREATE INDEX "BookingServiceItem_studioId_idx" ON "BookingServiceItem"("studioId");

-- CreateIndex
CREATE INDEX "BookingServiceItem_serviceId_idx" ON "BookingServiceItem"("serviceId");

-- CreateIndex
CREATE INDEX "WorkShiftTemplate_studioId_masterId_idx" ON "WorkShiftTemplate"("studioId", "masterId");

-- CreateIndex
CREATE INDEX "WorkDayRule_templateId_idx" ON "WorkDayRule"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDayRule_studioId_masterId_weekday_key" ON "WorkDayRule"("studioId", "masterId", "weekday");

-- CreateIndex
CREATE INDEX "WorkException_studioId_masterId_date_idx" ON "WorkException"("studioId", "masterId", "date");

-- CreateIndex
CREATE INDEX "TimeBlock_studioId_masterId_startAt_endAt_idx" ON "TimeBlock"("studioId", "masterId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_masterId_createdAt_idx" ON "PortfolioItem"("masterId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_studioId_createdAt_idx" ON "PortfolioItem"("studioId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItemService_serviceId_idx" ON "PortfolioItemService"("serviceId");

-- CreateIndex
CREATE INDEX "Favorite_portfolioItemId_createdAt_idx" ON "Favorite"("portfolioItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_portfolioItemId_key" ON "Favorite"("userId", "portfolioItemId");

-- CreateIndex
CREATE INDEX "Booking_studioId_idx" ON "Booking"("studioId");

-- CreateIndex
CREATE INDEX "Booking_masterId_idx" ON "Booking"("masterId");

-- CreateIndex
CREATE INDEX "Booking_status_startAtUtc_idx" ON "Booking"("status", "startAtUtc");

-- CreateIndex
CREATE INDEX "Review_studioId_createdAt_idx" ON "Review"("studioId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_masterId_createdAt_idx" ON "Review"("masterId", "createdAt");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterService" ADD CONSTRAINT "MasterService_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMember" ADD CONSTRAINT "StudioMember_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMember" ADD CONSTRAINT "StudioMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingServiceItem" ADD CONSTRAINT "BookingServiceItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingServiceItem" ADD CONSTRAINT "BookingServiceItem_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingServiceItem" ADD CONSTRAINT "BookingServiceItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShiftTemplate" ADD CONSTRAINT "WorkShiftTemplate_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDayRule" ADD CONSTRAINT "WorkDayRule_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDayRule" ADD CONSTRAINT "WorkDayRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkShiftTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkException" ADD CONSTRAINT "WorkException_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemService" ADD CONSTRAINT "PortfolioItemService_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemService" ADD CONSTRAINT "PortfolioItemService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

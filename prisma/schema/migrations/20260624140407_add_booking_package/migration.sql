-- CreateEnum
CREATE TYPE "BookingPackageStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "bookingPackageId" TEXT;

-- AlterTable
ALTER TABLE "ServicePackageItem" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- PACKAGE-BOOKING-MVP-1: backfill sortOrder by the current per-package
-- createdAt order so existing packages keep their component sequence.
WITH ordered AS (
  SELECT "packageId", "serviceId",
         ROW_NUMBER() OVER (
           PARTITION BY "packageId" ORDER BY "createdAt" ASC, "serviceId" ASC
         ) - 1 AS rn
  FROM "ServicePackageItem"
)
UPDATE "ServicePackageItem" spi
SET "sortOrder" = ordered.rn
FROM ordered
WHERE spi."packageId" = ordered."packageId"
  AND spi."serviceId" = ordered."serviceId";

-- CreateTable
CREATE TABLE "BookingPackage" (
    "id" TEXT NOT NULL,
    "servicePackageId" TEXT,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "totalKopeks" INTEGER NOT NULL DEFAULT 0,
    "status" "BookingPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPackage_providerId_idx" ON "BookingPackage"("providerId");

-- CreateIndex
CREATE INDEX "BookingPackage_clientUserId_idx" ON "BookingPackage"("clientUserId");

-- CreateIndex
CREATE INDEX "BookingPackage_servicePackageId_idx" ON "BookingPackage"("servicePackageId");

-- CreateIndex
CREATE INDEX "Booking_bookingPackageId_idx" ON "Booking"("bookingPackageId");

-- CreateIndex
CREATE INDEX "ServicePackageItem_packageId_sortOrder_idx" ON "ServicePackageItem"("packageId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingPackageId_fkey" FOREIGN KEY ("bookingPackageId") REFERENCES "BookingPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPackage" ADD CONSTRAINT "BookingPackage_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "ServicePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPackage" ADD CONSTRAINT "BookingPackage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPackage" ADD CONSTRAINT "BookingPackage_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

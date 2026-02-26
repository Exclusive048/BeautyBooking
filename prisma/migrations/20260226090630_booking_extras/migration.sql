-- AlterEnum
ALTER TYPE "MediaEntityType" ADD VALUE 'BOOKING';

-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'BOOKING_REFERENCE';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "bookingAnswers" JSONB,
ADD COLUMN     "referencePhotoAssetId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "requiresReferencePhoto" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceBookingQuestion" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceBookingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceBookingQuestion_serviceId_idx" ON "ServiceBookingQuestion"("serviceId");

-- AddForeignKey
ALTER TABLE "ServiceBookingQuestion" ADD CONSTRAINT "ServiceBookingQuestion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_referencePhotoAssetId_fkey" FOREIGN KEY ("referencePhotoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

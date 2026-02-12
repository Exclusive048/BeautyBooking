-- Add model hunting enums
CREATE TYPE "ModelOfferStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "ModelApplicationStatus" AS ENUM ('PENDING', 'REJECTED', 'APPROVED_WAITING_CLIENT', 'CONFIRMED');

-- Extend existing enums
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODEL_NEW_APPLICATION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODEL_APPLICATION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODEL_TIME_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODEL_BOOKING_CREATED';

ALTER TYPE "MediaEntityType" ADD VALUE IF NOT EXISTS 'MODEL_APPLICATION';
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'MODEL_APPLICATION_PHOTO';

-- Create ModelOffer
CREATE TABLE "ModelOffer" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "masterServiceId" TEXT NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "timeRangeStartLocal" TEXT NOT NULL,
    "timeRangeEndLocal" TEXT NOT NULL,
    "price" DECIMAL,
    "requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "extraBusyMin" INTEGER NOT NULL DEFAULT 0,
    "status" "ModelOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelOffer_masterId_idx" ON "ModelOffer"("masterId");
CREATE INDEX "ModelOffer_status_idx" ON "ModelOffer"("status");
CREATE INDEX "ModelOffer_dateLocal_idx" ON "ModelOffer"("dateLocal");
CREATE INDEX "ModelOffer_masterServiceId_idx" ON "ModelOffer"("masterServiceId");

ALTER TABLE "ModelOffer" ADD CONSTRAINT "ModelOffer_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelOffer" ADD CONSTRAINT "ModelOffer_masterServiceId_fkey" FOREIGN KEY ("masterServiceId") REFERENCES "MasterService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create ModelApplication
CREATE TABLE "ModelApplication" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "status" "ModelApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "clientNote" TEXT,
    "consentToShoot" BOOLEAN NOT NULL,
    "proposedTimeLocal" TEXT,
    "confirmedStartAt" TIMESTAMP(3),
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelApplication_offerId_clientUserId_key" ON "ModelApplication"("offerId", "clientUserId");
CREATE UNIQUE INDEX "ModelApplication_bookingId_key" ON "ModelApplication"("bookingId");
CREATE INDEX "ModelApplication_offerId_idx" ON "ModelApplication"("offerId");
CREATE INDEX "ModelApplication_status_idx" ON "ModelApplication"("status");
CREATE INDEX "ModelApplication_clientUserId_idx" ON "ModelApplication"("clientUserId");

ALTER TABLE "ModelApplication" ADD CONSTRAINT "ModelApplication_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ModelOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelApplication" ADD CONSTRAINT "ModelApplication_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelApplication" ADD CONSTRAINT "ModelApplication_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

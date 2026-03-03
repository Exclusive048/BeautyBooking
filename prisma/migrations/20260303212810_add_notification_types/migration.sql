-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELLED_BY_MASTER';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELLED_BY_CLIENT';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_RESCHEDULE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_COMPLETED_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_NO_SHOW';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_LEFT';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_REPLIED';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_INVITE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_INVITE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_INVITE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_MEMBER_LEFT';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_SCHEDULE_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_SCHEDULE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_SCHEDULE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'MODEL_APPLICATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'MODEL_TIME_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'HOT_SLOT_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'HOT_SLOT_BOOKED';
ALTER TYPE "NotificationType" ADD VALUE 'HOT_SLOT_EXPIRING';

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

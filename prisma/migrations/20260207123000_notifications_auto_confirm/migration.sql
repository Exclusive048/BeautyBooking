-- Add new notification enum values
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_DECLINED';

-- Provider auto-confirm toggle for solo masters
ALTER TABLE "Provider"
ADD COLUMN "autoConfirmBookings" BOOLEAN NOT NULL DEFAULT false;

-- Notification payload + read flag
ALTER TABLE "Notification"
ADD COLUMN "payloadJson" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "Notification"
ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Notification"
SET "isRead" = true
WHERE "readAt" IS NOT NULL;

UPDATE "Notification"
SET "body" = ''
WHERE "body" IS NULL;

ALTER TABLE "Notification"
ALTER COLUMN "body" SET NOT NULL;

DROP INDEX IF EXISTS "Notification_userId_readAt_idx";
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification" ("userId", "isRead", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification" ("userId", "createdAt");

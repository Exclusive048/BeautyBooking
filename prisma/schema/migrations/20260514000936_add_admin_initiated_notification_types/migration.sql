-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "NotificationType" ADD VALUE 'BILLING_PLAN_GRANTED_BY_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_PLAN_EDITED';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_PAYMENT_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_DELETED_BY_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_GRANTED_BY_ADMIN';

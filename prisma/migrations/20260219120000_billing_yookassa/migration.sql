-- CreateEnum
CREATE TYPE "SubscriptionScope" AS ENUM ('MASTER', 'STUDIO');

-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING_PAYMENT_SUCCEEDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING_PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING_RENEWAL_CONFIRMATION_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING_SUBSCRIPTION_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BILLING_SUBSCRIPTION_EXPIRED';

-- AlterTable
ALTER TABLE "BillingPlan" ADD COLUMN "scope" "SubscriptionScope" NOT NULL DEFAULT 'MASTER';

-- Data migration: backfill scope from providerType; fallback to code if needed.
UPDATE "BillingPlan"
SET "scope" = CASE
  WHEN "providerType" = 'MASTER' THEN 'MASTER'::"SubscriptionScope"
  WHEN "providerType" = 'STUDIO' THEN 'STUDIO'::"SubscriptionScope"
  WHEN "code" ILIKE '%MASTER%' THEN 'MASTER'::"SubscriptionScope"
  WHEN "code" ILIKE '%STUDIO%' THEN 'STUDIO'::"SubscriptionScope"
  ELSE 'MASTER'::"SubscriptionScope" -- fallback for ambiguous legacy rows
END;

-- Log ambiguous rows (no providerType and no code marker).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BillingPlan"
    WHERE "providerType" IS NULL
      AND "code" NOT ILIKE '%MASTER%'
      AND "code" NOT ILIKE '%STUDIO%'
  ) THEN
    RAISE NOTICE 'BillingPlan.scope fallback to MASTER for ambiguous rows; review codes.';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "BillingPlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "periodMonths" INTEGER NOT NULL,
    "priceKopeks" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BillingPlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlanPrice_planId_periodMonths_key" ON "BillingPlanPrice"("planId", "periodMonths");
CREATE INDEX "BillingPlanPrice_periodMonths_idx" ON "BillingPlanPrice"("periodMonths");

-- AddForeignKey
ALTER TABLE "BillingPlanPrice" ADD CONSTRAINT "BillingPlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: move BillingPlan.price into kopeks prices with rub/kopeks heuristic
WITH base_prices AS (
  SELECT
    "id",
    CASE WHEN "price" >= 10000 THEN "price" ELSE "price" * 100 END AS "monthlyKopeks"
  FROM "BillingPlan"
)
INSERT INTO "BillingPlanPrice" ("id", "planId", "periodMonths", "priceKopeks", "isActive")
SELECT
  md5("id" || ':' || period::text),
  "id",
  period,
  "monthlyKopeks" * period,
  true
FROM base_prices
CROSS JOIN (VALUES (1), (3), (6), (12)) AS p(period);

-- DropColumn
ALTER TABLE "BillingPlan" DROP COLUMN "price";
ALTER TABLE "BillingPlan" DROP COLUMN "providerType";

-- AlterTable UserSubscription
ALTER TABLE "UserSubscription" RENAME COLUMN "startsAt" TO "startedAt";
ALTER TABLE "UserSubscription" RENAME COLUMN "endsAt" TO "currentPeriodEnd";

ALTER TABLE "UserSubscription" ADD COLUMN "scope" "SubscriptionScope";
ALTER TABLE "UserSubscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN "periodMonths" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "UserSubscription" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSubscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSubscription" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN "graceUntil" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN "nextBillingAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "UserSubscription" ADD COLUMN "lastPaymentAt" TIMESTAMP(3);

UPDATE "UserSubscription" SET "currentPeriodStart" = "startedAt" WHERE "currentPeriodStart" IS NULL;
UPDATE "UserSubscription" SET "nextBillingAt" = "currentPeriodEnd" WHERE "currentPeriodEnd" IS NOT NULL;

UPDATE "UserSubscription" SET "scope" = bp."scope" FROM "BillingPlan" bp WHERE bp."id" = "UserSubscription"."planId";
ALTER TABLE "UserSubscription" ALTER COLUMN "scope" SET NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "UserSubscription_userId_key";
DROP INDEX IF EXISTS "UserSubscription_status_idx";
DROP INDEX IF EXISTS "UserSubscription_planId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_scope_key" ON "UserSubscription"("userId", "scope");
CREATE INDEX "UserSubscription_status_autoRenew_nextBillingAt_idx" ON "UserSubscription"("status", "autoRenew", "nextBillingAt");
CREATE INDEX "UserSubscription_status_graceUntil_idx" ON "UserSubscription"("status", "graceUntil");

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL,
    "amountKopeks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "periodMonths" INTEGER NOT NULL,
    "yookassaPaymentId" TEXT,
    "confirmationUrl" TEXT,
    "idempotenceKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_yookassaPaymentId_key" ON "BillingPayment"("yookassaPaymentId");
CREATE UNIQUE INDEX "BillingPayment_idempotenceKey_key" ON "BillingPayment"("idempotenceKey");
CREATE INDEX "BillingPayment_subscriptionId_status_idx" ON "BillingPayment"("subscriptionId", "status");
CREATE INDEX "BillingPayment_status_createdAt_idx" ON "BillingPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "SubscriptionScope",
    "subscriptionId" TEXT,
    "paymentId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingAuditLog_userId_createdAt_idx" ON "BillingAuditLog"("userId", "createdAt");
CREATE INDEX "BillingAuditLog_action_createdAt_idx" ON "BillingAuditLog"("action", "createdAt");

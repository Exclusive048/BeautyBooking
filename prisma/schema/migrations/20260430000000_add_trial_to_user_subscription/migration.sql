-- AlterTable: trial fields on UserSubscription.
-- See model comment in billing.prisma for the in-place mutation contract.
ALTER TABLE "UserSubscription"
  ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "trialEndingNotificationSentAt" TIMESTAMP(3);

-- Partial index on active trial rows only — keeps the index small and fast for
-- the only query that hits these columns (the trial-expiry cron).
CREATE INDEX "UserSubscription_isTrial_trialEndsAt_idx"
  ON "UserSubscription" ("isTrial", "trialEndsAt")
  WHERE "isTrial" = true;

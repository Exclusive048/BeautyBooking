-- MIGRATION-RECONCILIATION-BATCH (2026-05-30) — reconciles schema.prisma vs migrations history
-- after sprint-long drift from `prisma db push` usage (documented in seeds README pre-fix).
-- See MASTERRYADOM_AI_CONTEXT.md раздел 15 + BACKLOG.md «MIGRATION-RECONCILIATION» for context.
--
-- Generated via: prisma migrate diff --from-migrations prisma/schema/migrations
--                                    --to-schema-datamodel prisma/schema --script
-- Manual review of 24 operations completed; one CREATE INDEX deliberately skipped (see note below).

-- AlterEnum
ALTER TYPE "ChatSenderType" ADD VALUE 'SYSTEM';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "referencedBookingId" TEXT,
ADD COLUMN     "systemEventKey" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "acceptNewClients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateCancelAction" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "maxBookingDaysAhead" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "minBookingHoursAhead" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "slotPrecision" TEXT NOT NULL DEFAULT 'exact',
ADD COLUMN     "slotStepMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "visibleSlotDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "ScheduleTemplateBreak" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "hideAgeYear" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ConversationSlug" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSlug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackageItem" (
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePackageItem_pkey" PRIMARY KEY ("packageId","serviceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSlug_slug_key" ON "ConversationSlug"("slug");

-- CreateIndex
CREATE INDEX "ConversationSlug_slug_idx" ON "ConversationSlug"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSlug_providerId_clientUserId_key" ON "ConversationSlug"("providerId", "clientUserId");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_createdAt_idx" ON "UserFavorite"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_providerId_key" ON "UserFavorite"("userId", "providerId");

-- CreateIndex
CREATE INDEX "ServicePackage_masterId_sortOrder_idx" ON "ServicePackage"("masterId", "sortOrder");

-- CreateIndex
CREATE INDEX "ServicePackage_masterId_isEnabled_idx" ON "ServicePackage"("masterId", "isEnabled");

-- CreateIndex
CREATE INDEX "ServicePackageItem_serviceId_idx" ON "ServicePackageItem"("serviceId");

-- CreateIndex
CREATE INDEX "ChatMessage_referencedBookingId_idx" ON "ChatMessage"("referencedBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_referencedBookingId_systemEventKey_key" ON "ChatMessage"("referencedBookingId", "systemEventKey");

-- CreateIndex
CREATE INDEX "Notification_userId_deletedAt_createdAt_idx" ON "Notification"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_masterId_sortOrder_idx" ON "PortfolioItem"("masterId", "sortOrder");

-- NOTE (MIGRATION-RECONCILIATION review 2026-05-30):
-- The Prisma diff generator wanted to add this index here:
--   CREATE INDEX "UserSubscription_isTrial_trialEndsAt_idx" ON "UserSubscription"("isTrial", "trialEndsAt");
-- DELIBERATELY SKIPPED — earlier migration 20260430000000_add_trial_to_user_subscription
-- already created an index of this exact name as a PARTIAL index
-- (WHERE "isTrial" = true) which the schema's `@@index([isTrial, trialEndsAt])`
-- decorator cannot express in Prisma. The partial index covers the only query that
-- uses it (cron lookup of expiring trials where isTrial=true), so the optimization is
-- preserved. Schema decorator and DB state intentionally diverge here; do not let CI
-- drift checker auto-reconcile by dropping the partial. See backlog item
-- TRIAL-INDEX-FORMALIZE for an optional cleanup that aligns both representations.

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_referencedBookingId_fkey" FOREIGN KEY ("referencedBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

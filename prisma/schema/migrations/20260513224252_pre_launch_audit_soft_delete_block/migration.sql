-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('USER_PLAN_GRANTED', 'USER_BLOCKED', 'USER_UNBLOCKED', 'USER_ROLE_ADDED', 'USER_ROLE_REMOVED', 'USER_ACCOUNT_DELETED', 'BILLING_PLAN_EDITED', 'BILLING_SUBSCRIPTION_CANCELLED', 'BILLING_PAYMENT_REFUNDED', 'CITY_CREATED', 'CITY_UPDATED', 'CITY_DELETED', 'CITY_MERGED', 'CITY_VERIFIED', 'CATEGORY_APPROVED', 'CATEGORY_REJECTED', 'CATEGORY_EDITED', 'REVIEW_APPROVED', 'REVIEW_DELETED', 'REVIEW_RESTORED', 'SETTINGS_LOGO_UPDATED', 'SETTINGS_LOGIN_HERO_UPDATED', 'SETTINGS_SEO_UPDATED', 'SETTINGS_FLAG_TOGGLED', 'SETTINGS_APP_SETTING_UPDATED');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletedReason" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedByUserId" TEXT,
ADD COLUMN     "blockedReason" TEXT;

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("targetType", "targetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_deletedAt_idx" ON "Review"("deletedAt");

-- CreateIndex
CREATE INDEX "UserProfile_blockedAt_idx" ON "UserProfile"("blockedAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_blockedByUserId_fkey" FOREIGN KEY ("blockedByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

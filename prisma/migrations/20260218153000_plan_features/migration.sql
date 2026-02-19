-- AlterTable
ALTER TABLE "BillingPlan" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingPlan" ADD COLUMN     "inheritsFromPlanId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientNote_masterId_clientUserId_key" ON "ClientNote"("masterId", "clientUserId");

-- CreateIndex
CREATE INDEX "ClientNote_clientUserId_idx" ON "ClientNote"("clientUserId");

-- AddForeignKey
ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_inheritsFromPlanId_fkey" FOREIGN KEY ("inheritsFromPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

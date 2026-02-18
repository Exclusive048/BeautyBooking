-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'PREMIUM');

-- AlterTable
ALTER TABLE "BillingPlan" ADD COLUMN     "tier" "PlanTier" NOT NULL DEFAULT 'FREE';
ALTER TABLE "BillingPlan" ADD COLUMN     "providerType" "ProviderType" NOT NULL DEFAULT 'MASTER';

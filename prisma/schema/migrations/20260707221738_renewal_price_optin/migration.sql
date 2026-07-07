-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_RENEWAL_PRICE_INCREASE';

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "pendingPriceKopeks" INTEGER,
ADD COLUMN     "pendingPriceOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceOptIn24hSentAt" TIMESTAMP(3),
ADD COLUMN     "priceOptIn2hSentAt" TIMESTAMP(3);

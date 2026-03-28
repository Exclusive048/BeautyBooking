-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN "smartPriceEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HotSlot" ADD COLUMN "isAuto" BOOLEAN NOT NULL DEFAULT false;

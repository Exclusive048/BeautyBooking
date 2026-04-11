-- Add publicCode to ModelOffer for public-safe URL slugs
ALTER TABLE "ModelOffer" ADD COLUMN "publicCode" TEXT;

-- Backfill existing rows with a random unique code (uuid-based, prefixed)
UPDATE "ModelOffer" SET "publicCode" = 'mc' || replace(gen_random_uuid()::text, '-', '') WHERE "publicCode" IS NULL;

-- Apply NOT NULL constraint after backfill
ALTER TABLE "ModelOffer" ALTER COLUMN "publicCode" SET NOT NULL;

-- Add unique index
CREATE UNIQUE INDEX "ModelOffer_publicCode_key" ON "ModelOffer"("publicCode");

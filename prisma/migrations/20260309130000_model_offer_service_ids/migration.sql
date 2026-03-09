-- Add selected services snapshot to model offers
ALTER TABLE "ModelOffer"
ADD COLUMN "serviceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

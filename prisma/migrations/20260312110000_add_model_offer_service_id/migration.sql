ALTER TABLE "ModelOffer" ADD COLUMN "serviceId" TEXT;

ALTER TABLE "ModelOffer" ALTER COLUMN "masterServiceId" DROP NOT NULL;

CREATE INDEX "ModelOffer_serviceId_idx" ON "ModelOffer"("serviceId");

ALTER TABLE "ModelOffer" ADD CONSTRAINT "ModelOffer_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

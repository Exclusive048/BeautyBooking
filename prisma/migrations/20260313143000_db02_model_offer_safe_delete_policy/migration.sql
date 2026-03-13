-- DB-02: prevent unexpected ModelOffer loss when Service/MasterService is deleted.
ALTER TABLE "ModelOffer" DROP CONSTRAINT IF EXISTS "ModelOffer_masterServiceId_fkey";
ALTER TABLE "ModelOffer" DROP CONSTRAINT IF EXISTS "ModelOffer_serviceId_fkey";

ALTER TABLE "ModelOffer"
  ADD CONSTRAINT "ModelOffer_masterServiceId_fkey"
  FOREIGN KEY ("masterServiceId") REFERENCES "MasterService"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModelOffer"
  ADD CONSTRAINT "ModelOffer_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

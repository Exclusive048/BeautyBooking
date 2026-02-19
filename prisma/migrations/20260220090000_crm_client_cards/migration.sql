-- CRM client cards + photos
ALTER TYPE "MediaEntityType" ADD VALUE IF NOT EXISTS 'CLIENT_CARD';
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'CLIENT_CARD_PHOTO';

CREATE TABLE "ClientCard" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "clientUserId" TEXT,
  "clientPhone" TEXT,
  "notes" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientCardPhoto" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "caption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientCardPhoto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClientCard"
  ADD CONSTRAINT "ClientCard_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientCard"
  ADD CONSTRAINT "ClientCard_clientUserId_fkey"
  FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientCardPhoto"
  ADD CONSTRAINT "ClientCardPhoto_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "ClientCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientCardPhoto"
  ADD CONSTRAINT "ClientCardPhoto_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ClientCardPhoto_mediaAssetId_key" ON "ClientCardPhoto"("mediaAssetId");
CREATE INDEX "ClientCardPhoto_cardId_idx" ON "ClientCardPhoto"("cardId");

CREATE INDEX "ClientCard_providerId_idx" ON "ClientCard"("providerId");
CREATE INDEX "ClientCard_clientUserId_idx" ON "ClientCard"("clientUserId");
CREATE INDEX "ClientCard_clientPhone_idx" ON "ClientCard"("clientPhone");
CREATE INDEX "ClientCard_providerId_clientUserId_idx" ON "ClientCard"("providerId", "clientUserId");
CREATE INDEX "ClientCard_providerId_clientPhone_idx" ON "ClientCard"("providerId", "clientPhone");

CREATE UNIQUE INDEX "ClientCard_providerId_clientUserId_key"
  ON "ClientCard"("providerId", "clientUserId")
  WHERE "clientUserId" IS NOT NULL;

CREATE UNIQUE INDEX "ClientCard_providerId_clientPhone_key"
  ON "ClientCard"("providerId", "clientPhone")
  WHERE "clientPhone" IS NOT NULL;

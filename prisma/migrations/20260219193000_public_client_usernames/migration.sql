-- Add public usernames for client profiles
ALTER TABLE "UserProfile" ADD COLUMN "publicUsername" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "publicUsernameUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "UserProfile_publicUsername_key" ON "UserProfile"("publicUsername");

-- Extend aliases for client profiles
ALTER TABLE "PublicUsernameAlias" ADD COLUMN "clientUserId" TEXT;
ALTER TABLE "PublicUsernameAlias" ALTER COLUMN "providerId" DROP NOT NULL;

ALTER TABLE "PublicUsernameAlias"
  ADD CONSTRAINT "PublicUsernameAlias_clientUserId_fkey"
  FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PublicUsernameAlias_clientUserId_idx" ON "PublicUsernameAlias"("clientUserId");

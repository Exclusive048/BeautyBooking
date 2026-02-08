ALTER TABLE "Provider" ADD COLUMN "publicUsername" TEXT;
ALTER TABLE "Provider" ADD COLUMN "publicUsernameUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Provider_publicUsername_key" ON "Provider"("publicUsername");

CREATE TABLE "PublicUsernameAlias" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicUsernameAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicUsernameAlias_username_key" ON "PublicUsernameAlias"("username");
CREATE INDEX "PublicUsernameAlias_providerId_idx" ON "PublicUsernameAlias"("providerId");

ALTER TABLE "PublicUsernameAlias"
ADD CONSTRAINT "PublicUsernameAlias_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "Provider"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

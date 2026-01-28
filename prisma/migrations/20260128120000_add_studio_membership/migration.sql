-- CreateEnum
CREATE TYPE "StudioRole" AS ENUM ('ADMIN', 'MASTER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED');

-- CreateTable
CREATE TABLE "Studio" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "roles" "StudioRole"[],
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Studio_providerId_key" ON "Studio"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_userId_key" ON "MasterProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_providerId_key" ON "MasterProfile"("providerId");

-- CreateIndex
CREATE INDEX "StudioMembership_userId_idx" ON "StudioMembership"("userId");

-- CreateIndex
CREATE INDEX "StudioMembership_studioId_idx" ON "StudioMembership"("studioId");

-- CreateIndex
CREATE INDEX "StudioMembership_status_idx" ON "StudioMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioMembership_userId_studioId_key" ON "StudioMembership"("userId", "studioId");

-- AddForeignKey
ALTER TABLE "Studio" ADD CONSTRAINT "Studio_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMembership" ADD CONSTRAINT "StudioMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMembership" ADD CONSTRAINT "StudioMembership_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

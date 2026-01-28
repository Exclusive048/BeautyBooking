-- CreateTable
CREATE TABLE "StudioInvite" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioInvite_studioId_idx" ON "StudioInvite"("studioId");

-- CreateIndex
CREATE INDEX "StudioInvite_phone_idx" ON "StudioInvite"("phone");

-- CreateIndex
CREATE INDEX "StudioInvite_status_idx" ON "StudioInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioInvite_studioId_phone_key" ON "StudioInvite"("studioId", "phone");

-- AddForeignKey
ALTER TABLE "StudioInvite" ADD CONSTRAINT "StudioInvite_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioInvite" ADD CONSTRAINT "StudioInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

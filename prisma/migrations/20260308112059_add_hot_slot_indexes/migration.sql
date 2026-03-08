-- CreateIndex
CREATE INDEX "HotSlot_isActive_expiresAtUtc_idx" ON "HotSlot"("isActive", "expiresAtUtc");

-- CreateIndex
CREATE INDEX "HotSlot_providerId_isActive_idx" ON "HotSlot"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "Booking_providerId_startAtUtc_endAtUtc_idx" ON "Booking"("providerId", "startAtUtc", "endAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_providerId_masterId_startAtUtc_endAtUtc_status_key" ON "Booking"("providerId", "masterId", "startAtUtc", "endAtUtc", "status");

CREATE INDEX IF NOT EXISTS idx_booking_provider_start ON "Booking" ("providerId","startAtUtc");
CREATE INDEX IF NOT EXISTS idx_booking_provider_end ON "Booking" ("providerId","endAtUtc");
CREATE INDEX IF NOT EXISTS idx_booking_provider_status_start ON "Booking" ("providerId","status","startAtUtc");
CREATE INDEX IF NOT EXISTS idx_booking_provider_status_end ON "Booking" ("providerId","status","endAtUtc");

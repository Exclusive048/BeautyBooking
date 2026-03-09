-- Drop old broad unique constraint that allowed same slot across different statuses
DROP INDEX IF EXISTS "Booking_providerId_masterId_startAtUtc_endAtUtc_status_key";

-- Active bookings must be unique per provider/time slot
CREATE UNIQUE INDEX IF NOT EXISTS "booking_slot_unique_active"
ON "Booking" ("providerId", "startAtUtc", "endAtUtc")
WHERE status NOT IN ('CANCELLED', 'NO_SHOW', 'REJECTED');

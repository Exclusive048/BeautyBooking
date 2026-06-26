-- FIX-EXP-NOTIFICATIONS (EXP-027): per-user push on/off preference.
-- Opt-in (default false). Additive, non-destructive (ADD COLUMN with default).
ALTER TABLE "UserProfile" ADD COLUMN "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

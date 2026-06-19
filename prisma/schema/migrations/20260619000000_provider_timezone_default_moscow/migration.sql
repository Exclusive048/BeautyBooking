-- FIX-R2-02-A — resolve the long-standing T4 inconsistency where
-- `Provider.timezone` defaulted to 'Asia/Almaty' while City.timezone +
-- env.DEFAULT_TIMEZONE + .env all use 'Europe/Moscow'. New providers that
-- omit a timezone now start on the platform default; the working tz is
-- re-derived from the provider's City on address-save.
--
-- Non-destructive: only changes the column DEFAULT for future inserts.
-- Existing rows keep their stored value (a master legitimately on
-- Asia/Almaty is NOT shifted).
ALTER TABLE "Provider" ALTER COLUMN "timezone" SET DEFAULT 'Europe/Moscow';

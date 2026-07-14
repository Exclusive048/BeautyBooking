-- FEAT-PROVIDER-SOCIALS: free-text VK / Instagram community-page links on
-- Provider (serves both studios and masters — both are Provider rows).
-- Stored as a normalized, safe `https://<host>/<handle>` URL (or NULL).
-- Additive, non-destructive (two nullable columns, no default, no backfill).
-- Created with --create-only semantics: NOT auto-applied — apply on prod via
-- `npx prisma migrate deploy` (rule 16).
ALTER TABLE "Provider" ADD COLUMN "socialVk" TEXT;
ALTER TABLE "Provider" ADD COLUMN "socialInstagram" TEXT;

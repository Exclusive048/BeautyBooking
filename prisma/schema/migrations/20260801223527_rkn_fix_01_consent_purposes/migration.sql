-- RKN-FIX-01 — consent recorded per purpose, per document version
-- (152-ФЗ ст. 9 в ред. 156-ФЗ, действует с 01.09.2025).
--
-- 1. `PD_PROCESSING` — consent to personal-data processing gets its own value
--    instead of overloading `PRIVACY`. The privacy policy is an informational
--    disclosure; the PD consent is a separate act against a separate document
--    (`/consent`), and the stored row has to say which of the two it proves.
--    NOTE: Postgres forbids USING a new enum value in the transaction that adds
--    it. Nothing here does — the value is only written by application code.
--
-- 2. The uniqueness moves from (userId, consentType) to
--    (userId, consentType, documentVersion). One row per version means a
--    version bump produces a NEW row on the next login while the earlier proof
--    survives — that history is the evidence 152-ФЗ asks for. The old
--    constraint made version bumps unrepresentable.
--
-- Pre-launch: only seed/test accounts exist, so no backfill is needed. Existing
-- rows keep their `documentVersion` and simply widen into the new constraint;
-- duplicates are impossible because the old constraint was strictly narrower.

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'PD_PROCESSING';

-- DropIndex
DROP INDEX "UserConsent_userId_consentType_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserConsent_userId_consentType_documentVersion_key" ON "UserConsent"("userId", "consentType", "documentVersion");

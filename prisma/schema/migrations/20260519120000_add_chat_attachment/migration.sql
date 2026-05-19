-- CHAT-FOUNDATION-A-MIGRATION
-- Adds optional image-attachment support to ChatMessage, mirroring the
-- booking-reference upload pattern (kind+entityType-tagged MediaAsset,
-- owner-scoped via createdByUserId, marked used when persisted).
--
-- Backwards-compatible:
--   - all existing ChatMessage rows get attachmentMediaAssetId = NULL
--   - existing senders (without attachment payload) work unchanged
--   - existing MediaKind / MediaEntityType consumers untouched
--
-- 3 enum values + 1 nullable column + 1 FK + 1 index.

-- AlterEnum: add chat-message entity type
ALTER TYPE "MediaEntityType" ADD VALUE 'CHAT_MESSAGE';

-- AlterEnum: add chat-attachment kind
ALTER TYPE "MediaKind" ADD VALUE 'CHAT_ATTACHMENT';

-- AlterTable: add nullable attachment column
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentMediaAssetId" TEXT;

-- AddForeignKey: on-delete SetNull preserves the chat message text if
-- the asset row is ever removed (mirrors the Booking referencePhotoAssetId
-- relation, which also uses SetNull semantics).
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_attachmentMediaAssetId_fkey"
  FOREIGN KEY ("attachmentMediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: lookup attachments per asset (e.g. when cleaning up
-- orphan MediaAssets that haven't been linked to any chat message).
CREATE INDEX "ChatMessage_attachmentMediaAssetId_idx"
  ON "ChatMessage"("attachmentMediaAssetId");

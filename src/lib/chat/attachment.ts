import { MediaEntityType, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * Chat attachment validation + claim helper. Mirrors the booking-
 * reference upload+claim pattern (`validateReferenceAsset` +
 * post-link re-point in `createBooking`).
 *
 * Contract:
 *   - The asset MUST exist, not be soft-deleted.
 *   - Kind MUST be `CHAT_ATTACHMENT`.
 *   - Owner (`createdByUserId`) MUST match the sender — no
 *     attaching someone else's upload.
 *   - Asset MUST be unused: `entityType=CHAT_MESSAGE` AND
 *     `entityId` starts with `pending:` (the marker
 *     `uploadChatAttachmentAsset` sets at creation).
 *
 * Once validated the caller persists `ChatMessage.attachmentMediaAssetId`,
 * then invokes `markAttachmentUsed(assetId, messageId)` which re-points
 * the asset's `entityId` to `chat-message:<messageId>` so the same
 * upload can't be reattached to a second message.
 *
 * Error codes are namespaced under `MEDIA_ASSET_*` to reuse the
 * existing error-code union (see `src/lib/api/errors.ts`). The
 * caller's API layer surfaces them as 4xx responses with the
 * message strings below.
 */

export async function validateChatAttachmentAsset(input: {
  assetId: string;
  senderUserId: string;
}): Promise<{ id: string }> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: input.assetId },
    select: {
      id: true,
      kind: true,
      entityType: true,
      entityId: true,
      deletedAt: true,
      createdByUserId: true,
    },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Вложение не найдено.", 404, "MEDIA_ASSET_NOT_FOUND");
  }
  if (asset.kind !== MediaKind.CHAT_ATTACHMENT) {
    throw new AppError("Некорректный тип вложения.", 400, "MEDIA_INVALID_KIND");
  }
  if (asset.createdByUserId && asset.createdByUserId !== input.senderUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  if (
    asset.entityType !== MediaEntityType.CHAT_MESSAGE ||
    !asset.entityId.startsWith("pending:")
  ) {
    throw new AppError("Вложение уже использовано.", 409, "MEDIA_INVALID_ENTITY");
  }
  return { id: asset.id };
}

/**
 * Re-point the asset's `entityId` from `pending:<userId>` to
 * `chat-message:<messageId>` so the same upload can't be claimed
 * by a second message. Best-effort — failure is logged but
 * doesn't undo the send (the FK on `ChatMessage` is the canonical
 * link; the entityId tag is for one-shot enforcement only).
 */
export async function markAttachmentUsed(input: {
  assetId: string;
  messageId: string;
}): Promise<void> {
  await prisma.mediaAsset.update({
    where: { id: input.assetId },
    data: { entityId: `chat-message:${input.messageId}` },
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaEntityType, MediaKind } from "@prisma/client";

/**
 * FAST-WINS-BATCH-A — validateReferenceAsset mirror tests
 * (TC-2 tail closure; second upload validator after
 * `validateChatAttachmentAsset` in `chat/attachment.test.ts`).
 *
 * Locks the booking-reference upload validation predicate that prevents:
 *   - attaching a deleted / non-existent asset
 *   - attaching the wrong kind (e.g. a chat attachment as a reference)
 *   - cross-user attach (client vs original uploader mismatch)
 *   - double-claim (asset already attached — entityId no longer
 *     starts with `pending:`)
 *   - wrong entityType (asset belongs to a different domain entity)
 *
 * Uses the same `vi.hoisted` + `vi.mock("@/lib/prisma")` pattern as
 * `chat-attachment-acl.test.ts` / `chat/attachment.test.ts`.
 */

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { findUnique, update: vi.fn() },
    service: { findUnique: vi.fn() },
  },
}));

import { validateReferenceAsset } from "./booking-extras";

const ASSET_ID = "asset-cuid-ref-1";
const CLIENT_ID = "user-cuid-client-1";

function makeAsset(overrides: Partial<{
  id: string;
  kind: MediaKind;
  entityType: MediaEntityType;
  entityId: string;
  deletedAt: Date | null;
  createdByUserId: string | null;
}> = {}) {
  return {
    id: overrides.id ?? ASSET_ID,
    kind: overrides.kind ?? MediaKind.BOOKING_REFERENCE,
    entityType: overrides.entityType ?? MediaEntityType.BOOKING,
    entityId: overrides.entityId ?? `pending:${CLIENT_ID}`,
    deletedAt: overrides.deletedAt ?? null,
    createdByUserId:
      overrides.createdByUserId !== undefined ? overrides.createdByUserId : CLIENT_ID,
  };
}

describe("validateReferenceAsset", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns the asset id when all invariants hold", async () => {
    findUnique.mockResolvedValue(makeAsset());
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).resolves.toBe(ASSET_ID);
  });

  it("throws REFERENCE_PHOTO_NOT_FOUND when the asset does not exist", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).rejects.toMatchObject({ code: "REFERENCE_PHOTO_NOT_FOUND", status: 404 });
  });

  it("throws REFERENCE_PHOTO_NOT_FOUND when the asset is soft-deleted", async () => {
    findUnique.mockResolvedValue(makeAsset({ deletedAt: new Date() }));
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).rejects.toMatchObject({ code: "REFERENCE_PHOTO_NOT_FOUND" });
  });

  it("throws REFERENCE_PHOTO_INVALID when the asset is the wrong kind", async () => {
    findUnique.mockResolvedValue(makeAsset({ kind: MediaKind.CHAT_ATTACHMENT }));
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).rejects.toMatchObject({ code: "REFERENCE_PHOTO_INVALID", status: 400 });
  });

  it("throws FORBIDDEN when client did not upload the asset (cross-user attach attempt)", async () => {
    findUnique.mockResolvedValue(makeAsset({ createdByUserId: "different-user" }));
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("throws REFERENCE_PHOTO_USED when the asset was already attached (entityId no longer pending)", async () => {
    findUnique.mockResolvedValue(
      makeAsset({ entityId: "booking:previously-attached-booking-id" }),
    );
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).rejects.toMatchObject({ code: "REFERENCE_PHOTO_USED", status: 409 });
  });

  it("throws REFERENCE_PHOTO_USED when entityType is not BOOKING", async () => {
    findUnique.mockResolvedValue(makeAsset({ entityType: MediaEntityType.CHAT_MESSAGE }));
    await expect(
      validateReferenceAsset({ assetId: ASSET_ID, clientUserId: CLIENT_ID }),
    ).rejects.toMatchObject({ code: "REFERENCE_PHOTO_USED", status: 409 });
  });
});

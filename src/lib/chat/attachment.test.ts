import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaEntityType, MediaKind } from "@prisma/client";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_FILE_SIZE_BYTES } from "@/lib/media/types";

/**
 * SECURITY-SURFACE-TESTS-A — TC-2 (TEST-COVERAGE-AUDIT-A finding).
 *
 * Locks the chat-attachment validation predicate that prevents:
 *   - attaching a deleted / non-existent asset
 *   - attaching the wrong kind (e.g. an avatar marked as chat attachment)
 *   - cross-user attachment (sender vs original uploader mismatch)
 *   - double-claim (asset already attached to a previous message —
 *     entityId no longer starts with `pending:`)
 *
 * Plus invariants on `MEDIA_ALLOWED_MIME_TYPES` (size limit + MIME
 * allowlist applied at upload time in `media/service.ts:74-77` and
 * via magic-byte sniff in upload route handlers).
 *
 * Uses the same `vi.hoisted` + `vi.mock("@/lib/prisma")` pattern as
 * `chat-attachment-acl.test.ts`.
 */

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { findUnique, update: vi.fn() },
  },
}));

import { validateChatAttachmentAsset } from "./attachment";

const ASSET_ID = "asset-cuid-1";
const SENDER_ID = "user-cuid-1";

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
    kind: overrides.kind ?? MediaKind.CHAT_ATTACHMENT,
    entityType: overrides.entityType ?? MediaEntityType.CHAT_MESSAGE,
    entityId: overrides.entityId ?? `pending:${SENDER_ID}`,
    deletedAt: overrides.deletedAt ?? null,
    createdByUserId:
      overrides.createdByUserId !== undefined ? overrides.createdByUserId : SENDER_ID,
  };
}

describe("validateChatAttachmentAsset", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns the asset id when all invariants hold", async () => {
    findUnique.mockResolvedValue(makeAsset());
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).resolves.toEqual({ id: ASSET_ID });
  });

  it("throws MEDIA_ASSET_NOT_FOUND when the asset does not exist", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).rejects.toMatchObject({ code: "MEDIA_ASSET_NOT_FOUND", status: 404 });
  });

  it("throws MEDIA_ASSET_NOT_FOUND when the asset is soft-deleted", async () => {
    findUnique.mockResolvedValue(makeAsset({ deletedAt: new Date() }));
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).rejects.toMatchObject({ code: "MEDIA_ASSET_NOT_FOUND" });
  });

  it("throws MEDIA_INVALID_KIND when the asset is the wrong kind", async () => {
    findUnique.mockResolvedValue(makeAsset({ kind: MediaKind.AVATAR }));
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).rejects.toMatchObject({ code: "MEDIA_INVALID_KIND", status: 400 });
  });

  it("throws FORBIDDEN when sender did not upload the asset (cross-user attach attempt)", async () => {
    findUnique.mockResolvedValue(makeAsset({ createdByUserId: "different-user" }));
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("throws MEDIA_INVALID_ENTITY when the asset was already attached (entityId no longer pending)", async () => {
    findUnique.mockResolvedValue(
      makeAsset({ entityId: "chat-message:previously-attached-msg-id" }),
    );
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).rejects.toMatchObject({ code: "MEDIA_INVALID_ENTITY", status: 409 });
  });

  it("throws MEDIA_INVALID_ENTITY when entityType is not CHAT_MESSAGE", async () => {
    findUnique.mockResolvedValue(makeAsset({ entityType: MediaEntityType.BOOKING }));
    await expect(
      validateChatAttachmentAsset({ assetId: ASSET_ID, senderUserId: SENDER_ID }),
    ).rejects.toMatchObject({ code: "MEDIA_INVALID_ENTITY" });
  });
});

describe("MEDIA upload constants (MIME allowlist + size limit)", () => {
  it("MEDIA_ALLOWED_MIME_TYPES contains exactly the 3 image formats supported by Sharp re-encoder", () => {
    expect(MEDIA_ALLOWED_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("MEDIA_ALLOWED_MIME_TYPES excludes PDF/SVG/HEIC/video formats (attack-surface minimization)", () => {
    const forbidden = [
      "application/pdf",
      "image/svg+xml",
      "image/heic",
      "video/mp4",
      "text/html",
    ];
    for (const mime of forbidden) {
      expect(MEDIA_ALLOWED_MIME_TYPES).not.toContain(mime);
    }
  });

  it("MEDIA_MAX_FILE_SIZE_BYTES is 10 MiB (matches Yandex S3 + Sharp memory ceiling)", () => {
    expect(MEDIA_MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(MEDIA_MAX_FILE_SIZE_BYTES).toBe(10_485_760);
  });
});

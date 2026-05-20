import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AccountType,
  BookingStatus,
  MediaEntityType,
  MediaKind,
  type UserProfile,
} from "@prisma/client";

/**
 * MASTER-CHAT-ATTACHMENT-FIX-A — chat attachment read-ACL boundary.
 *
 * The `ensureCanReadMedia` switch must admit chat participants (client
 * + master) and deny everyone else for `entityType=CHAT_MESSAGE`:
 *
 *   - client (booking.clientUserId === user.id) → ✅
 *   - master (booking.masterProvider.ownerUserId === user.id) → ✅
 *   - outsider (unrelated user) → 403
 *   - studio admin → 403 (privacy 152-ФЗ — chat is 1:1, see
 *     `resolveChatAccess` boundary)
 *
 * Availability gate (`isAvailable`) is intentionally bypassed for read
 * access — participants must remain able to view attachments after a
 * booking ends, just like they can scroll past historical messages.
 */

const chatMessageFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatMessage: { findUnique: chatMessageFindUnique },
    // Stubs for other ensureCanReadMedia branches we don't exercise here.
    provider: { findUnique: vi.fn() },
    booking: { findUnique: vi.fn() },
    studio: { findUnique: vi.fn() },
    studioMembership: { findFirst: vi.fn() },
    clientCard: { findUnique: vi.fn() },
    modelApplication: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/model-offers/access", () => ({ resolveMasterAccess: vi.fn() }));

import { ensureCanReadMedia } from "@/lib/media/access";

function makeUser(id: string, roles: AccountType[] = [AccountType.CLIENT]): UserProfile {
  return {
    id,
    roles,
    phone: "+71234567890",
  } as unknown as UserProfile;
}

function setBookingFor(chatMessageId: string, booking: {
  clientUserId: string | null;
  masterOwnerUserId: string | null;
}) {
  chatMessageFindUnique.mockResolvedValueOnce({
    id: chatMessageId,
    chat: {
      booking: {
        id: "b1",
        status: BookingStatus.CONFIRMED,
        startAtUtc: new Date(),
        clientUserId: booking.clientUserId,
        masterProvider: booking.masterOwnerUserId
          ? { ownerUserId: booking.masterOwnerUserId, name: "Master" }
          : null,
      },
    },
  });
}

const ENTITY_ID = "chat-message:msg_abc";

describe("ensureCanReadMedia — CHAT_MESSAGE entityType", () => {
  beforeEach(() => {
    chatMessageFindUnique.mockReset();
  });

  it("admits the client participant", async () => {
    setBookingFor("msg_abc", { clientUserId: "client-1", masterOwnerUserId: "master-1" });
    await expect(
      ensureCanReadMedia(
        makeUser("client-1"),
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).resolves.toBeUndefined();
  });

  it("admits the master participant", async () => {
    setBookingFor("msg_abc", { clientUserId: "client-1", masterOwnerUserId: "master-1" });
    await expect(
      ensureCanReadMedia(
        makeUser("master-1", [AccountType.MASTER]),
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).resolves.toBeUndefined();
  });

  it("denies outsider (403)", async () => {
    setBookingFor("msg_abc", { clientUserId: "client-1", masterOwnerUserId: "master-1" });
    await expect(
      ensureCanReadMedia(
        makeUser("outsider-1"),
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("denies studio admin (privacy 152-ФЗ — chat is 1:1)", async () => {
    setBookingFor("msg_abc", { clientUserId: "client-1", masterOwnerUserId: "master-1" });
    await expect(
      ensureCanReadMedia(
        // Even with elevated roles (studio admin profile), the chat
        // boundary is participant-only by-design.
        makeUser("studio-admin-1", [AccountType.STUDIO_ADMIN, AccountType.CLIENT]),
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("denies unauthenticated user (no session)", async () => {
    await expect(
      ensureCanReadMedia(
        null,
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("denies wrong MediaKind on CHAT_MESSAGE entityType (e.g. AVATAR)", async () => {
    // The kindAllowedForEntity gate must reject anything other than
    // CHAT_ATTACHMENT for CHAT_MESSAGE — prevents a stray entityId
    // mismatch from leaking access.
    await expect(
      ensureCanReadMedia(
        makeUser("client-1"),
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.AVATAR,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("denies pending-state assets (entityId not `chat-message:` prefixed)", async () => {
    // Pre-attach assets have `entityId="pending:<userId>"`. They must
    // never be readable through the chat-attachment ACL — they haven't
    // been linked to a message yet so we can't resolve participants.
    await expect(
      ensureCanReadMedia(
        makeUser("client-1"),
        MediaEntityType.CHAT_MESSAGE,
        "pending:client-1",
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("denies when the linked ChatMessage row is gone", async () => {
    chatMessageFindUnique.mockResolvedValueOnce(null);
    await expect(
      ensureCanReadMedia(
        makeUser("client-1"),
        MediaEntityType.CHAT_MESSAGE,
        ENTITY_ID,
        MediaKind.CHAT_ATTACHMENT,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});

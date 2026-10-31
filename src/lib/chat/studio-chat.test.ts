import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType } from "@prisma/client";

/**
 * STUDIO-CHAT (запрос владельца 2026-10-31): переписка студии с клиентом.
 *
 * Сторона студии — владелец и OWNER/ADMIN студии записи (`chat/studio-side.ts`);
 * они пишут от имени студии, а сообщение клиента уходит им всем. Мастер студии
 * в этот круг не входит, а сторона «мастер» у провайдера-студии невозможна —
 * иначе владелец студии открыл бы переписку студии из кабинета мастера.
 */

const prisma = vi.hoisted(() => ({
  booking: { findMany: vi.fn(), findUnique: vi.fn() },
  userProfile: { findUnique: vi.fn() },
  bookingChat: { upsert: vi.fn() },
  chatMessage: { create: vi.fn() },
}));
const isStudioSideUser = vi.hoisted(() => vi.fn());
const listStudioSideUserIds = vi.hoisted(() => vi.fn());
const deliverNotification = vi.hoisted(() => vi.fn());
const assertChatNotBlocked = vi.hoisted(() => vi.fn());
const resolveConversationSlug = vi.hoisted(() => vi.fn());
const getOrCreateConversationSlug = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/chat/studio-side", () => ({ isStudioSideUser, listStudioSideUserIds }));
vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/chat/blocks", () => ({ assertChatNotBlocked }));
vi.mock("@/lib/chat/attachment", () => ({
  markAttachmentUsed: vi.fn(),
  validateChatAttachmentAsset: vi.fn(),
}));
vi.mock("@/lib/chat/conversation-slug", () => ({
  resolveConversationSlug,
  getOrCreateConversationSlug,
}));

import { resolveConversationAccess } from "@/lib/chat/conversation-access";
import { sendConversationMessage } from "@/lib/chat/message-sender";
import { resolveChatPerspective } from "@/lib/chat/perspective";

const KEY = { providerId: "studio-provider-1", clientUserId: "client-1" };

function openStudioBooking(type: "STUDIO" | "MASTER" = "STUDIO") {
  return {
    id: "b-1",
    status: "CONFIRMED",
    startAtUtc: new Date(Date.now() + 86_400_000),
    clientUserId: "client-1",
    provider: { ownerUserId: "studio-owner-1", type },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.booking.findMany.mockResolvedValue([openStudioBooking()]);
  isStudioSideUser.mockImplementation(async (userId: string) =>
    ["studio-owner-1", "studio-admin-1"].includes(userId),
  );
  listStudioSideUserIds.mockResolvedValue(["studio-owner-1", "studio-admin-1"]);
  resolveConversationSlug.mockResolvedValue(KEY);
  getOrCreateConversationSlug.mockResolvedValue("slug-1");
  prisma.booking.findUnique.mockResolvedValue({
    id: "b-1",
    clientUserId: "client-1",
    provider: {
      id: "studio-provider-1",
      name: "Vision Beauty",
      ownerUserId: "studio-owner-1",
      type: "STUDIO",
    },
  });
  prisma.userProfile.findUnique.mockResolvedValue({ displayName: "Елена", phone: null });
  prisma.bookingChat.upsert.mockResolvedValue({ id: "chat-1" });
  prisma.chatMessage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "msg-1",
    senderType: data.senderType,
    senderName: data.senderName,
    body: data.body,
    readAt: null,
    createdAt: new Date("2026-10-31T10:00:00Z"),
    attachmentMediaAssetId: null,
  }));
});

describe("resolveChatPerspective", () => {
  it("явная сторона из ?as=", () => {
    expect(resolveChatPerspective("studio", [AccountType.CLIENT])).toBe("STUDIO");
    expect(resolveChatPerspective("client", [AccountType.MASTER])).toBe("CLIENT");
    expect(resolveChatPerspective("master", [AccountType.CLIENT])).toBe("MASTER");
  });

  it("без параметра — мастер по роли, иначе клиент; студия только явно", () => {
    expect(resolveChatPerspective(null, [AccountType.MASTER])).toBe("MASTER");
    expect(resolveChatPerspective(null, [AccountType.STUDIO])).toBe("CLIENT");
  });
});

describe("resolveConversationAccess — студия", () => {
  it("администратор студии читает переписку студии", async () => {
    const access = await resolveConversationAccess({
      key: KEY,
      userId: "studio-admin-1",
      hintedPerspective: "STUDIO",
    });
    expect(access).toMatchObject({ ok: true, perspective: "STUDIO", canSend: true });
  });

  it("без подсказки сторона студии выводится сама", async () => {
    const access = await resolveConversationAccess({ key: KEY, userId: "studio-owner-1" });
    expect(access).toMatchObject({ ok: true, perspective: "STUDIO" });
  });

  it("владелец студии не открывает её переписку как «мастер»", async () => {
    const access = await resolveConversationAccess({
      key: KEY,
      userId: "studio-owner-1",
      hintedPerspective: "MASTER",
    });
    expect(access).toEqual({ ok: false, reason: "forbidden" });
  });

  it("мастер студии — не сторона студии", async () => {
    const access = await resolveConversationAccess({
      key: KEY,
      userId: "studio-master-1",
      hintedPerspective: "STUDIO",
    });
    expect(access).toEqual({ ok: false, reason: "forbidden" });
  });

  it("у провайдера-мастера сторона студии не проверяется", async () => {
    prisma.booking.findMany.mockResolvedValue([openStudioBooking("MASTER")]);
    const access = await resolveConversationAccess({
      key: KEY,
      userId: "studio-admin-1",
      hintedPerspective: "STUDIO",
    });
    expect(access).toEqual({ ok: false, reason: "forbidden" });
    expect(isStudioSideUser).not.toHaveBeenCalled();
  });
});

describe("sendConversationMessage — студия", () => {
  it("администратор пишет от имени студии; уведомление — клиенту", async () => {
    const result = await sendConversationMessage({
      slug: "slug-1",
      perspective: "STUDIO",
      userId: "studio-admin-1",
      body: "Здравствуйте!",
    });
    expect(result.message).toMatchObject({ senderType: "MASTER", senderName: "Vision Beauty" });
    expect(deliverNotification).toHaveBeenCalledTimes(1);
    expect(deliverNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "client-1", pushUrl: "/cabinet/messages?c=slug-1" }),
    );
    // Блок — между клиентом и владельцем студии, а не администратором.
    expect(assertChatNotBlocked).toHaveBeenCalledWith("studio-owner-1", "client-1");
  });

  it("сообщение клиента уходит владельцу и администраторам студии, в канал студии", async () => {
    await sendConversationMessage({
      slug: "slug-1",
      perspective: "CLIENT",
      userId: "client-1",
      body: "Можно перенести?",
    });
    const recipients = deliverNotification.mock.calls.map(([arg]) => arg.userId);
    expect(recipients).toEqual(["studio-owner-1", "studio-admin-1"]);
    for (const [arg] of deliverNotification.mock.calls) {
      expect(arg).toMatchObject({
        bookingId: "b-1",
        pushUrl: "/cabinet/studio/messages?c=slug-1",
        payloadJson: expect.objectContaining({ chatSurface: "studio" }),
      });
    }
  });
});

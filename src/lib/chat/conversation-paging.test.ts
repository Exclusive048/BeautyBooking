import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 31 (PERF-22; решения владельца 31.3, 31.4) — пределы чата:
 *  - переписка пары грузится последними 100 сообщениями, более ранние — по
 *    курсору `(createdAt, id)` («Показать раньше»);
 *  - список диалогов и бейдж непрочитанных — только чаты с движением за
 *    последний год (одно и то же условие, иначе бейдж звал бы к переписке,
 *    которой в списке нет).
 *
 * @probe 2026-10-01 (по одной оси):
 *   1. В `getConversationThread` условие курсора убрано из `where` → красный
 *      «страница до курсора: строго раньше по (createdAt, id)».
 *   2. `take: limit + 1` заменено на `take: limit` → красный «101 строка —
 *      100 сообщений и курсор…» (курсор null: признака «есть ещё» нет).
 *   3. Из `countUnreadChatMessages` убрано окно → красный «бейдж — то же окно».
 */

type WindowArg = { where: { createdAt?: unknown; messages?: { some: { createdAt: { gte: Date } } }; chat?: { messages: { some: { createdAt: { gte: Date } } } } } };

const bookingFindMany = vi.hoisted(() => vi.fn());
const chatMessageFindMany = vi.hoisted(() => vi.fn());
const chatMessageCount = vi.hoisted(() => vi.fn<(input: WindowArg) => Promise<number>>(async () => 0));
const bookingChatFindMany = vi.hoisted(() => vi.fn<(input: WindowArg) => Promise<never[]>>(async () => []));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: bookingFindMany },
    chatMessage: { findMany: chatMessageFindMany, count: chatMessageCount },
    bookingChat: { findMany: bookingChatFindMany },
  },
}));
vi.mock("@/lib/chat/conversation-slug", () => ({
  getOrCreateConversationSlug: vi.fn(async () => "slug-1"),
}));
vi.mock("@/lib/media/private-delivery", () => ({ buildChatAttachmentUrl: (id: string) => `/att/${id}` }));

import {
  countUnreadChatMessages,
  decodeThreadCursor,
  encodeThreadCursor,
  getConversationThread,
  listConversations,
} from "@/lib/chat/conversation-aggregator";
import { CHAT_THREAD_PAGE_SIZE } from "@/lib/chat/conversation-window";

const KEY = { providerId: "prov-1", clientUserId: "user-1" };
const BASE = Date.UTC(2026, 8, 1, 9, 0, 0);

function message(i: number) {
  return {
    id: `m${String(i).padStart(4, "0")}`,
    chatId: "chat-1",
    senderType: "CLIENT",
    senderName: "Клиент",
    body: `Сообщение ${i}`,
    readAt: null,
    createdAt: new Date(BASE + i * 60_000),
    attachmentMediaAssetId: null,
    referencedBooking: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bookingFindMany.mockResolvedValue([
    {
      id: "b-1",
      status: "CONFIRMED",
      startAtUtc: new Date(BASE),
      provider: { id: "prov-1", name: "Анна", avatarUrl: null, publicUsername: "anna", timezone: "Europe/Moscow", ownerUserId: "o", type: "MASTER" },
      clientUser: null,
      chat: { id: "chat-1" },
    },
  ]);
});

describe("переписка: страница последних сообщений", () => {
  it("101 строка — 100 сообщений по возрастанию и курсор к самому раннему из них", async () => {
    // БД отдаёт по убыванию: 150, 149, … 50 (101 строка).
    chatMessageFindMany.mockResolvedValue(Array.from({ length: 101 }, (_, k) => message(150 - k)));

    const detail = await getConversationThread({ key: KEY, perspective: "CLIENT", viewerTimezone: "Europe/Moscow" });

    const call = chatMessageFindMany.mock.calls[0]![0];
    expect(call.take).toBe(CHAT_THREAD_PAGE_SIZE + 1);
    expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(call.where.chatId).toEqual({ in: ["chat-1"] });

    const ids = detail!.thread.filter((t) => t.type === "message").map((t) => t.id);
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe("m0051");
    expect(ids[99]).toBe("m0150");
    expect(decodeThreadCursor(detail!.olderCursor!)).toEqual({ id: "m0051", createdAt: message(51).createdAt });
  });

  it("всё влезло — курсора нет", async () => {
    chatMessageFindMany.mockResolvedValue([message(2), message(1)]);
    const detail = await getConversationThread({ key: KEY, perspective: "CLIENT", viewerTimezone: "Europe/Moscow" });
    expect(detail!.olderCursor).toBeNull();
    expect(detail!.thread.filter((t) => t.type === "message").map((t) => t.id)).toEqual(["m0001", "m0002"]);
  });

  it("страница до курсора: строго раньше по (createdAt, id) — сообщение с тем же временем не теряется", async () => {
    chatMessageFindMany.mockResolvedValue([]);
    const before = { createdAt: message(51).createdAt, id: "m0051" };
    await getConversationThread({ key: KEY, perspective: "CLIENT", viewerTimezone: "Europe/Moscow", before });
    expect(chatMessageFindMany.mock.calls[0]![0].where.OR).toEqual([
      { createdAt: { lt: before.createdAt } },
      { createdAt: before.createdAt, id: { lt: "m0051" } },
    ]);
  });

  it("курсор: туда и обратно; мусор не разбирается", () => {
    const value = { createdAt: new Date("2026-09-01T09:00:00.000Z"), id: "cm123" };
    expect(decodeThreadCursor(encodeThreadCursor(value))).toEqual(value);
    expect(decodeThreadCursor("не-курсор")).toBeNull();
    expect(decodeThreadCursor(Buffer.from("без-разделителя").toString("base64url"))).toBeNull();
    expect(decodeThreadCursor(Buffer.from("не-дата|cm1").toString("base64url"))).toBeNull();
  });
});

describe("список диалогов и бейдж — окно в год", () => {
  const yearAgo = () => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 12);
    return d.getTime();
  };

  it("список — только чаты с сообщением за последний год", async () => {
    await listConversations({ userId: "user-1", perspective: "CLIENT" });
    const since = bookingChatFindMany.mock.calls[0]![0].where.messages!.some.createdAt.gte;
    expect(Math.abs(since.getTime() - yearAgo())).toBeLessThan(5_000);
  });

  it("бейдж — то же окно", async () => {
    await countUnreadChatMessages({ userId: "user-1", perspective: "MASTER" });
    const since = chatMessageCount.mock.calls[0]![0].where.chat!.messages.some.createdAt.gte;
    expect(Math.abs(since.getTime() - yearAgo())).toBeLessThan(5_000);
  });
});

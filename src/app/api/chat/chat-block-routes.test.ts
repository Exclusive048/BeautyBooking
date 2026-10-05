import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH (App Store 1.2) — блок в переписке на уровне роутов:
 *
 *   - отправка по slug и старый путь отправки по записи отказывают 403
 *     CHAT_BLOCKED, сообщение не пишется;
 *   - экран переписки отдаёт `blockedByMe` / `blockedByOther` / `blockedReason`
 *     и `canSend: false` при блоке;
 *   - POST/DELETE …/block отвечают состоянием, `/api/me/blocks` — списком.
 *
 * @probe  убрать `assertChatNotBlocked` из `/api/bookings/[id]/chat/messages` →
 *         красный «старый путь отправки тоже закрыт».
 */

const db = vi.hoisted(() => ({
  blockFindMany: vi.fn(),
  blockUpsert: vi.fn(),
  blockDeleteMany: vi.fn(),
  providerFindUnique: vi.fn(),
  providerFindMany: vi.fn(),
  bookingFindUnique: vi.fn(),
  bookingChatUpsert: vi.fn(),
  chatMessageCreate: vi.fn(),
  userProfileFindUnique: vi.fn(),
}));
const resolveConversationSlug = vi.hoisted(() => vi.fn());
const resolveConversationAccess = vi.hoisted(() => vi.fn());
const getConversationThread = vi.hoisted(() => vi.fn());
const resolveChatAccess = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatBlock: { findMany: db.blockFindMany, upsert: db.blockUpsert, deleteMany: db.blockDeleteMany },
    provider: { findUnique: db.providerFindUnique, findMany: db.providerFindMany },
    booking: { findUnique: db.bookingFindUnique },
    bookingChat: { upsert: db.bookingChatUpsert },
    chatMessage: { create: db.chatMessageCreate },
    userProfile: { findUnique: db.userProfileFindUnique },
  },
}));
vi.mock("@/lib/auth/access", () => ({
  getSessionUser: async () => ({ userId: "client-1", roles: ["CLIENT"] }),
}));
vi.mock("@/lib/chat/conversation-slug", () => ({
  resolveConversationSlug,
  getOrCreateConversationSlug: async () => "slug000001",
}));
vi.mock("@/lib/chat/conversation-access", () => ({ resolveConversationAccess }));
vi.mock("@/lib/chat/conversation-aggregator", () => ({
  getConversationThread,
  decodeThreadCursor: () => null,
}));
vi.mock("@/lib/chat/access", () => ({ resolveChatAccess }));
vi.mock("@/lib/chat/attachment", () => ({
  markAttachmentUsed: vi.fn(),
  validateChatAttachmentAsset: vi.fn(),
}));
vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { POST: sendBySlug } = await import("@/app/api/chat/threads/[slug]/messages/route");
const { POST: sendByBooking } = await import("@/app/api/bookings/[id]/chat/messages/route");
const { GET: getThread } = await import("@/app/api/chat/threads/[slug]/route");
const { POST: blockRoute, DELETE: unblockRoute } = await import("@/app/api/chat/threads/[slug]/block/route");
const { GET: listBlocks } = await import("@/app/api/me/blocks/route");
const { DELETE: removeBlock } = await import("@/app/api/me/blocks/[id]/route");

const KEY = { providerId: "p1", clientUserId: "client-1" };

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

type Payload = {
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ limited: false });
  resolveConversationSlug.mockResolvedValue(KEY);
  resolveConversationAccess.mockResolvedValue({
    ok: true,
    perspective: "CLIENT",
    canSend: true,
    openBookingId: "b1",
    readonlyOnly: false,
  });
  db.providerFindUnique.mockResolvedValue({ ownerUserId: "master-1" });
  db.bookingFindUnique.mockResolvedValue({
    id: "b1",
    clientUserId: "client-1",
    provider: { id: "p1", name: "Студия Анны", ownerUserId: "master-1" },
  });
  db.blockFindMany.mockResolvedValue([]);
  db.blockUpsert.mockResolvedValue({});
  db.blockDeleteMany.mockResolvedValue({ count: 1 });
  db.userProfileFindUnique.mockResolvedValue({ displayName: "Ольга", firstName: null, lastName: null, phone: null });
  db.bookingChatUpsert.mockResolvedValue({ id: "chat-1" });
  db.chatMessageCreate.mockResolvedValue({
    id: "m1",
    senderType: "CLIENT",
    senderName: "Ольга",
    body: "привет",
    readAt: null,
    createdAt: new Date(),
    attachmentMediaAssetId: null,
  });
  resolveChatAccess.mockResolvedValue({
    ok: true,
    senderType: "CLIENT",
    availability: { canSend: true },
    booking: { clientUserId: "client-1", masterProvider: { ownerUserId: "master-1", name: "Анна" } },
  });
});

describe("отправка при блоке", () => {
  it("по slug: собеседник заблокировал — 403 CHAT_BLOCKED, сообщение не пишется", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "master-1" }]);
    const res = await sendBySlug(
      jsonReq("https://app.test/api/chat/threads/slug000001/messages?as=client", "POST", { body: "привет" }) as never,
      { params: Promise.resolve({ slug: "slug000001" }) },
    );
    expect(res.status).toBe(403);
    const payload = (await res.json()) as Payload;
    expect(payload.error).toMatchObject({ code: "CHAT_BLOCKED", message: "Собеседник ограничил переписку с вами." });
    expect(db.chatMessageCreate).not.toHaveBeenCalled();
  });

  it("по slug: блока нет — сообщение уходит (тест не вакуумен)", async () => {
    const res = await sendBySlug(
      jsonReq("https://app.test/api/chat/threads/slug000001/messages?as=client", "POST", { body: "привет" }) as never,
      { params: Promise.resolve({ slug: "slug000001" }) },
    );
    expect(res.status).toBe(201);
    expect(db.chatMessageCreate).toHaveBeenCalled();
  });

  it("старый путь отправки тоже закрыт", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "client-1" }]);
    const res = await sendByBooking(
      jsonReq("https://app.test/api/bookings/b1/chat/messages", "POST", { body: "привет" }) as never,
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as Payload).error?.code).toBe("CHAT_BLOCKED");
    expect(db.chatMessageCreate).not.toHaveBeenCalled();
  });
});

describe("экран переписки", () => {
  beforeEach(() => {
    getConversationThread.mockResolvedValue({
      slug: "slug000001",
      thread: [],
      olderCursor: null,
      partner: { id: "p1", name: "Студия Анны" },
      timezone: "Europe/Moscow",
    });
  });

  it("блок собеседника — canSend false, флаги и готовый текст", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "master-1" }]);
    const res = await getThread(new Request("https://app.test/api/chat/threads/slug000001?as=client") as never, {
      params: Promise.resolve({ slug: "slug000001" }),
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as Payload;
    expect(data).toMatchObject({
      canSend: false,
      blockedByMe: false,
      blockedByOther: true,
      blockedReason: "Собеседник ограничил переписку с вами.",
    });
  });

  it("без блока — прежний canSend и пустые флаги", async () => {
    const res = await getThread(new Request("https://app.test/api/chat/threads/slug000001?as=client") as never, {
      params: Promise.resolve({ slug: "slug000001" }),
    });
    const { data } = (await res.json()) as Payload;
    expect(data).toMatchObject({ canSend: true, blockedByMe: false, blockedByOther: false, blockedReason: null });
  });
});

describe("POST/DELETE /api/chat/threads/{slug}/block", () => {
  it("блок — состояние «заблокировал я»; разблок — снят только свой", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "client-1" }]);
    let res = await blockRoute(jsonReq("https://app.test/api/chat/threads/slug000001/block", "POST") as never, {
      params: Promise.resolve({ slug: "slug000001" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Payload).data).toMatchObject({ blockedByMe: true, blockedByOther: false });
    expect(db.blockUpsert).toHaveBeenCalled();

    db.blockFindMany.mockResolvedValue([]);
    res = await unblockRoute(jsonReq("https://app.test/api/chat/threads/slug000001/block", "DELETE") as never, {
      params: Promise.resolve({ slug: "slug000001" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Payload).data).toMatchObject({ blockedByMe: false, blockedReason: null });
    expect(db.blockDeleteMany).toHaveBeenCalledWith({ where: { blockerUserId: "client-1", blockedUserId: "master-1" } });
  });

  it("переписки нет — 404; обрыв лимитера — 503 до любой записи", async () => {
    resolveConversationSlug.mockResolvedValue(null);
    let res = await blockRoute(jsonReq("https://app.test/api/chat/threads/nope/block", "POST") as never, {
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(res.status).toBe(404);

    checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60, reason: "unavailable" });
    res = await blockRoute(jsonReq("https://app.test/api/chat/threads/slug000001/block", "POST") as never, {
      params: Promise.resolve({ slug: "slug000001" }),
    });
    expect(res.status).toBe(503);
    expect(db.blockUpsert).not.toHaveBeenCalled();
  });
});

describe("/api/me/blocks", () => {
  it("список — имя и фото, снять — 200 {}; чужой — 404", async () => {
    db.blockFindMany.mockResolvedValue([
      {
        id: "blk-1",
        createdAt: new Date("2026-10-04T10:00:00Z"),
        blockedUserId: "master-1",
        providerId: "p1",
        clientUserId: "client-1",
        blocked: { displayName: null, firstName: null, lastName: null, externalPhotoUrl: null },
      },
    ]);
    db.providerFindMany.mockResolvedValue([{ id: "p1", name: "Студия Анны", avatarUrl: null }]);
    const listRes = await listBlocks(new Request("https://app.test/api/me/blocks"));
    expect(listRes.status).toBe(200);
    expect(((await listRes.json()) as Payload).data).toEqual({
      items: [{ id: "blk-1", createdAt: "2026-10-04T10:00:00.000Z", name: "Студия Анны", avatarUrl: null }],
    });

    const okRes = await removeBlock(jsonReq("https://app.test/api/me/blocks/blk-1", "DELETE"), {
      params: Promise.resolve({ id: "blk-1" }),
    });
    expect(okRes.status).toBe(200);

    db.blockDeleteMany.mockResolvedValue({ count: 0 });
    const missing = await removeBlock(jsonReq("https://app.test/api/me/blocks/blk-x", "DELETE"), {
      params: Promise.resolve({ id: "blk-x" }),
    });
    expect(missing.status).toBe(404);
  });
});

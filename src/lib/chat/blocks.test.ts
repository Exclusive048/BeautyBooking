import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH (App Store 1.2) — блокировка в переписке.
 *
 *   - блок между людьми, в любую сторону: отправка закрыта обоим, текст —
 *     с точки зрения отправителя («Собеседник ограничил переписку с вами.»);
 *   - заблокировать может только участник переписки, себя — нельзя;
 *   - снять блок может только тот, кто его поставил;
 *   - «Заблокированные»: имя и фото, у мастера — его кабинет.
 *
 * @probe  в `unblockConversationCounterpart` убрать `blockerUserId` из where →
 *         красный «снимает только свой блок».
 */

const db = vi.hoisted(() => ({
  blockFindMany: vi.fn(),
  blockUpsert: vi.fn(),
  blockDeleteMany: vi.fn(),
  providerFindUnique: vi.fn(),
  providerFindMany: vi.fn(),
}));
const resolveConversationAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatBlock: { findMany: db.blockFindMany, upsert: db.blockUpsert, deleteMany: db.blockDeleteMany },
    provider: { findUnique: db.providerFindUnique, findMany: db.providerFindMany },
  },
}));
vi.mock("@/lib/chat/conversation-access", () => ({ resolveConversationAccess }));

import {
  CHAT_BLOCKED_BY_ME_MESSAGE,
  CHAT_BLOCKED_BY_OTHER_MESSAGE,
  assertChatNotBlocked,
  blockConversationCounterpart,
  getChatBlockState,
  getChatBlockStates,
  listMyChatBlocks,
  removeMyChatBlock,
  unblockConversationCounterpart,
} from "@/lib/chat/blocks";

const KEY = { providerId: "p1", clientUserId: "client-1" };

beforeEach(() => {
  vi.clearAllMocks();
  db.blockFindMany.mockResolvedValue([]);
  db.blockUpsert.mockResolvedValue({});
  db.blockDeleteMany.mockResolvedValue({ count: 1 });
  db.providerFindUnique.mockResolvedValue({ ownerUserId: "master-1" });
  resolveConversationAccess.mockResolvedValue({ ok: true, perspective: "CLIENT", canSend: true, openBookingId: "b1", readonlyOnly: false });
});

describe("состояние блока", () => {
  it("блок в любую сторону — флаги с точки зрения смотрящего", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "master-1" }]);
    await expect(getChatBlockState("client-1", "master-1")).resolves.toEqual({
      blockedByMe: false,
      blockedByOther: true,
    });
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "client-1" }, { blockerUserId: "master-1" }]);
    await expect(getChatBlockState("client-1", "master-1")).resolves.toEqual({
      blockedByMe: true,
      blockedByOther: true,
    });
  });

  it("нет собеседника или это вы сами — без запроса и без блока", async () => {
    await expect(getChatBlockState("u1", null)).resolves.toEqual({ blockedByMe: false, blockedByOther: false });
    await expect(getChatBlockState("u1", "u1")).resolves.toEqual({ blockedByMe: false, blockedByOther: false });
    expect(db.blockFindMany).not.toHaveBeenCalled();
  });

  it("список собеседников — одним запросом", async () => {
    db.blockFindMany.mockResolvedValue([
      { blockerUserId: "me", blockedUserId: "a" },
      { blockerUserId: "b", blockedUserId: "me" },
    ]);
    const states = await getChatBlockStates("me", ["a", "b", "c", null, "a"]);
    expect(db.blockFindMany).toHaveBeenCalledTimes(1);
    expect(states.get("a")).toEqual({ blockedByMe: true, blockedByOther: false });
    expect(states.get("b")).toEqual({ blockedByMe: false, blockedByOther: true });
    expect(states.has("c")).toBe(false);
  });
});

describe("отказ отправки", () => {
  it("заблокировал собеседник — 403 CHAT_BLOCKED «Собеседник ограничил переписку с вами.»", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "master-1" }]);
    await expect(assertChatNotBlocked("client-1", "master-1")).rejects.toMatchObject({
      status: 403,
      code: "CHAT_BLOCKED",
      message: CHAT_BLOCKED_BY_OTHER_MESSAGE,
    });
    expect(CHAT_BLOCKED_BY_OTHER_MESSAGE).toBe("Собеседник ограничил переписку с вами.");
  });

  it("заблокировали вы — переписка закрыта и для вас (симметрично)", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "client-1" }]);
    await expect(assertChatNotBlocked("client-1", "master-1")).rejects.toMatchObject({
      status: 403,
      code: "CHAT_BLOCKED",
      message: CHAT_BLOCKED_BY_ME_MESSAGE,
    });
  });

  it("блока нет — проходит", async () => {
    await expect(assertChatNotBlocked("client-1", "master-1")).resolves.toBeUndefined();
  });
});

describe("блок из переписки", () => {
  it("клиент блокирует владельца кабинета мастера", async () => {
    db.blockFindMany.mockResolvedValue([{ blockerUserId: "client-1" }]);
    const state = await blockConversationCounterpart({ key: KEY, userId: "client-1" });
    expect(db.blockUpsert).toHaveBeenCalledWith({
      where: { blockerUserId_blockedUserId: { blockerUserId: "client-1", blockedUserId: "master-1" } },
      create: { blockerUserId: "client-1", blockedUserId: "master-1", providerId: "p1", clientUserId: "client-1" },
      update: {},
    });
    expect(state).toEqual({ blockedByMe: true, blockedByOther: false });
  });

  it("мастер блокирует клиента", async () => {
    await blockConversationCounterpart({ key: KEY, userId: "master-1" });
    expect(db.blockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ blockerUserId: "master-1", blockedUserId: "client-1" }) }),
    );
  });

  it("нет переписки — 404; не участник — 403; сам себе — 400", async () => {
    await expect(blockConversationCounterpart({ key: null, userId: "x" })).rejects.toMatchObject({ status: 404 });
    resolveConversationAccess.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    await expect(blockConversationCounterpart({ key: KEY, userId: "stranger" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    db.providerFindUnique.mockResolvedValue({ ownerUserId: "client-1" });
    await expect(blockConversationCounterpart({ key: KEY, userId: "client-1" })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(db.blockUpsert).not.toHaveBeenCalled();
  });

  it("снимает только свой блок", async () => {
    await unblockConversationCounterpart({ key: KEY, userId: "client-1" });
    expect(db.blockDeleteMany).toHaveBeenCalledWith({
      where: { blockerUserId: "client-1", blockedUserId: "master-1" },
    });
  });
});

describe("«Заблокированные»", () => {
  it("клиент — его имя и фото; мастер — имя и фото кабинета; без телефона", async () => {
    db.blockFindMany.mockResolvedValue([
      {
        id: "blk-1",
        createdAt: new Date("2026-10-04T10:00:00Z"),
        blockedUserId: "client-1",
        providerId: "p1",
        clientUserId: "client-1",
        blocked: { displayName: null, firstName: "Ольга", lastName: "Клиентова", externalPhotoUrl: "https://x/o.jpg" },
      },
      {
        id: "blk-2",
        createdAt: new Date("2026-10-03T10:00:00Z"),
        blockedUserId: "master-1",
        providerId: "p1",
        clientUserId: "me",
        blocked: { displayName: "anna_private", firstName: null, lastName: null, externalPhotoUrl: null },
      },
    ]);
    db.providerFindMany.mockResolvedValue([{ id: "p1", name: "Студия Анны", avatarUrl: "https://x/a.jpg" }]);

    const items = await listMyChatBlocks("me");
    expect(items).toEqual([
      { id: "blk-1", createdAt: "2026-10-04T10:00:00.000Z", name: "Ольга Клиентова", avatarUrl: "https://x/o.jpg" },
      { id: "blk-2", createdAt: "2026-10-03T10:00:00.000Z", name: "Студия Анны", avatarUrl: "https://x/a.jpg" },
    ]);
    expect(db.blockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { blockerUserId: "me" } }));
  });

  it("снять из списка — только свой; чужой или несуществующий — 404", async () => {
    await removeMyChatBlock("me", "blk-1");
    expect(db.blockDeleteMany).toHaveBeenCalledWith({ where: { id: "blk-1", blockerUserId: "me" } });
    db.blockDeleteMany.mockResolvedValue({ count: 0 });
    await expect(removeMyChatBlock("me", "blk-foreign")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

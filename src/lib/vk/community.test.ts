import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  AUTH_JWT_SECRET: "b".repeat(64),
  NEXT_PUBLIC_VK_COMMUNITY_URL: "https://vk.com/masterryadom" as string | undefined,
}));
const store = vi.hoisted(() => new Map<string, unknown>());
const auditCalls = vi.hoisted(() => [] as unknown[]);
const fetchCommunityOfToken = vi.hoisted(() => vi.fn());
const probeCommunityMessagesAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: envState }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/audit/admin-audit", () => ({
  createAdminAuditLog: vi.fn(async (input: unknown) => {
    auditCalls.push(input);
  }),
}));
vi.mock("@/lib/vk/community-api", () => ({ fetchCommunityOfToken, probeCommunityMessagesAccess }));
vi.mock("@/lib/prisma", () => {
  const systemConfig = {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      store.has(where.key) ? { value: store.get(where.key) } : null,
    ),
    upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
      store.set(where.key, create.value);
    }),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
      const had = store.delete(where.key);
      return { count: had ? 1 : 0 };
    }),
  };
  const client = { systemConfig };
  return {
    prisma: {
      ...client,
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
    },
  };
});

import {
  clearVkCommunityCache,
  clearVkCommunityToken,
  getVkCommunity,
  saveVkCommunityToken,
  VK_COMMUNITY_CONFIG_KEY,
} from "@/lib/vk/community";

const TOKEN = "vk1.a.very-secret-community-token";
const CONTEXT = { ipAddress: null, userAgent: null };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  auditCalls.length = 0;
  clearVkCommunityCache();
  envState.NEXT_PUBLIC_VK_COMMUNITY_URL = "https://vk.com/masterryadom";
  fetchCommunityOfToken.mockResolvedValue({
    ok: true,
    data: { groupId: 42, screenName: "masterryadom", name: "МастерРядом" },
  });
  probeCommunityMessagesAccess.mockResolvedValue({ ok: true, data: true });
});

describe("saveVkCommunityToken — ключ из админки вместо env", () => {
  it("сохраняет ключ зашифрованным; ни в строке, ни в аудите открытого ключа нет", async () => {
    const view = await saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT });
    expect(view.configured).toBe(true);
    expect(view.community).toMatchObject({ groupId: 42, chatUrl: "https://vk.me/masterryadom" });
    expect(JSON.stringify(view)).not.toContain(TOKEN);

    expect(JSON.stringify(store.get(VK_COMMUNITY_CONFIG_KEY))).not.toContain(TOKEN);
    expect(auditCalls).toHaveLength(1);
    expect(JSON.stringify(auditCalls[0])).not.toContain(TOKEN);

    const community = await getVkCommunity();
    expect(community?.token).toBe(TOKEN);
  });

  it("без ссылки на сообщество — отказ до обращения к VK", async () => {
    envState.NEXT_PUBLIC_VK_COMMUNITY_URL = undefined;
    await expect(saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT })).rejects.toMatchObject({
      code: "VK_COMMUNITY_URL_MISSING",
    });
    expect(fetchCommunityOfToken).not.toHaveBeenCalled();
  });

  it("ключ другого сообщества не сохраняется", async () => {
    fetchCommunityOfToken.mockResolvedValue({ ok: true, data: { groupId: 9, screenName: "other", name: "Другое" } });
    await expect(saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT })).rejects.toMatchObject({
      code: "VK_COMMUNITY_MISMATCH",
      status: 409,
    });
    expect(store.size).toBe(0);
  });

  it("ключ без права «Сообщения сообщества» не сохраняется", async () => {
    probeCommunityMessagesAccess.mockResolvedValue({ ok: false, kind: "config", errorCode: 7 });
    await expect(saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT })).rejects.toMatchObject({
      code: "VK_COMMUNITY_TOKEN_INVALID",
    });
    expect(store.size).toBe(0);
  });

  it("недоступный VK — 503, а не «неверный ключ»", async () => {
    fetchCommunityOfToken.mockResolvedValue({ ok: false, kind: "retryable", errorCode: null });
    await expect(saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT })).rejects.toMatchObject({
      code: "VK_COMMUNITY_UNAVAILABLE",
      status: 503,
    });
  });
});

describe("getVkCommunity — сообщество определяет ссылка", () => {
  it("ссылка поменялась на другое сообщество — ключ перестаёт считаться настроенным", async () => {
    await saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT });
    clearVkCommunityCache();
    envState.NEXT_PUBLIC_VK_COMMUNITY_URL = "https://vk.com/another_group";
    expect(await getVkCommunity()).toBeNull();
  });

  it("числовая ссылка club<ID> сверяется по ID", async () => {
    envState.NEXT_PUBLIC_VK_COMMUNITY_URL = "https://vk.com/club42";
    await saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT });
    clearVkCommunityCache();
    expect((await getVkCommunity())?.groupId).toBe(42);
  });

  it("удаление ключа выключает канал и пишет аудит", async () => {
    await saveVkCommunityToken({ token: TOKEN, adminUserId: "admin", context: CONTEXT });
    const view = await clearVkCommunityToken({ adminUserId: "admin", context: CONTEXT });
    expect(view.configured).toBe(false);
    expect(await getVkCommunity()).toBeNull();
    expect(auditCalls).toHaveLength(2);
  });
});

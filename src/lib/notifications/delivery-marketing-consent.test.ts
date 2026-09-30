import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 16 (ENFORCEMENT: ConsentType.MARKETING) — рекламный тип
 * уведомления без активного согласия на рекламу не создаётся ни в одном канале;
 * сервисный идёт как раньше и согласия не спрашивает. Решение Ю1 (вариант В):
 * «горящее окошко со скидкой» — рекламное, «окошко освободилось» — сервисное.
 *
 * @probe 2026-09-29 — в `deliverNotification` убран ранний выход
 *        `if (!allowed.has(input.userId)) { … return; }`: красный «без согласия —
 *        ни записи, ни пуша». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(async (input: { userId: string; type: string }) => ({
    id: "n1",
    userId: input.userId,
    type: input.type,
    title: "t",
    body: "b",
    payloadJson: {},
    bookingId: null,
    readAt: null,
    createdAt: new Date(),
  })),
  consented: new Set<string>(),
  filter: vi.fn(),
  sendPush: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: mocks.createNotification,
  publishNotifications: vi.fn(),
}));
vi.mock("@/lib/legal/consent", () => ({
  filterUsersWithMarketingConsent: mocks.filter,
}));
vi.mock("@/lib/notifications/push/send", () => ({ sendPushToUser: mocks.sendPush }));
vi.mock("@/lib/notifications/recipients", () => ({ getTelegramChatIdForUser: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn() }));
vi.mock("@/lib/vk/notify", () => ({ enqueueVkNotification: vi.fn() }));
vi.mock("@/lib/email/sender", () => ({ sendEmail: vi.fn(), isEmailConfigured: false }));
vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findUnique: vi.fn(async () => null) } } }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { deliverNotification } from "@/lib/notifications/delivery";

const BASE = { title: "t", body: "b", payloadJson: {}, pushUrl: "/x" };

beforeEach(() => {
  mocks.createNotification.mockClear();
  mocks.sendPush.mockClear();
  mocks.filter.mockReset();
  mocks.filter.mockImplementation(async (ids: string[]) => new Set(ids.filter((id) => mocks.consented.has(id))));
  mocks.consented.clear();
});

describe("deliverNotification × согласие на рекламу", () => {
  it("рекламный тип без согласия — ни записи, ни пуша", async () => {
    await deliverNotification({ ...BASE, userId: "u1", type: "HOT_SLOT_AVAILABLE" });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("рекламный тип с активным согласием — доставляется", async () => {
    mocks.consented.add("u2");
    await deliverNotification({ ...BASE, userId: "u2", type: "HOT_SLOT_AVAILABLE" });
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
  });

  it("«окошко освободилось» — сервисное: без согласия приходит и согласия не спрашивает", async () => {
    await deliverNotification({ ...BASE, userId: "u3", type: "SLOT_FREED" });
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.filter).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QUEUE-MASS-NOTIFY-PER-RECIPIENT-CLAIM — повтор задачи рассылки об изменении
 * тарифа не присылает уведомление второй раз.
 *
 * @probe 2026-10-01 — убрать `claimNotificationDedup` из цикла (все в batch) →
 *        красный «повтор задачи досылает только тем, кому не отправили».
 */

const findMany = vi.hoisted(() => vi.fn());
const createNotification = vi.hoisted(() => vi.fn());
const claimed = vi.hoisted(() => new Set<string>());
const dedupDown = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/prisma", () => ({ prisma: { userSubscription: { findMany } } }));
vi.mock("@/lib/notifications/service", () => ({
  createNotification,
  publishNotifications: vi.fn(),
}));
vi.mock("@/lib/notifications/push/send", () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/recipients", () => ({ getTelegramChatIdForUser: vi.fn(async () => null) }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/notifications/dedup-guard", () => ({
  claimNotificationDedup: vi.fn(async (key: string) => {
    if (dedupDown.value) throw new Error("dedup unavailable");
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  }),
}));

import { processPlanEditedMassNotification } from "@/lib/notifications/admin-initiated";

const PAYLOAD = { planId: "p1", planCode: "PRO", summary: "Новая цена" };

beforeEach(() => {
  claimed.clear();
  dedupDown.value = false;
  createNotification.mockReset();
  createNotification.mockImplementation(async (input: { userId: string }) => ({ id: `n-${input.userId}` }));
  findMany.mockResolvedValue([
    { userId: "u1", scope: "MASTER" },
    { userId: "u2", scope: "MASTER" },
    { userId: "u3", scope: "STUDIO" },
  ]);
});

describe("processPlanEditedMassNotification", () => {
  it("повтор задачи досылает только тем, кому не отправили", async () => {
    // Первый прогон упал после двух доставок: третьему не дошло и не отмечено.
    claimed.add("notif:plan-edited:job-1:u1");
    claimed.add("notif:plan-edited:job-1:u2");
    const result = await processPlanEditedMassNotification(PAYLOAD, { jobId: "job-1" });
    expect(createNotification.mock.calls.map((c) => c[0].userId)).toEqual(["u3"]);
    expect(result).toMatchObject({ recipients: 3, skipped: 2, failures: 0 });
  });

  it("второй прогон той же задачи не шлёт ничего", async () => {
    await processPlanEditedMassNotification(PAYLOAD, { jobId: "job-1" });
    createNotification.mockClear();
    await processPlanEditedMassNotification(PAYLOAD, { jobId: "job-1" });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("новая задача (новое изменение тарифа) уведомляет снова", async () => {
    await processPlanEditedMassNotification(PAYLOAD, { jobId: "job-1" });
    createNotification.mockClear();
    await processPlanEditedMassNotification(PAYLOAD, { jobId: "job-2" });
    expect(createNotification).toHaveBeenCalledTimes(3);
  });

  it("сторож недоступен — задача бросает и уходит в ретрай, ничего не отправив", async () => {
    dedupDown.value = true;
    await expect(processPlanEditedMassNotification(PAYLOAD, { jobId: "job-1" })).rejects.toThrow();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

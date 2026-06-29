import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FIX-EXP-NOTIFICATIONS (EXP-027/028) — push send-gating.
 *
 * `sendPushToUser` is the single chokepoint for ALL push send paths
 * (delivery / billing / admin-initiated). It must consult the per-user
 * `pushNotificationsEnabled` preference and send NOTHING when push is off,
 * even if a stale PushSubscription row still exists. A stored-but-ignored
 * preference would be the worse bug, so we lock the gate here.
 */

const userFindUnique = vi.hoisted(() => vi.fn());
const subsFindMany = vi.hoisted(() => vi.fn());
const subsDeleteMany = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique: userFindUnique },
    pushSubscription: { findMany: subsFindMany, deleteMany: subsDeleteMany },
  },
}));

vi.mock("@/lib/notifications/push/vapid", () => ({
  isPushEnabled: true,
  webpush: { sendNotification },
}));

import { sendPushToUser } from "./send";

const SUBSCRIPTION = {
  id: "sub-1",
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: "p",
  auth: "a",
};

const PAYLOAD = { title: "T", body: "B", url: "/x" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  subsFindMany.mockResolvedValue([SUBSCRIPTION]);
  sendNotification.mockResolvedValue(undefined);
});

describe("sendPushToUser — per-user preference gate", () => {
  it("does NOT send when pushNotificationsEnabled is false", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: false });
    await sendPushToUser("user-1", PAYLOAD);
    expect(sendNotification).not.toHaveBeenCalled();
    // must short-circuit BEFORE loading subscriptions
    expect(subsFindMany).not.toHaveBeenCalled();
  });

  it("does NOT send when the user row is missing", async () => {
    userFindUnique.mockResolvedValue(null);
    await sendPushToUser("user-1", PAYLOAD);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends when pushNotificationsEnabled is true and a subscription exists", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    await sendPushToUser("user-1", PAYLOAD);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("does NOT send when enabled but there are no subscriptions", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    subsFindMany.mockResolvedValue([]);
    await sendPushToUser("user-1", PAYLOAD);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

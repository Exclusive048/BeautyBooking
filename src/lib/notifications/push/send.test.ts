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
const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
// MOBILE-B2: push в нативное приложение ставится в очередь из той же точки.
const enqueueNativePush = vi.hoisted(() => vi.fn(async () => undefined));
const flags = vi.hoisted(() => ({ web: true, mobile: false }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique: userFindUnique },
    pushSubscription: { findMany: subsFindMany, deleteMany: subsDeleteMany },
  },
}));

vi.mock("@/lib/notifications/push/vapid", () => ({
  get isPushEnabled() {
    return flags.web;
  },
  webpush: { sendNotification },
}));
vi.mock("@/lib/env", () => ({
  get isMobilePushEnabled() {
    return flags.mobile;
  },
}));
vi.mock("@/lib/notifications/native-push/enqueue", () => ({ enqueueNativePush }));

vi.mock("@/lib/logging/logger", () => ({ logInfo, logError }));

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
  flags.web = true;
  flags.mobile = false;
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

/**
 * HARDENING-01 FIX-4 (bug hunt 2026-07-06, finding #4): the returned promise
 * must structurally NEVER reject. Callers fire-and-forget from
 * worker-reachable code, and a rejected detached promise triggers the
 * worker's unhandledRejection → process.exit(1) — halting all background
 * jobs. Prisma reads used to run before any try/catch; a transient DB error
 * was a worker-killer.
 */
describe("sendPushToUser — never rejects (FIX-4)", () => {
  it("resolves (not rejects) when the profile read throws mid-flow", async () => {
    userFindUnique.mockRejectedValue(new Error("db down"));
    await expect(sendPushToUser("user-1", PAYLOAD)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "Push delivery failed before dispatch",
      expect.objectContaining({ userId: "user-1", error: "db down" }),
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("resolves (not rejects) when the subscriptions read throws", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    subsFindMany.mockRejectedValue(new Error("connection reset"));
    await expect(sendPushToUser("user-1", PAYLOAD)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "Push delivery failed before dispatch",
      expect.objectContaining({ userId: "user-1", error: "connection reset" }),
    );
  });

  it("a single failing endpoint is contained per-subscription (existing behavior preserved)", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    subsFindMany.mockResolvedValue([SUBSCRIPTION]);
    sendNotification.mockRejectedValue(new Error("endpoint gone"));
    await expect(sendPushToUser("user-1", PAYLOAD)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "Push notification failed",
      expect.objectContaining({ userId: "user-1", subscriptionId: "sub-1" }),
    );
  });
});
/**
 * RES-22 — у запроса к push-сервису не было верхней границы: третий аргумент
 * `sendNotification` отсутствовал вовсе.
 *
 * Адресат здесь — ЧУЖОЙ сервис (FCM, Mozilla, Apple), выбранный браузером
 * пользователя, а отправка идёт `Promise.all` по всем подпискам: один
 * зависший эндпоинт держал бы весь пакет и слот воркера.
 */
describe("sendPushToUser — граница запроса (RES-22)", () => {
  it("в каждый вызов уходит timeout", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });

    await sendPushToUser("u-1", PAYLOAD);

    const options = sendNotification.mock.calls[0]?.[2] as { timeout?: number } | undefined;
    expect(typeof options?.timeout).toBe("number");
    expect(options!.timeout!).toBeGreaterThan(0);
    expect(options!.timeout!).toBeLessThanOrEqual(30_000);
  });

  it("срабатывание таймаута не роняет отправку и не удаляет подписку", async () => {
    // У ошибки таймаута нет `statusCode`, поэтому 410-ветка (удаление
    // протухшей подписки) не должна срабатывать — иначе одна сетевая заминка
    // отписывала бы живое устройство.
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    sendNotification.mockRejectedValueOnce(new Error("Socket timeout"));

    await expect(sendPushToUser("u-1", PAYLOAD)).resolves.toBeUndefined();
    expect(subsDeleteMany).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });
});

/**
 * MOBILE-B2 — нативное приложение из той же точки: тот же тумблер
 * `pushNotificationsEnabled`, свой выключатель (`isMobilePushEnabled`), веб-push
 * при этом ведёт себя как раньше.
 */
describe("sendPushToUser — native push (MOBILE-B2)", () => {
  const NATIVE = { native: { type: "BOOKING_CREATED" as const, notificationId: "n1", payloadJson: { bookingId: "b1" } } };
  const WEB_PAYLOAD = { title: "T", body: "B", url: "/cabinet/master/dashboard?focus=b1", tag: "t1" };

  it("выключатель выключен — в очередь ничего, веб-push как прежде", async () => {
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    await sendPushToUser("user-1", WEB_PAYLOAD, NATIVE);
    expect(enqueueNativePush).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("включён — в очередь уходит тип, id, payload и веб-ссылка (ради стороны получателя)", async () => {
    flags.mobile = true;
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    await sendPushToUser("user-1", WEB_PAYLOAD, NATIVE);
    expect(enqueueNativePush).toHaveBeenCalledWith("user-1", {
      type: "BOOKING_CREATED",
      notificationId: "n1",
      payloadJson: { bookingId: "b1" },
      webUrl: "/cabinet/master/dashboard?focus=b1",
      tag: "t1",
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("тумблер пользователя выключен — ни приложения, ни веба", async () => {
    flags.mobile = true;
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: false });
    await sendPushToUser("user-1", WEB_PAYLOAD, NATIVE);
    expect(enqueueNativePush).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("веб-push без VAPID, приложение включено — только очередь, подписки не читаются", async () => {
    flags.web = false;
    flags.mobile = true;
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    await sendPushToUser("user-1", WEB_PAYLOAD, NATIVE);
    expect(enqueueNativePush).toHaveBeenCalledTimes(1);
    expect(subsFindMany).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("всё выключено — даже профиль не читается (прежнее поведение)", async () => {
    flags.web = false;
    await sendPushToUser("user-1", WEB_PAYLOAD, NATIVE);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("без `native` — только веб, как у прежних вызовов", async () => {
    flags.mobile = true;
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    await sendPushToUser("user-1", WEB_PAYLOAD);
    expect(enqueueNativePush).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("веб-payload не меняется: в браузер не уходит ничего от приложения", async () => {
    flags.mobile = true;
    userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true });
    await sendPushToUser("user-1", WEB_PAYLOAD, NATIVE);
    expect(JSON.parse(sendNotification.mock.calls[0]?.[1] as string)).toEqual(WEB_PAYLOAD);
  });
});

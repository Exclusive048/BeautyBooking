import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B2 — постановка push в очередь: выключатель, тип вне таблицы, нет
 * устройств — задачи нет; сбой — не наружу.
 */

const state = vi.hoisted(() => ({ sending: true, hasDevices: true }));
const enqueue = vi.hoisted(() => vi.fn(async () => undefined));
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/native-push/config", () => ({ isNativePushSendingEnabled: () => state.sending }));
vi.mock("@/lib/notifications/native-push/devices", () => ({ hasPushDevices: vi.fn(async () => state.hasDevices) }));
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/logging/logger", () => ({ logError, logInfo: vi.fn() }));

import { enqueueNativePush } from "@/lib/notifications/native-push/enqueue";
import { isJob } from "@/lib/queue/types";

const SOURCE = {
  type: "BOOKING_CREATED" as const,
  notificationId: "n1",
  payloadJson: { bookingId: "b1", bookingStatus: "PENDING", clientName: "Анна" },
  webUrl: "/cabinet/master/dashboard?focus=b1",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.sending = true;
  state.hasDevices = true;
});

describe("enqueueNativePush", () => {
  it("ставит задачу `push.native.send` с готовым сообщением без ПДн", async () => {
    await enqueueNativePush("u1", SOURCE);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [job] = enqueue.mock.calls[0] as unknown as [unknown];
    expect(isJob(job)).toBe(true);
    expect(job).toMatchObject({
      type: "push.native.send",
      payload: { userId: "u1", message: { type: "BOOKING_CREATED", actions: "BOOKING_DECISION" } },
    });
    expect(JSON.stringify(job)).not.toContain("Анна");
  });

  it("выключатель выключен — задачи нет", async () => {
    state.sending = false;
    await enqueueNativePush("u1", SOURCE);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("тип, который в приложение не пушится (биллинг), — задачи нет", async () => {
    await enqueueNativePush("u1", { type: "BILLING_PAYMENT_FAILED" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("у пользователя нет устройств — задачи нет", async () => {
    state.hasDevices = false;
    await enqueueNativePush("u1", SOURCE);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("сбой очереди не выходит наружу", async () => {
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    await expect(enqueueNativePush("u1", SOURCE)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith("Native push enqueue failed", expect.objectContaining({ userId: "u1" }));
  });
});

describe("isJob — push.native.send", () => {
  const valid = {
    id: "j1",
    type: "push.native.send",
    payload: {
      userId: "u1",
      message: { type: "REVIEW_LEFT", title: "t", body: "b", androidChannelId: "general", data: { v: "1" } },
    },
  };

  it("валидная задача и повтор с deviceIds", () => {
    expect(isJob(valid)).toBe(true);
    expect(isJob({ ...valid, payload: { ...valid.payload, deviceIds: ["d1"] } })).toBe(true);
  });

  it("битая — отвергается", () => {
    expect(isJob({ ...valid, payload: { ...valid.payload, userId: "" } })).toBe(false);
    expect(isJob({ ...valid, payload: { ...valid.payload, deviceIds: [1] } })).toBe(false);
    expect(isJob({ ...valid, payload: { userId: "u1", message: { ...valid.payload.message, data: { n: 1 } } } })).toBe(false);
  });
});

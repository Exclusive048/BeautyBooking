import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativePushProviderClient, NativePushSendResult } from "@/lib/notifications/native-push/types";
import type { NativePushSendPayload } from "@/lib/queue/types";

/**
 * MOBILE-B2 — отправка из воркера (`push.native.send`): выключатель, тумблер
 * пользователя, судьба строк по ответу провайдера, повтор только сбойных
 * устройств, ненастроенный провайдер, счётчик непрочитанного, лог без токена.
 */

const state = vi.hoisted(() => ({ sending: true }));
const userFindUnique = vi.hoisted(() => vi.fn());
const loadDeliverableDevices = vi.hoisted(() => vi.fn());
const deleteInvalidPushDevices = vi.hoisted(() => vi.fn(async () => 0));
const getUnreadBadgeCount = vi.hoisted(() => vi.fn(async () => ({ count: 4, hasUnread: true })));
const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findUnique: userFindUnique } } }));
vi.mock("@/lib/notifications/native-push/config", () => ({
  isNativePushSendingEnabled: () => state.sending,
  readFcmConfig: () => null,
  readApnsConfig: () => null,
  readRustorePushConfig: () => null,
}));
vi.mock("@/lib/notifications/native-push/devices", () => ({ loadDeliverableDevices, deleteInvalidPushDevices }));
vi.mock("@/lib/notifications/badge", () => ({ getUnreadBadgeCount }));
vi.mock("@/lib/logging/logger", () => ({ logInfo, logError }));

import { processNativePushPayload, resetNativePushClientsForTests } from "@/lib/notifications/native-push/send";
import { createRustoreClient } from "@/lib/notifications/native-push/providers/rustore";

const PAYLOAD: NativePushSendPayload = {
  userId: "u1",
  message: {
    type: "BOOKING_CONFIRMED",
    title: "Запись подтверждена",
    body: "Откройте, чтобы посмотреть подробности.",
    data: { v: "1", type: "BOOKING_CONFIRMED", link: "/bookings/b1", title: "t", body: "b", channelId: "bookings" },
    androidChannelId: "bookings",
  },
};

const SECRET_TOKEN = "device-token-must-not-be-logged";

function client(provider: NativePushProviderClient["provider"], result: NativePushSendResult) {
  const send = vi.fn(async () => result);
  return { client: { provider, send } satisfies NativePushProviderClient, send };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetNativePushClientsForTests();
  state.sending = true;
  userFindUnique.mockResolvedValue({ pushNotificationsEnabled: true, isDeleted: false });
  loadDeliverableDevices.mockResolvedValue([
    { id: "d1", provider: "FCM", token: SECRET_TOKEN, apnsEnvironment: null },
  ]);
});

describe("processNativePushPayload — гейты", () => {
  it("выключатель выключен — ни профиля, ни устройств, ни запросов", async () => {
    state.sending = false;
    const fcm = client("FCM", { outcome: "sent" });
    await expect(processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client } })).resolves.toEqual({
      status: "skipped",
      reason: "sending-disabled",
    });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(loadDeliverableDevices).not.toHaveBeenCalled();
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it.each([
    [{ pushNotificationsEnabled: false, isDeleted: false }],
    [{ pushNotificationsEnabled: true, isDeleted: true }],
    [null],
  ])("тумблер выключен / аккаунт удалён / нет профиля (%j) — пропуск", async (profile) => {
    userFindUnique.mockResolvedValue(profile);
    const fcm = client("FCM", { outcome: "sent" });
    const result = await processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client } });
    expect(result).toEqual({ status: "skipped", reason: "user-opted-out" });
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it("нет устройств — пропуск", async () => {
    loadDeliverableDevices.mockResolvedValue([]);
    expect(await processNativePushPayload(PAYLOAD, { clients: {} })).toEqual({ status: "skipped", reason: "no-devices" });
  });
});

describe("processNativePushPayload — исходы", () => {
  it("успех: счётчик непрочитанного уходит в сообщение", async () => {
    const fcm = client("FCM", { outcome: "sent" });
    const result = await processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client } });
    expect(result).toMatchObject({ status: "done", sent: 1, invalid: 0, retryDeviceIds: [] });
    expect(fcm.send).toHaveBeenCalledWith({ token: SECRET_TOKEN, apnsEnvironment: null }, { ...PAYLOAD.message, badge: 4 });
  });

  it("счётчик упал — push уходит без него", async () => {
    getUnreadBadgeCount.mockRejectedValueOnce(new Error("db"));
    const fcm = client("FCM", { outcome: "sent" });
    await processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client } });
    expect(fcm.send).toHaveBeenCalledWith(expect.anything(), PAYLOAD.message);
  });

  it("невалидный токен — строка удаляется (по id и токену)", async () => {
    const fcm = client("FCM", { outcome: "invalid-token", reason: "UNREGISTERED" });
    const result = await processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client } });
    expect(result).toMatchObject({ status: "done", invalid: 1 });
    expect(deleteInvalidPushDevices).toHaveBeenCalledWith([{ id: "d1", token: SECRET_TOKEN }]);
  });

  it("невалидный токен RuStore на настоящем клиенте (404 от сервиса) — строка удаляется", async () => {
    loadDeliverableDevices.mockResolvedValue([{ id: "d9", provider: "RUSTORE", token: "rs-token", apnsEnvironment: null }]);
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND" } }), { status: 404 }),
    ) as unknown as typeof fetch;
    const rustore = createRustoreClient({ projectId: "p", serviceToken: "s" }, { fetchImpl });
    await processNativePushPayload(PAYLOAD, { clients: { RUSTORE: rustore } });
    expect(deleteInvalidPushDevices).toHaveBeenCalledWith([{ id: "d9", token: "rs-token" }]);
  });

  it("временный сбой — строка остаётся, устройство уходит в повтор; успешные — нет", async () => {
    loadDeliverableDevices.mockResolvedValue([
      { id: "d1", provider: "FCM", token: "t1", apnsEnvironment: null },
      { id: "d2", provider: "APNS", token: "t2", apnsEnvironment: "SANDBOX" },
    ]);
    const fcm = client("FCM", { outcome: "retry", reason: "UNAVAILABLE" });
    const apns = client("APNS", { outcome: "sent" });
    const result = await processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client, APNS: apns.client } });
    expect(result).toMatchObject({ status: "done", sent: 1, retryDeviceIds: ["d1"] });
    expect(deleteInvalidPushDevices).not.toHaveBeenCalled();
    expect(apns.send).toHaveBeenCalledWith({ token: "t2", apnsEnvironment: "SANDBOX" }, expect.anything());
  });

  it("повтор задачи — только устройства из `deviceIds`", async () => {
    const fcm = client("FCM", { outcome: "sent" });
    await processNativePushPayload({ ...PAYLOAD, deviceIds: ["d1"] }, { clients: { FCM: fcm.client } });
    expect(loadDeliverableDevices).toHaveBeenCalledWith("u1", ["d1"]);
  });

  it("провайдер не настроен — устройство пропущено со строкой в логе, не удалено", async () => {
    loadDeliverableDevices.mockResolvedValue([{ id: "d3", provider: "RUSTORE", token: "t3", apnsEnvironment: null }]);
    const result = await processNativePushPayload(PAYLOAD, { clients: { RUSTORE: null } });
    expect(result).toMatchObject({ status: "done", unconfigured: 1, sent: 0, retryDeviceIds: [] });
    expect(deleteInvalidPushDevices).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith("Native push skipped: provider not configured", expect.objectContaining({ deviceId: "d3" }));
  });

  it("без клиентов из env (ни один провайдер не настроен) — тоже пропуск, без запросов", async () => {
    const result = await processNativePushPayload(PAYLOAD);
    expect(result).toMatchObject({ status: "done", unconfigured: 1 });
  });

  it("постоянный отказ — лог, строка остаётся, без повтора", async () => {
    const fcm = client("FCM", { outcome: "failed", reason: "THIRD_PARTY_AUTH_ERROR" });
    const result = await processNativePushPayload(PAYLOAD, { clients: { FCM: fcm.client } });
    expect(result).toMatchObject({ failed: 1, retryDeviceIds: [] });
    expect(deleteInvalidPushDevices).not.toHaveBeenCalled();
  });

  it("клиент бросил вопреки контракту — повтор, не падение воркера", async () => {
    const send = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await processNativePushPayload(PAYLOAD, { clients: { FCM: { provider: "FCM", send } } });
    expect(result).toMatchObject({ retryDeviceIds: ["d1"] });
  });

  it("токен устройства не попадает в лог ни при каком исходе", async () => {
    for (const outcome of [
      { outcome: "sent" },
      { outcome: "invalid-token", reason: "X" },
      { outcome: "retry", reason: "X" },
      { outcome: "failed", reason: "X" },
    ] as NativePushSendResult[]) {
      await processNativePushPayload(PAYLOAD, { clients: { FCM: client("FCM", outcome).client } });
    }
    const logged = JSON.stringify([...logInfo.mock.calls, ...logError.mock.calls]);
    expect(logged).not.toContain(SECRET_TOKEN);
  });
});

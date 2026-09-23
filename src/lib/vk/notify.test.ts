import { beforeEach, describe, expect, it, vi } from "vitest";

const getVkCommunity = vi.hoisted(() => vi.fn());
const vkLinkFindUnique = vi.hoisted(() => vi.fn());
const sendCommunityMessage = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/vk/community", () => ({ getVkCommunity }));
vi.mock("@/lib/prisma", () => ({ prisma: { vkLink: { findUnique: vkLinkFindUnique } } }));
vi.mock("@/lib/vk/community-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vk/community-api")>();
  return { ...actual, sendCommunityMessage };
});
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/logging/logger", () => ({ logInfo, logError }));
vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));

import { VK_MESSAGE_MAX_LENGTH } from "@/lib/vk/community-api";
import { buildVkNotificationText, enqueueVkNotification, processVkSendPayload } from "@/lib/vk/notify";

const COMMUNITY = {
  token: "tok",
  groupId: 42,
  screenName: "masterryadom",
  name: "МастерРядом",
  chatUrl: "https://vk.me/masterryadom",
};

beforeEach(() => {
  vi.clearAllMocks();
  getVkCommunity.mockResolvedValue(COMMUNITY);
  vkLinkFindUnique.mockResolvedValue({ vkUserId: "5", isEnabled: true });
  enqueue.mockResolvedValue(undefined);
});

describe("buildVkNotificationText", () => {
  it("заголовок, текст и абсолютная ссылка", () => {
    expect(buildVkNotificationText({ title: "Новая запись", body: "Завтра в 10:00", url: "/cabinet/bookings?focus=1" })).toBe(
      "Новая запись\n\nЗавтра в 10:00\n\nhttps://masterryadom.ru/cabinet/bookings?focus=1",
    );
  });

  it("длинный текст режется, а ссылка остаётся целой", () => {
    const text = buildVkNotificationText({ title: "T", body: "я".repeat(VK_MESSAGE_MAX_LENGTH), url: "/x" });
    expect(text.length).toBeLessThanOrEqual(VK_MESSAGE_MAX_LENGTH);
    expect(text.endsWith("https://masterryadom.ru/x")).toBe(true);
  });
});

describe("enqueueVkNotification — канал для всех, без тарифа", () => {
  const input = { userId: "u1", title: "T", body: "B", url: "/x" };

  it("ставит задачу, если ВК привязан и тумблер включён", async () => {
    await enqueueVkNotification(input);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const job = enqueue.mock.calls[0][0];
    expect(job.type).toBe("vk.send");
    expect(job.payload.userId).toBe("u1");
    expect(Number.isInteger(job.payload.randomId)).toBe(true);
    expect(job.payload.randomId).toBeGreaterThan(0);
    expect(job.payload.randomId).toBeLessThan(2 ** 31);
  });

  it("ничего не ставит без настроенного сообщества", async () => {
    getVkCommunity.mockResolvedValue(null);
    await enqueueVkNotification(input);
    expect(enqueue).not.toHaveBeenCalled();
    expect(vkLinkFindUnique).not.toHaveBeenCalled();
  });

  it("ничего не ставит, если ВК не привязан или уведомления выключены", async () => {
    vkLinkFindUnique.mockResolvedValueOnce(null);
    await enqueueVkNotification(input);
    vkLinkFindUnique.mockResolvedValueOnce({ vkUserId: "5", isEnabled: false });
    await enqueueVkNotification(input);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("отказ очереди не бросает", async () => {
    enqueue.mockRejectedValue(new Error("redis down"));
    await expect(enqueueVkNotification(input)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});

describe("processVkSendPayload — исход одной задачи", () => {
  const payload = { userId: "u1", text: "hi", randomId: 7 };

  it("отправляет на VK ID из привязки с random_id задачи", async () => {
    sendCommunityMessage.mockResolvedValue({ ok: true, data: true });
    expect(await processVkSendPayload(payload)).toBe("sent");
    expect(sendCommunityMessage).toHaveBeenCalledWith("tok", { vkUserId: "5", message: "hi", randomId: 7 });
  });

  it("выключенный после постановки тумблер останавливает задачу", async () => {
    vkLinkFindUnique.mockResolvedValue({ vkUserId: "5", isEnabled: false });
    expect(await processVkSendPayload(payload)).toBe("skipped");
    expect(sendCommunityMessage).not.toHaveBeenCalled();
  });

  it("сеть и лимиты — повтор", async () => {
    sendCommunityMessage.mockResolvedValue({ ok: false, kind: "retryable", errorCode: 6 });
    expect(await processVkSendPayload(payload)).toBe("retry");
  });

  it("человек не разрешил сообщения — без повтора и без тревоги", async () => {
    sendCommunityMessage.mockResolvedValue({ ok: false, kind: "recipient", errorCode: 901 });
    expect(await processVkSendPayload(payload)).toBe("skipped");
    expect(logInfo).toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("сломанный ключ — без повтора, но с ошибкой в логе", async () => {
    sendCommunityMessage.mockResolvedValue({ ok: false, kind: "config", errorCode: 5 });
    expect(await processVkSendPayload(payload)).toBe("skipped");
    expect(logError).toHaveBeenCalled();
  });
});

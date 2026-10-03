import { describe, expect, it, vi } from "vitest";
import {
  buildRustoreMessage,
  classifyRustoreResponse,
  createRustoreClient,
  rustoreSendUrl,
} from "@/lib/notifications/native-push/providers/rustore";
import type { NativePushOutgoing } from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — клиент RuStore Push на подменённом `fetch`: сервисный токен
 * проекта, форма сообщения, исходы ответа (404 — токен не найден).
 */

const CONFIG = { projectId: "proj-123", serviceToken: "service-token-secret" };
const TOKEN = "rustore-device-token";

const MESSAGE: NativePushOutgoing = {
  type: "CHAT_MESSAGE_RECEIVED",
  title: "Новое сообщение",
  body: "Откройте чат, чтобы прочитать.",
  data: { v: "1", type: "CHAT_MESSAGE_RECEIVED", link: "/chats/Ab3dE5gH7j", title: "t", body: "b", channelId: "messages" },
  androidChannelId: "messages",
  collapseKey: "chat:c1",
  badge: 5,
};

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("createRustoreClient", () => {
  it("успех: Bearer сервисного токена, messages:send проекта", async () => {
    const fetchImpl = respond(200, {});
    await expect(createRustoreClient(CONFIG, { fetchImpl }).send({ token: TOKEN }, MESSAGE)).resolves.toEqual({
      outcome: "sent",
    });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vkpns.rustore.ru/v1/projects/proj-123/messages:send");
    expect(url).toBe(rustoreSendUrl("proj-123"));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer service-token-secret");
    const body = JSON.parse(String(init.body));
    expect(body.message.token).toBe(TOKEN);
    expect(body.message.data.badge).toBe("5");
    expect(body.message.android.notification.channel_id).toBe("messages");
    expect(body.message.android.ttl).toBe("86400s");
  });

  it("404 NOT_FOUND → invalid-token", async () => {
    const fetchImpl = respond(404, { error: { code: 404, message: "push token not found", status: "NOT_FOUND" } });
    expect(await createRustoreClient(CONFIG, { fetchImpl }).send({ token: TOKEN }, MESSAGE)).toEqual({
      outcome: "invalid-token",
      reason: "NOT_FOUND",
    });
  });

  it("429 / 500 / сеть → retry", async () => {
    for (const fetchImpl of [
      respond(429, { error: { status: "TOO_MANY_REQUESTS" } }),
      respond(500, { error: { status: "INTERNAL" } }),
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    ]) {
      expect((await createRustoreClient(CONFIG, { fetchImpl }).send({ token: TOKEN }, MESSAGE)).outcome).toBe("retry");
    }
  });

  it("401 PERMISSION_DENIED (сервисный токен) → failed, строка остаётся", async () => {
    const fetchImpl = respond(401, { error: { status: "PERMISSION_DENIED" } });
    expect((await createRustoreClient(CONFIG, { fetchImpl }).send({ token: TOKEN }, MESSAGE)).outcome).toBe("failed");
  });
});

describe("classifyRustoreResponse", () => {
  it("400 про токен — invalid-token, про форму — failed", () => {
    expect(classifyRustoreResponse(400, { error: { status: "INVALID_ARGUMENT", message: "invalid push token" } }).outcome).toBe(
      "invalid-token",
    );
    expect(classifyRustoreResponse(400, { error: { status: "INVALID_ARGUMENT", message: "bad ttl" } }).outcome).toBe("failed");
  });
});

describe("buildRustoreMessage", () => {
  it("с действиями — всё равно с notification: data-only без фонового обработчика плагина терялся бы", () => {
    const body = buildRustoreMessage(TOKEN, {
      ...MESSAGE,
      actions: "BOOKING_DECISION",
      data: { ...MESSAGE.data, actions: "BOOKING_DECISION" },
    });
    expect(body.message.notification).toEqual({ title: MESSAGE.title, body: MESSAGE.body });
    expect(body.message.android.notification.channel_id).toBe(MESSAGE.androidChannelId);
    expect(body.message.data.actions).toBe("BOOKING_DECISION");
  });
});

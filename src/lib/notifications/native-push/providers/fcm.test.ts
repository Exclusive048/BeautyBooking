import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FCM_TOKEN_URL,
  buildFcmMessage,
  classifyFcmResponse,
  createFcmClient,
  fcmSendUrl,
} from "@/lib/notifications/native-push/providers/fcm";
import type { NativePushOutgoing } from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — клиент FCM HTTP v1 на подменённом `fetch`: обмен JWT сервисного
 * аккаунта на access token, форма сообщения по платформам, исходы ответа.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const CONFIG = { projectId: "masterryadom", clientEmail: "push@masterryadom.iam.gserviceaccount.com", privateKey: PEM };
const DEVICE_TOKEN = "fcm-device-token:APA91b-secret";

const MESSAGE: NativePushOutgoing = {
  type: "BOOKING_CONFIRMED",
  title: "Запись подтверждена",
  body: "Откройте, чтобы посмотреть подробности.",
  data: { v: "1", type: "BOOKING_CONFIRMED", link: "/bookings/b1", title: "t", body: "b", channelId: "bookings", bookingId: "b1" },
  androidChannelId: "bookings",
  threadId: "booking:b1",
  badge: 3,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fcmError(status: number, code: string, errorCode?: string, message = "") {
  return json(status, {
    error: {
      code: status,
      status: code,
      message,
      details: errorCode ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] : [],
    },
  });
}

type Call = { url: string; init: RequestInit };

function makeFetch(sendResponses: Array<() => Response>) {
  const calls: Call[] = [];
  let tokenCounter = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url) === FCM_TOKEN_URL) {
      tokenCounter += 1;
      return json(200, { access_token: `access-${tokenCounter}`, expires_in: 3600, token_type: "Bearer" });
    }
    const next = sendResponses.shift();
    if (!next) throw new Error("unexpected send");
    return next();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

let now = 1_800_000_000_000;
beforeEach(() => {
  now = 1_800_000_000_000;
});

describe("createFcmClient", () => {
  it("успех: JWT сервисного аккаунта (RS256) → access token → messages:send", async () => {
    const { fetchImpl, calls } = makeFetch([() => json(200, { name: "projects/x/messages/1" })]);
    const client = createFcmClient(CONFIG, { fetchImpl, now: () => now });

    await expect(client.send({ token: DEVICE_TOKEN }, MESSAGE)).resolves.toEqual({ outcome: "sent" });

    const [tokenCall, sendCall] = calls;
    expect(tokenCall!.url).toBe(FCM_TOKEN_URL);
    const form = new URLSearchParams(String(tokenCall!.init.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = form.get("assertion")!.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toMatchObject({
      iss: CONFIG.clientEmail,
      aud: FCM_TOKEN_URL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    });
    expect(
      verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature!, "base64url")),
    ).toBe(true);

    expect(sendCall!.url).toBe(fcmSendUrl("masterryadom"));
    expect((sendCall!.init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
    const body = JSON.parse(String(sendCall!.init.body));
    expect(body.message.token).toBe(DEVICE_TOKEN);
    expect(body.message.data.badge).toBe("3");
    expect(body.message.android.notification).toMatchObject({ channel_id: "bookings", notification_count: 3 });
    expect(body.message.apns.payload.aps).toMatchObject({ badge: 3, "thread-id": "booking:b1" });
  });

  it("access token кэшируется между отправками и обновляется, когда истёк", async () => {
    const { fetchImpl, calls } = makeFetch([() => json(200, {}), () => json(200, {}), () => json(200, {})]);
    const client = createFcmClient(CONFIG, { fetchImpl, now: () => now });
    await client.send({ token: DEVICE_TOKEN }, MESSAGE);
    await client.send({ token: DEVICE_TOKEN }, MESSAGE);
    expect(calls.filter((call) => call.url === FCM_TOKEN_URL)).toHaveLength(1);

    now += 3600 * 1000; // час прошёл — токен истёк
    await client.send({ token: DEVICE_TOKEN }, MESSAGE);
    expect(calls.filter((call) => call.url === FCM_TOKEN_URL)).toHaveLength(2);
    const lastSend = calls[calls.length - 1]!;
    expect((lastSend.init.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
  });

  it("UNREGISTERED → invalid-token (строку удалит отправщик)", async () => {
    const { fetchImpl } = makeFetch([() => fcmError(404, "NOT_FOUND", "UNREGISTERED")]);
    const client = createFcmClient(CONFIG, { fetchImpl, now: () => now });
    await expect(client.send({ token: DEVICE_TOKEN }, MESSAGE)).resolves.toEqual({
      outcome: "invalid-token",
      reason: "UNREGISTERED",
    });
  });

  it("503 / 429 / сеть → retry", async () => {
    const { fetchImpl } = makeFetch([
      () => fcmError(503, "UNAVAILABLE", "UNAVAILABLE"),
      () => fcmError(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"),
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    const client = createFcmClient(CONFIG, { fetchImpl, now: () => now });
    for (let i = 0; i < 3; i += 1) {
      expect((await client.send({ token: DEVICE_TOKEN }, MESSAGE)).outcome).toBe("retry");
    }
  });

  it("401 — свежий access token и сразу второй заход", async () => {
    const { fetchImpl, calls } = makeFetch([() => fcmError(401, "UNAUTHENTICATED"), () => json(200, {})]);
    const client = createFcmClient(CONFIG, { fetchImpl, now: () => now });
    await expect(client.send({ token: DEVICE_TOKEN }, MESSAGE)).resolves.toEqual({ outcome: "sent" });
    expect(calls.filter((call) => call.url === FCM_TOKEN_URL)).toHaveLength(2);
  });

  it("битый ключ — failed без запроса к Google", async () => {
    const { fetchImpl, calls } = makeFetch([]);
    const client = createFcmClient({ ...CONFIG, privateKey: "not a key" }, { fetchImpl, now: () => now });
    await expect(client.send({ token: DEVICE_TOKEN }, MESSAGE)).resolves.toEqual({
      outcome: "failed",
      reason: "FCM_PRIVATE_KEY_INVALID",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("classifyFcmResponse", () => {
  it.each([
    [200, {}, "sent"],
    [404, { error: { status: "NOT_FOUND" } }, "invalid-token"],
    [403, { error: { status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "SENDER_ID_MISMATCH" }] } }, "invalid-token"],
    [400, { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }, "invalid-token"],
    // Битая ФОРМА запроса — наша ошибка, живые токены удалять нельзя.
    [400, { error: { status: "INVALID_ARGUMENT", message: "Invalid value at 'message.android.ttl'" } }, "failed"],
    [401, { error: { status: "THIRD_PARTY_AUTH_ERROR", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "THIRD_PARTY_AUTH_ERROR" }] } }, "failed"],
    [500, { error: { status: "INTERNAL" } }, "retry"],
    [502, null, "retry"],
  ])("HTTP %s → %s", (status, body, outcome) => {
    expect(classifyFcmResponse(status, body).outcome).toBe(outcome);
  });
});

describe("buildFcmMessage", () => {
  it("«Подтвердить / Отклонить»: Android — только data, iOS — alert + category", () => {
    const body = buildFcmMessage(
      "t",
      { ...MESSAGE, actions: "BOOKING_DECISION", data: { ...MESSAGE.data, actions: "BOOKING_DECISION" } },
      1_800_000_000,
    );
    expect(body.message.android).not.toHaveProperty("notification");
    expect(body.message).not.toHaveProperty("notification");
    expect(body.message.data.actions).toBe("BOOKING_DECISION");
    expect(body.message.apns.payload.aps).toMatchObject({
      category: "BOOKING_DECISION",
      alert: { title: MESSAGE.title, body: MESSAGE.body },
    });
  });

  it("чат: collapse key и apns-collapse-id — один ключ на переписку", () => {
    const body = buildFcmMessage("t", { ...MESSAGE, collapseKey: "chat:c1" }, 1_800_000_000);
    expect(body.message.android.collapse_key).toBe("chat:c1");
    expect(body.message.apns.headers["apns-collapse-id"]).toBe("chat:c1");
    expect(body.message.apns.headers["apns-expiration"]).toBe(String(1_800_000_000 + 86_400));
  });
});

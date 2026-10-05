import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  APNS_PRODUCTION_ORIGIN,
  APNS_SANDBOX_ORIGIN,
  buildApnsPayload,
  classifyApnsResponse,
  createApnsClient,
  type ApnsTransport,
} from "@/lib/notifications/native-push/providers/apns";
import type { NativePushOutgoing } from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — клиент APNs (провайдерский токен `.p8`) на подменённом
 * HTTP/2-транспорте: JWT ES256, хост по окружению устройства, заголовки,
 * исходы ответа.
 */

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const CONFIG = { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: PEM, bundleId: "ru.masterryadom.app" };
const TOKEN = "a".repeat(64);

const MESSAGE: NativePushOutgoing = {
  type: "BOOKING_CREATED",
  title: "Новая запись",
  body: "Запись ждёт вашего подтверждения.",
  data: {
    v: "1",
    type: "BOOKING_CREATED",
    link: "/master/bookings/b1",
    title: "Новая запись",
    body: "Запись ждёт вашего подтверждения.",
    channelId: "bookings",
    bookingId: "b1",
    actions: "BOOKING_DECISION",
  },
  androidChannelId: "bookings",
  actions: "BOOKING_DECISION",
  threadId: "booking:b1",
  badge: 2,
};

type Post = { origin: string; path: string; headers: Record<string, string>; body: string };

function makeTransport(responses: Array<() => { status: number; body: string }>) {
  const posts: Post[] = [];
  const transport: ApnsTransport = {
    post: vi.fn(async (origin, path, headers, body) => {
      posts.push({ origin, path, headers, body });
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return next();
    }),
  };
  return { transport, posts };
}

const reason = (status: number, value: string) => () => ({ status, body: JSON.stringify({ reason: value }) });

describe("createApnsClient", () => {
  it("успех: JWT ES256 с kid/iss, production по умолчанию, заголовки APNs", async () => {
    const { transport, posts } = makeTransport([() => ({ status: 200, body: "" })]);
    const client = createApnsClient(CONFIG, { transport, now: () => 1_800_000_000_000 });

    await expect(client.send({ token: TOKEN, apnsEnvironment: "PRODUCTION" }, MESSAGE)).resolves.toEqual({
      outcome: "sent",
    });

    const [post] = posts;
    expect(post!.origin).toBe(APNS_PRODUCTION_ORIGIN);
    expect(post!.path).toBe(`/3/device/${TOKEN}`);
    expect(post!.headers).toMatchObject({
      "apns-topic": "ru.masterryadom.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(1_800_000_000 + 86_400),
    });
    const jwt = post!.headers.authorization!.replace(/^bearer /, "");
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "ES256", typ: "JWT", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
    expect(
      verify("SHA256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature!, "base64url")),
    ).toBe(true);

    const payload = JSON.parse(post!.body);
    expect(payload.aps).toEqual({
      alert: { title: MESSAGE.title, body: MESSAGE.body },
      sound: "default",
      badge: 2,
      category: "BOOKING_DECISION",
      "thread-id": "booking:b1",
    });
    expect(payload.bookingId).toBe("b1");
    expect(payload.link).toBe("/master/bookings/b1");
  });

  it("sandbox-устройство — sandbox-хост", async () => {
    const { transport, posts } = makeTransport([() => ({ status: 200, body: "" })]);
    await createApnsClient(CONFIG, { transport }).send({ token: TOKEN, apnsEnvironment: "SANDBOX" }, MESSAGE);
    expect(posts[0]!.origin).toBe(APNS_SANDBOX_ORIGIN);
  });

  it("410 Unregistered / 400 BadDeviceToken → invalid-token", async () => {
    const { transport } = makeTransport([reason(410, "Unregistered"), reason(400, "BadDeviceToken")]);
    const client = createApnsClient(CONFIG, { transport });
    expect(await client.send({ token: TOKEN }, MESSAGE)).toEqual({ outcome: "invalid-token", reason: "Unregistered" });
    expect(await client.send({ token: TOKEN }, MESSAGE)).toEqual({ outcome: "invalid-token", reason: "BadDeviceToken" });
  });

  it("ExpiredProviderToken — новый JWT и сразу второй заход", async () => {
    let clock = 1_800_000_000_000;
    const { transport, posts } = makeTransport([reason(403, "ExpiredProviderToken"), () => ({ status: 200, body: "" })]);
    const client = createApnsClient(CONFIG, { transport, now: () => (clock += 1000) });
    await expect(client.send({ token: TOKEN }, MESSAGE)).resolves.toEqual({ outcome: "sent" });
    expect(posts).toHaveLength(2);
    expect(posts[0]!.headers.authorization).not.toBe(posts[1]!.headers.authorization);
  });

  it("503 / 429 / обрыв соединения → retry", async () => {
    const { transport } = makeTransport([
      reason(503, "ServiceUnavailable"),
      reason(429, "TooManyRequests"),
      () => {
        throw new Error("APNS_TIMEOUT");
      },
    ]);
    const client = createApnsClient(CONFIG, { transport });
    for (let i = 0; i < 3; i += 1) {
      expect((await client.send({ token: TOKEN }, MESSAGE)).outcome).toBe("retry");
    }
  });

  it("токен не hex — invalid-token без запроса (токен идёт в путь)", async () => {
    const { transport, posts } = makeTransport([]);
    const client = createApnsClient(CONFIG, { transport });
    expect((await client.send({ token: "../../evil" }, MESSAGE)).outcome).toBe("invalid-token");
    expect(posts).toHaveLength(0);
  });

  it("битый ключ — failed", async () => {
    const { transport } = makeTransport([]);
    const client = createApnsClient({ ...CONFIG, privateKey: "nope" }, { transport });
    expect(await client.send({ token: TOKEN }, MESSAGE)).toEqual({ outcome: "failed", reason: "APNS_PRIVATE_KEY_INVALID" });
  });
});

describe("classifyApnsResponse", () => {
  it.each([
    [200, "", "sent"],
    [400, '{"reason":"DeviceTokenNotForTopic"}', "invalid-token"],
    [400, '{"reason":"BadTopic"}', "failed"],
    [413, '{"reason":"PayloadTooLarge"}', "failed"],
    [403, '{"reason":"InvalidProviderToken"}', "retry"],
    [500, "not json", "retry"],
  ])("HTTP %s %s → %s", (status, body, outcome) => {
    expect(classifyApnsResponse(status, body).outcome).toBe(outcome);
  });
});

describe("buildApnsPayload", () => {
  it("без действий — без category; badge — и числом в aps, и строкой в data", () => {
    const payload = buildApnsPayload({ ...MESSAGE, actions: undefined, data: { ...MESSAGE.data, actions: "" } });
    expect(payload.aps).not.toHaveProperty("category");
    expect(payload.aps.badge).toBe(2);
    expect(payload.badge).toBe("2");
  });
});

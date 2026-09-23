import { describe, expect, it, vi } from "vitest";
import {
  callVkCommunityApi,
  classifyVkErrorCode,
  fetchCommunityOfToken,
  isMessagesFromCommunityAllowed,
  sendCommunityMessage,
  VK_MESSAGE_MAX_LENGTH,
} from "@/lib/vk/community-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => jsonResponse(body, status)) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("classifyVkErrorCode — повторять ли отказ VK", () => {
  it("получатель не разрешил сообщения / закрыл личку — повтор бесполезен", () => {
    for (const code of [18, 113, 900, 901, 902]) expect(classifyVkErrorCode(code)).toBe("recipient");
  });

  it("ключ отозван или без права на сообщения — нужен человек", () => {
    for (const code of [5, 7, 15, 27, 28, 203]) expect(classifyVkErrorCode(code)).toBe("config");
  });

  it("лимиты и внутренние ошибки VK — повторяем", () => {
    for (const code of [1, 6, 9, 10]) expect(classifyVkErrorCode(code)).toBe("retryable");
  });

  it("незнакомый код — не повторяем, но и не выдаём за успех", () => {
    expect(classifyVkErrorCode(99999)).toBe("invalid");
  });
});

describe("callVkCommunityApi — транспорт", () => {
  it("ключ уходит в теле POST, а не в URL", async () => {
    const fetchImpl = fakeFetch({ response: 1 });
    await callVkCommunityApi("messages.send", "SECRET-TOKEN", { user_id: "1" }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.vk.com/method/messages.send");
    expect(url).not.toContain("SECRET-TOKEN");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("access_token")).toBe("SECRET-TOKEN");
    expect(body.get("v")).toBeTruthy();
  });

  it("ошибка VK разбирается в класс и код", async () => {
    const result = await callVkCommunityApi("messages.send", "t", {}, fakeFetch({ error: { error_code: 901, error_msg: "x" } }));
    expect(result).toEqual({ ok: false, kind: "recipient", errorCode: 901 });
  });

  it("HTTP 5xx, мусор в теле и обрыв сети — повторяемые", async () => {
    expect(await callVkCommunityApi("m", "t", {}, fakeFetch({}, 502))).toMatchObject({ ok: false, kind: "retryable" });
    const garbage = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    expect(await callVkCommunityApi("m", "t", {}, garbage)).toMatchObject({ ok: false, kind: "retryable" });
    const broken = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await callVkCommunityApi("m", "t", {}, broken)).toMatchObject({ ok: false, kind: "retryable" });
  });
});

describe("fetchCommunityOfToken — сообщество, которому выдан ключ", () => {
  it("читает новую форму ответа ({ groups: [...] })", async () => {
    const result = await fetchCommunityOfToken(
      "t",
      fakeFetch({ response: { groups: [{ id: 42, screen_name: "masterryadom", name: "МастерРядом" }], profiles: [] } }),
    );
    expect(result).toEqual({ ok: true, data: { groupId: 42, screenName: "masterryadom", name: "МастерРядом" } });
  });

  it("читает старую форму ответа (массив) и подставляет club<ID> без короткого имени", async () => {
    const result = await fetchCommunityOfToken("t", fakeFetch({ response: [{ id: 7, name: "Студия" }] }));
    expect(result).toEqual({ ok: true, data: { groupId: 7, screenName: "club7", name: "Студия" } });
  });

  it("пустой ответ — не сообщество", async () => {
    const result = await fetchCommunityOfToken("t", fakeFetch({ response: { groups: [] } }));
    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });
});

describe("isMessagesFromCommunityAllowed / sendCommunityMessage", () => {
  it("is_allowed=1 — разрешено, 0 — нет", async () => {
    expect(await isMessagesFromCommunityAllowed("t", { groupId: 1, vkUserId: "5" }, fakeFetch({ response: { is_allowed: 1 } })))
      .toEqual({ ok: true, data: true });
    expect(await isMessagesFromCommunityAllowed("t", { groupId: 1, vkUserId: "5" }, fakeFetch({ response: { is_allowed: 0 } })))
      .toEqual({ ok: true, data: false });
  });

  it("сообщение обрезается до лимита VK и несёт переданный random_id", async () => {
    const fetchImpl = fakeFetch({ response: 123 });
    const result = await sendCommunityMessage(
      "t",
      { vkUserId: "5", message: "я".repeat(VK_MESSAGE_MAX_LENGTH + 50), randomId: 777 },
      fetchImpl,
    );
    expect(result).toEqual({ ok: true, data: true });
    const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.get("message")?.length).toBe(VK_MESSAGE_MAX_LENGTH);
    expect(body.get("random_id")).toBe("777");
    expect(body.get("user_id")).toBe("5");
  });
});

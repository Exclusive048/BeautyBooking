/**
 * CSRF-CONTENT-TYPE-LAYER — поведение третьего слоя CSRF на НАСТОЯЩИХ
 * `Request`: решение (`json-content-type.ts`), обе обёртки (`parseBody`,
 * `nonJsonBodyRefusal`) и роут, читающий тело сам.
 *
 * Форма атаки, ради которой слой заведён: `<form enctype="text/plain">` с
 * полем `{"a":"` и значением `1"}` даёт телу вид валидного JSON, а
 * `req.json()` на тип не смотрит. Поэтому главная проверка — что JSON-тело
 * под `text/plain` НЕ доходит до разбора, а не что «мусор не разбирается».
 *
 * @probe 2026-10-30 — выполнены на этом файле, каждая краснела:
 *   1. `parseBody` без вызова `assertJsonContentType` → 3 красных: «text/plain
 *      с валидным JSON → 415» (`expected { a: '=1' } to be an instance of
 *      AppError` — подделка разобрана), «тело не читается до проверки»
 *      (`bodyUsed` true) и «urlencoded-форма → 415» (пришёл 400).
 *   2. `isJsonContentType` через `includes("json")` → красные
 *      `text/plain; x=json` и `application/jsonp` (признаны JSON).
 *   3. Исключение Bearer снято → 3 красных: решение, `parseBody` и роут
 *      («Bearer без типа → подписка записана»: 415 вместо 200).
 *   4. В роуте подписки проверка перенесена ПОСЛЕ `req.json()` (под условие)
 *      → красный «text/plain … → 415, подписка не записана» (200 вместо 415).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { getSessionUserMock, upsertMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/prisma", () => ({ prisma: { pushSubscription: { upsert: upsertMock } } }));

import { AppError } from "@/lib/api/errors";
import { nonJsonBodyRefusal } from "@/lib/api/json-body-refusal";
import {
  NON_JSON_BODY_CODE,
  NON_JSON_BODY_MESSAGE,
  isJsonContentType,
  shouldRejectNonJsonBody,
} from "@/lib/http/json-content-type";
import { assertJsonContentType, parseBody } from "@/lib/validation";
import { POST as subscribePost } from "@/app/api/notifications/push/subscribe/route";

const FORGED_JSON = '{"a":"=1"}';

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/x", { method: "POST", body, headers });
}

describe("isJsonContentType", () => {
  it.each([
    ["application/json", true],
    ["application/json; charset=utf-8", true],
    ["Application/JSON ; charset=UTF-8", true],
    ["application/merge-patch+json", true],
    ["application/vnd.api+json; charset=utf-8", true],
    ["text/plain", false],
    ["text/plain;charset=UTF-8", false],
    ["text/plain; x=json", false],
    ["application/x-www-form-urlencoded", false],
    ["multipart/form-data; boundary=x", false],
    ["application/jsonp", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(isJsonContentType(value)).toBe(expected);
  });

  it("отсутствующий заголовок — не JSON", () => {
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});

describe("shouldRejectNonJsonBody", () => {
  it("text/plain → отказ", () => {
    expect(shouldRejectNonJsonBody(new Headers({ "content-type": "text/plain" }))).toBe(true);
  });

  it("без типа → отказ", () => {
    expect(shouldRejectNonJsonBody(new Headers())).toBe(true);
  });

  it("application/json → пропуск", () => {
    expect(shouldRejectNonJsonBody(new Headers({ "content-type": "application/json" }))).toBe(false);
  });

  it("Bearer без типа проходит: заголовок не ставится без preflight, сессию решает он, а не кука", () => {
    expect(shouldRejectNonJsonBody(new Headers({ authorization: "Bearer abc" }))).toBe(false);
    expect(
      shouldRejectNonJsonBody(new Headers({ authorization: "bearer abc", "content-type": "text/plain" })),
    ).toBe(false);
  });

  it("иная схема авторизации исключения не даёт", () => {
    expect(shouldRejectNonJsonBody(new Headers({ authorization: "Basic YTpi" }))).toBe(true);
  });
});

describe("parseBody — третий слой", () => {
  const schema = z.object({ a: z.string() });

  it("text/plain с валидным JSON → 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    // undici ставит строковому телу `text/plain;charset=UTF-8` сам — ровно
    // то, что присылает форма `enctype="text/plain"`.
    const req = post(FORGED_JSON);
    expect(req.headers.get("content-type")).toMatch(/^text\/plain/);
    const error = await parseBody(req, schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(415);
    expect((error as AppError).code).toBe(NON_JSON_BODY_CODE);
    expect((error as AppError).message).toBe(NON_JSON_BODY_MESSAGE);
  });

  it("тело не читается до проверки типа", async () => {
    const req = post(FORGED_JSON);
    await parseBody(req, schema).catch(() => undefined);
    expect(req.bodyUsed).toBe(false);
  });

  it("urlencoded-форма → 415", async () => {
    const req = post("a=1", { "content-type": "application/x-www-form-urlencoded" });
    await expect(parseBody(req, schema)).rejects.toMatchObject({ status: 415 });
  });

  it("application/json; charset=utf-8 → разбирается", async () => {
    const req = post(FORGED_JSON, { "content-type": "application/json; charset=utf-8" });
    await expect(parseBody(req, schema)).resolves.toEqual({ a: "=1" });
  });

  it("Bearer без типа → разбирается (приложение)", async () => {
    const req = new Request("http://localhost/api/x", {
      method: "POST",
      body: new Blob([FORGED_JSON]),
      headers: { authorization: "Bearer token" },
    });
    expect(req.headers.get("content-type")).toBeNull();
    await expect(parseBody(req, schema)).resolves.toEqual({ a: "=1" });
  });

  it("assertJsonContentType бросает тем же AppError", () => {
    expect(() => assertJsonContentType(post(FORGED_JSON))).toThrow(AppError);
    expect(() => assertJsonContentType(post(FORGED_JSON, { "content-type": "application/json" }))).not.toThrow();
  });
});

describe("nonJsonBodyRefusal", () => {
  it("text/plain → 415-конверт проекта", async () => {
    const res = nonJsonBodyRefusal(post(FORGED_JSON));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(415);
    const json = (await res!.json()) as { ok: boolean; error: { message: string; code: string } };
    expect(json.ok).toBe(false);
    expect(json.error).toMatchObject({ message: NON_JSON_BODY_MESSAGE, code: NON_JSON_BODY_CODE });
  });

  it("application/json → null", () => {
    expect(nonJsonBodyRefusal(post(FORGED_JSON, { "content-type": "application/json" }))).toBeNull();
  });
});

describe("роут, читающий тело сам (POST /api/notifications/push/subscribe)", () => {
  const subscription = JSON.stringify({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } });

  beforeEach(() => {
    getSessionUserMock.mockReset().mockResolvedValue({ id: "user-1", roles: ["CLIENT"] });
    upsertMock.mockReset().mockResolvedValue({});
  });

  it("text/plain с валидным телом → 415, подписка не записана", async () => {
    const res = await subscribePost(post(subscription));
    expect(res.status).toBe(415);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe(NON_JSON_BODY_CODE);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("application/json → подписка записана", async () => {
    const res = await subscribePost(post(subscription, { "content-type": "application/json" }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("Bearer без типа → подписка записана", async () => {
    const req = new Request("http://localhost/api/x", {
      method: "POST",
      body: new Blob([subscription]),
      headers: { authorization: "Bearer token" },
    });
    const res = await subscribePost(req);
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});

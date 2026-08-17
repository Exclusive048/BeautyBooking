import { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FIX-B17 — диагностический роут отражает МЕТАДАННЫЕ ЗАПРОСА, и это ровно тот
 * класс роутов, где безопасность держится не на «его же никто не найдёт».
 * Поэтому проверяются три свойства сразу, и каждое — поведением:
 *
 *  1. **Только админ.** Гейт не мокается: подменена лишь сессия
 *     (`@/lib/auth/session`), а `requireAdminAuth` → `requireAuth` →
 *     `hasAdminRole` работают настоящие. Мок самого гейта проверял бы, что мы
 *     позвали свой же мок.
 *  2. **Частотный лимит есть.** Проверяется через НАСТОЯЩИЙ прокси: запрос к
 *     этому пути обязан тронуть счётчик тира. Утверждение «в конфиге есть тир»
 *     зеленело бы и при выключенном для этого пути лимитере.
 *  3. **Ответ не несёт ничего, кроме трёх IP-заголовков.** Проверяется на
 *     запросе, который НЕСЁТ `cookie` и `authorization`: их отсутствие в теле —
 *     это и есть «эхо сужено», а не «мы написали три поля».
 *
 * @probe   что сломать (по одному, каждый раз с откатом):
 *   1. снять `if (!auth.ok) return auth.response;` из роута → 2 failed:
 *      «аноним получает 401 … expected 200 to be 401» и
 *      «не-админ получает 403 … expected 200 to be 403»;
 *   2. вернуть из роута `Object.fromEntries(req.headers)` вместо диагностики →
 *      1 failed: «в теле ответа не должно быть значений cookie/authorization …
 *      expected body not to contain 'bh_session=secret-session-value'»;
 *   3. опубликовать путь в `openApiSpec` → 1 failed: «диагностика не должна
 *      попадать в публичный контракт OpenAPI … expected true to be false»;
 *   4. в `resolveRateLimitTier` (`src/proxy.ts`) вернуть `null` для
 *      `/api/admin/diagnostics` → 1 failed: «прокси не завёл ключа лимита для
 *      диагностики: expected [] to have a length of 1 but got +0».
 */

const getSessionUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionUser,
  getSessionUserFromRequest: vi.fn(),
}));

const redis = vi.hoisted(() => ({ counters: new Map<string, number>() }));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn(async () => ({
    async incr(key: string) {
      const next = (redis.counters.get(key) ?? 0) + 1;
      redis.counters.set(key, next);
      return next;
    },
    async expire() {
      return true;
    },
  })),
  withRedisCommandTimeout: <T>(_operation: string, promise: Promise<T>) => promise,
}));
// Прокси на импорте тянет ротацию сессии (Prisma) — запросы здесь без кук сессии.
vi.mock("@/lib/auth/session-refresh", () => ({
  rotateSessionWithTelemetry: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/jwt", () => ({ verifyToken: vi.fn(() => null) }));

import { getOpenApiSpec } from "@/lib/openapi/spec";
import { toApiRouteTemplate } from "@/lib/rate-limit/route-template";
import { proxy } from "@/proxy";

import { GET } from "./route";

const ROUTE = "/api/admin/diagnostics/client-ip";

const ADMIN = { id: "admin-1", roles: [AccountType.ADMIN] };
const CLIENT_USER = { id: "user-1", roles: [AccountType.CLIENT] };

function request(headers: Record<string, string> = {}): Request {
  return new Request(`https://example.test${ROUTE}`, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  redis.counters.clear();
});

describe("FIX-B17 · доступ к диагностике", () => {
  it("аноним получает 401 и никакой диагностики", async () => {
    getSessionUser.mockResolvedValue(null);

    const res = await GET(request({ "x-forwarded-for": "203.0.113.9" }));

    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("203.0.113.9");
  });

  it("аутентифицированный НЕ-админ получает 403 и никакой диагностики", async () => {
    getSessionUser.mockResolvedValue(CLIENT_USER);

    const res = await GET(request({ "x-forwarded-for": "203.0.113.9" }));

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("203.0.113.9");
  });

  it("админ получает разобранную цепочку, конфигурацию и итоговый адрес", async () => {
    getSessionUser.mockResolvedValue(ADMIN);

    const res = await GET(request({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }));
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Ровно то, что нужно оператору: что пришло, как настроено, что получилось.
    expect(body.data.chain).toEqual(["1.1.1.1", "203.0.113.9"]);
    expect(body.data.resolvedIp).toBe("203.0.113.9");
    expect(body.data.effectiveHops).toBe(1);
    expect(body.data.source).toBe("x-forwarded-for");
    expect(body.data.clamped).toBe(false);
  });
});

describe("FIX-B17 · эхо сужено до заголовков разрешения адреса", () => {
  it("cookie и authorization не попадают в ответ", async () => {
    getSessionUser.mockResolvedValue(ADMIN);

    const res = await GET(
      request({
        "x-forwarded-for": "203.0.113.9",
        cookie: "bh_session=secret-session-value",
        authorization: "Bearer secret-bearer-value",
        "x-custom-internal": "secret-internal-value",
      }),
    );
    const raw = await res.text();

    for (const secret of [
      "bh_session=secret-session-value",
      "secret-bearer-value",
      "secret-internal-value",
    ]) {
      expect(raw, `в теле ответа не должно быть значений cookie/authorization: ${secret}`).not.toContain(
        secret,
      );
    }
    // Контроль: то, ради чего роут существует, в ответе ЕСТЬ — иначе проверка
    // выше удовлетворялась бы пустым телом.
    expect(raw).toContain("203.0.113.9");
  });
});

describe("FIX-B17 · частотный лимит и публичная поверхность", () => {
  it("прокси считает запрос к диагностике — путь не выпадает из лимитера", async () => {
    const response = await proxy(new NextRequest(`https://example.test${ROUTE}`));

    // Запрос прошёл дальше (лимит не исчерпан), но счётчик тронут.
    expect(response.headers.get("x-middleware-next")).toBe("1");
    const keys = [...redis.counters.keys()];
    expect(keys, "прокси не завёл ключа лимита для диагностики").toHaveLength(1);
    expect(keys[0]).toContain(toApiRouteTemplate(ROUTE));
    expect(redis.counters.get(keys[0]!)).toBe(1);
  });

  it("шаблон ключа не схлопывает сегменты пути (иначе диагностика делит ведро)", () => {
    // `diagnostics` / `client-ip` обязаны быть в `API_STATIC_SEGMENTS`.
    expect(toApiRouteTemplate(ROUTE)).toBe(ROUTE);
  });

  it("диагностика не должна попадать в публичный контракт OpenAPI", () => {
    const served = JSON.stringify(getOpenApiSpec());
    expect(
      served.includes(ROUTE),
      "роут отражает метаданные запроса — публиковать его в контракте значит рекламировать эхо",
    ).toBe(false);
    // Контроль машинерии: документ вообще содержит пути, то есть проверка не
    // зеленеет на пустой строке.
    expect(served).toContain("/api/bookings");
  });
});

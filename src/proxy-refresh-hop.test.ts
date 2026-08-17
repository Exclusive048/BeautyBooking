import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RES-04 → PERF-14 — обновление сессии прокси больше не идёт по HTTP.
 *
 * История. RES-04 обнаружил, что self-hop прокси в `/api/auth/refresh` шёл без
 * верхней границы и без `try/catch`: прокси держит ВХОДЯЩИЙ запрос, пока ждёт
 * ИСХОДЯЩИЙ к самому себе, то есть один запрос занимает два слота обработки, и
 * при замедлении refresh-роута петля затягивается сама. Тогда хоп ограничили
 * таймаутом 2 с.
 *
 * PERF-14 убрал сам хоп: прокси Next 16 работает в рантайме Node.js, поэтому
 * ротация вызывается функцией. Инвариант, который сторожит этот файл, стал
 * СТРОЖЕ прежнего — не «у хопа есть граница», а «хопа нет вовсе», — и
 * одновременно сохранил вторую половину RES-04: отказ обновления не роняет
 * запрос, а даёт обработчику увидеть протухшую куку и ответить 401.
 *
 * Не-вакуумность: прогонялось с возвращённым `fetch`-хопом (тест на отсутствие
 * сетевого вызова краснеет) и с `rotateSessionWithTelemetry`, бросающим ошибку
 * без `try/catch` в прокси (запрос отвечает 500 — краснеет второй тест).
 */

const checkRateLimit = vi.hoisted(() => vi.fn(async () => ({ limited: false, retryAfterSeconds: 0 })));
const verifyToken = vi.hoisted(() => vi.fn(() => null));
const rotateSessionWithTelemetry = vi.hoisted(() =>
  vi.fn(async (_response: { headers: Headers }, _refreshToken: string): Promise<boolean> => false),
);

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/auth/jwt", () => ({ verifyToken }));
vi.mock("@/lib/auth/session-refresh", () => ({ rotateSessionWithTelemetry }));

import { proxy } from "./proxy";

const PROXY_SOURCE = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");

function requestWithStaleSession(): NextRequest {
  return new NextRequest("https://example.test/cabinet/master", {
    method: "GET",
    headers: { cookie: "bh_session=stale-access; bh_refresh=refresh-token" },
  });
}

describe("PERF-14 · прокси обновляет сессию вызовом, а не запросом к самому себе", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    checkRateLimit.mockClear();
    rotateSessionWithTelemetry.mockReset();
    rotateSessionWithTelemetry.mockResolvedValue(false);
    // Протухший access-токен: именно эта ветка и уходила в self-hop.
    verifyToken.mockReturnValue(null);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
  });

  it("сетевого вызова не происходит вовсе — ротация зовётся напрямую", async () => {
    const networkCall = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = networkCall as unknown as typeof fetch;

    await proxy(requestWithStaleSession());

    expect(networkCall).not.toHaveBeenCalled();
    expect(rotateSessionWithTelemetry).toHaveBeenCalledTimes(1);
    expect(rotateSessionWithTelemetry.mock.calls[0][1]).toBe("refresh-token");
  });

  it("отказ ротации не роняет входящий запрос (обработчик ответит 401 сам)", async () => {
    rotateSessionWithTelemetry.mockRejectedValue(new Error("db unavailable"));

    const res = await proxy(requestWithStaleSession());

    expect(res.status).toBeLessThan(500);
  });

  it("без refresh-куки ротация не вызывается", async () => {
    const res = await proxy(
      new NextRequest("https://example.test/cabinet/master", { method: "GET" }),
    );

    expect(rotateSessionWithTelemetry).not.toHaveBeenCalled();
    expect(res.status).toBeLessThan(500);
  });

  it("в исходнике не осталось ни self-hop'а, ни его таймаута", () => {
    // Хоп возвращается «естественно» — кто-то допишет `fetch` обратно, увидев
    // старый комментарий. Проверяется отсутствие обеих его примет.
    expect(PROXY_SOURCE).not.toMatch(/await\s+fetch\(/);
    expect(PROXY_SOURCE).not.toContain("REFRESH_FETCH_TIMEOUT_MS");
    expect(PROXY_SOURCE).toContain("rotateSessionWithTelemetry");
  });
});

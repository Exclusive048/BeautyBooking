import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

/**
 * RES-04 — self-hop прокси в `/api/auth/refresh` шёл без верхней границы и без
 * `try/catch`.
 *
 * Импакт не «медленнее», а петля: прокси держит ВХОДЯЩИЙ запрос, пока ждёт
 * ИСХОДЯЩИЙ к самому себе, то есть один запрос занимает два слота обработки.
 * Когда `/api/auth/refresh` начинает тормозить, свободных слотов остаётся всё
 * меньше — в том числе для него самого, и разорвать это нечем. Плюс голый
 * `fetch` БРОСАЕТ при сетевой ошибке, а throw из middleware — это 500 на
 * каждый запрос вместо честного 401.
 */

const checkRateLimit = vi.hoisted(() => vi.fn(async () => ({ limited: false, retryAfterSeconds: 0 })));
const verifyToken = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/auth/jwt", () => ({ verifyToken }));

import { proxy } from "./proxy";

const PROXY_SOURCE = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");

function requestWithStaleSession(): NextRequest {
  return new NextRequest("https://example.test/cabinet/master", {
    method: "GET",
    headers: { cookie: "bh_session=stale-access; bh_refresh=refresh-token" },
  });
}

describe("RES-04 · self-hop прокси в /api/auth/refresh ограничен сверху", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    checkRateLimit.mockClear();
    // Протухший access-токен: именно эта ветка и уходит в self-hop.
    verifyToken.mockReturnValue(null);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
  });

  it("в self-hop передаётся AbortSignal", async () => {
    let capturedSignal: AbortSignal | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedSignal = (init?.signal as AbortSignal | undefined) ?? null;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await proxy(requestWithStaleSession());

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("таймаут хопа не роняет входящий запрос — обработчик просто увидит протухшую куку", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as unknown as typeof fetch;

    const res = await proxy(requestWithStaleSession());

    expect(res.status).toBeLessThan(500);
  });

  it("сетевой отказ хопа (ECONNREFUSED при рестарте) тоже не роняет запрос", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const res = await proxy(requestWithStaleSession());

    expect(res.status).toBeLessThan(500);
  });

  it("граница задана константой и не превышает 5 с", () => {
    // Сам факт срабатывания таймера тестом не проверяется — ждать 2 с в
    // прогоне дороже, чем оно стоит. Проверяется контракт: сигнал уходит в
    // `fetch` (тест выше), а его источник — именно таймаут с осмысленным
    // значением.
    expect(PROXY_SOURCE).toMatch(/signal:\s*AbortSignal\.timeout\(REFRESH_FETCH_TIMEOUT_MS\)/);
    const declared = PROXY_SOURCE.match(/const REFRESH_FETCH_TIMEOUT_MS = (\d+);/);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBeGreaterThan(0);
    expect(Number(declared![1])).toBeLessThanOrEqual(5000);
  });
});

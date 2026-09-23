import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SESSION-LOSS-01 — на `/login` уводит только ответ «вход устарел» (401 от
 * обновления сессии). Обрыв сети и 503 «идут работы» во время автодеплоя
 * раньше тоже разлогинивали, хотя сессия была жива.
 *
 * @probe 2026-09-23 — в `fetchWithAuth` возвращено прежнее «любой неуспех
 * обновления → /login»: красные «503 от обновления…» и «обрыв сети…».
 * Возвращено — зелёный.
 */

import { fetchWithAuth } from "@/lib/http/fetch-with-auth";

const location = { href: "/cabinet/bookings", pathname: "/cabinet/bookings" };

beforeEach(() => {
  location.href = "/cabinet/bookings";
  vi.stubGlobal("window", { location });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(refresh: () => Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/auth/refresh") return refresh();
      // Первый вызов — 401, повтор после обновления — 200.
      return new Response(null, { status: calls.filter((u) => u === url).length === 1 ? 401 : 200 });
    }),
  );
  return calls;
}

describe("fetchWithAuth · когда разлогинивать", () => {
  it("обновление удалось — запрос повторён, пользователь на месте", async () => {
    stubFetch(async () => new Response(null, { status: 200 }));
    const res = await fetchWithAuth("/api/me");
    expect(res.status).toBe(200);
    expect(location.href).toBe("/cabinet/bookings");
  });

  it("обновление ответило 401 — на /login", async () => {
    stubFetch(async () => new Response(null, { status: 401 }));
    await fetchWithAuth("/api/me");
    expect(location.href).toMatch(/^\/login\?next=/);
  });

  it("503 от обновления (идут работы) — пользователь остаётся", async () => {
    stubFetch(async () => new Response(null, { status: 503 }));
    const res = await fetchWithAuth("/api/me");
    expect(res.status).toBe(401);
    expect(location.href).toBe("/cabinet/bookings");
  });

  it("обрыв сети при обновлении — пользователь остаётся", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await fetchWithAuth("/api/me");
    expect(location.href).toBe("/cabinet/bookings");
  });
});

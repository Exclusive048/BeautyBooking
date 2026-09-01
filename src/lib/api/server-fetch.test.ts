import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * PWA-FIX-02 — SSR-запрос к собственному API не выходит в публичную сеть.
 *
 * 🔴 Предмет проверки — АДРЕС, по которому идёт запрос, и заголовок, по которому
 * лимитер узнаёт клиента. Оба невидимы в вёрстке и оба уже стоили работающего
 * продукта: пока база бралась из `x-forwarded-host`, контейнер ходил на
 * `https://masterryadom.ru` сам к себе, `fetch` бросал, и три секции публичного
 * профиля (портфолио, отзывы, ЗАПИСЬ) показывали «Не удалось загрузить блок».
 *
 * @probe Пробы выполнены на правдоподобных формах регрессии, не на выдуманных:
 *   (1) возврат прежней строки (`${proto}://${host}${path}`) в production-ветке
 *       — краснеет «expected https://masterryadom.ru/... to start with http://127.0.0.1»;
 *   (2) удаление проброса `x-forwarded-for` (самая вероятная «уборка лишнего»
 *       при рефакторинге) — краснеет тест про лимитер.
 * Отдельно проверено, что тест не вакуумен по dev-ветке: если сделать петлю
 * безусловной, краснеет третий кейс.
 */

const INCOMING_HEADERS = new Map<string, string>([
  ["x-forwarded-host", "masterryadom.ru"],
  ["x-forwarded-proto", "https"],
  ["host", "masterryadom.ru"],
  ["cookie", "bh_session=abc"],
  ["x-forwarded-for", "203.0.113.7, 10.0.0.2"],
]);

function mockHeaders() {
  vi.doMock("next/headers", () => ({
    headers: async () => ({ get: (k: string) => INCOMING_HEADERS.get(k) ?? null }),
  }));
}

function mockEnv(isProduction: boolean) {
  vi.doMock("@/lib/env", () => ({ env: { PORT: 3000 }, isProduction }));
}

/** Перехватывает `fetch` и возвращает то, с чем его позвали. */
function captureFetch() {
  const calls: Array<{ url: string; headers: Headers }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ ok: true, data: { items: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("next/headers");
  vi.doUnmock("@/lib/env");
});

describe("serverApiFetch", () => {
  it("в production идёт по петле, а не на публичный домен", async () => {
    mockHeaders();
    mockEnv(true);
    const calls = captureFetch();
    const { serverApiFetch } = await import("@/lib/api/server-fetch");

    await serverApiFetch("/api/feed/portfolio?limit=8");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:3000/api/feed/portfolio?limit=8");
    // Никакого выхода наружу: ни публичного имени, ни TLS.
    expect(calls[0]!.url).not.toContain("masterryadom.ru");
    expect(calls[0]!.url.startsWith("https://")).toBe(false);
  });

  it("пробрасывает x-forwarded-for — иначе per-IP лимит считался бы по адресу петли", async () => {
    mockHeaders();
    mockEnv(true);
    const calls = captureFetch();
    const { serverApiFetch } = await import("@/lib/api/server-fetch");

    await serverApiFetch("/api/feed/portfolio?limit=8");

    // Цепочка копируется ДОСЛОВНО: `extractClientIp` снимает записи справа по
    // TRUSTED_PROXY_HOPS, и любая правка формы сместила бы результат.
    expect(calls[0]!.headers.get("x-forwarded-for")).toBe("203.0.113.7, 10.0.0.2");
    expect(calls[0]!.headers.get("cookie")).toBe("bh_session=abc");
  });

  it("в dev остаётся на заголовках запроса — порт там не фиксирован", async () => {
    mockHeaders();
    mockEnv(false);
    const calls = captureFetch();
    const { serverApiFetch } = await import("@/lib/api/server-fetch");

    await serverApiFetch("/api/feed/portfolio?limit=8");

    expect(calls[0]!.url).toBe("https://masterryadom.ru/api/feed/portfolio?limit=8");
  });
});

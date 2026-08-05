import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RES-10 — платные адресные вызовы (геокодер ×2 и подсказки) шли без верхней
 * границы в request-path.
 *
 * У подсказок параметр `signal` формально был, но он про ОТМЕНУ вызывающим
 * (клиент увёл фокус), а единственный серверный вызывающий сигнала не
 * передаёт — то есть запрос был неограничен. Поверхности анонимные и стоят в
 * вводе адреса с дебаунсом, поэтому зависший внешний сервис копит висящие
 * запросы быстрее любого другого пути.
 */

vi.mock("@/lib/env", () => ({
  env: { YANDEX_SUGGEST_API_KEY: "key", YANDEX_GEOCODER_API_KEY: "key" },
}));
vi.mock("@/lib/maps/address-cache", () => ({
  normalizeAddressQuery: (value: string) => value.trim().toLowerCase(),
  readAddressCache: async () => null,
  writeAddressCache: async () => undefined,
}));

import { suggestAddresses } from "@/lib/maps/address-suggest";

const realFetch = globalThis.fetch;

describe("RES-10 · адресные вызовы ограничены сверху", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ results: [] }), { status: 200 })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("подсказки: без сигнала вызывающего запрос всё равно ограничен", async () => {
    await suggestAddresses({ query: "Тверская", limit: 5 });

    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("подсказки: сигнал вызывающего не отменяет границу — прерывает любой из двух", async () => {
    // `AbortSignal.any` — обе причины, а не «или»: отмена клиентом не должна
    // снимать таймаут, а таймаут не должен лишать клиента права прервать
    // запрос раньше.
    const controller = new AbortController();
    await suggestAddresses({ query: "Тверская", limit: 5, signal: controller.signal });

    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const signal = init?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal).not.toBe(controller.signal);

    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("оба геокодер-вызова несут таймаут", () => {
    // Роут и auto-grow города дёргают один и тот же внешний сервис из разных
    // модулей; забыть границу в одном из них — вернуть половину дефекта.
    for (const file of [
      "src/app/api/address/geocode/route.ts",
      "src/lib/cities/yandex-locality.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toMatch(/signal:\s*AbortSignal\.timeout\(GEOCODE_REQUEST_TIMEOUT_MS\)/);
      expect(source).toMatch(/const GEOCODE_REQUEST_TIMEOUT_MS = \d[\d_]*;/);
    }
  });
});

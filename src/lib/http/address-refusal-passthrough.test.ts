import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 11 — отказы адресного сервиса доходят до человека дословно.
 *
 * Конверт строит НАСТОЯЩИЙ обработчик роута (`/api/address/suggest`,
 * `/api/address/geocode`), а строку выбирает та же пара, что зовут поверхности
 * (`fetchJson` → `serverMessageOr`): правку копирайта на сервере тест не
 * переживёт зелёным. 429 и 503 — разные советы («подождите» против «сервис
 * недоступен»), и оба видны при вводе адреса.
 *
 * @probe 2026-09-29 — в `district-suggest-input.tsx` отказ подсказок заменён
 * своей строкой (`setSuggestError(UI_TEXT…districtSuggestFailed)`): сторож
 * поверхностей `actionable-refusal-passthrough.test.ts` остался ЗЕЛЁНЫМ — он
 * искал ИМЯ `serverMessageOr`, и его держала оставшаяся строка импорта.
 * Ужесточён до формы вызова (`serverMessageOr(`) — та же проба красная
 * («решение … не принимается»). Та же замена в `address-editor.tsx` остаётся
 * зелёной и после ужесточения: в файле второй сайт (`serverMessageOf(` у
 * автосохранения) — файловая гранулярность сторожа, названа в нём.
 */

const checkRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/maps/address-suggest", () => ({ suggestAddresses: vi.fn(async () => []) }));
vi.mock("@/lib/maps/address-cache", () => ({
  normalizeAddressQuery: (q: string) => q.trim().toLowerCase(),
  readAddressCache: vi.fn(async () => null),
  writeAddressCache: vi.fn(async () => undefined),
}));
vi.mock("@/lib/env", () => ({ env: { YANDEX_GEOCODER_API_KEY: "" }, isProduction: false }));

import { GET as suggestGET } from "@/app/api/address/suggest/route";
import { GET as geocodeGET } from "@/app/api/address/geocode/route";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const OWN = UI_TEXT.cabinetMaster.profile.location.addressSuggestFailed;

async function shown(response: Response): Promise<string> {
  vi.stubGlobal("fetch", async () => response.clone());
  try {
    return await fetchJson("/x").then(
      () => "поверхность не должна была получить успех",
      (error: unknown) => serverMessageOr(error, OWN),
    );
  } finally {
    vi.unstubAllGlobals();
  }
}

beforeEach(() => {
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ limited: false });
});

describe("адреса: отказ сервиса — дословно", () => {
  it("лимит подсказок (429) советует подождать, а не «попробуйте ещё раз»", async () => {
    checkRateLimit.mockResolvedValue({ limited: true });
    const text = await shown(await suggestGET(new Request("http://localhost/api/address/suggest?q=Тверская")));
    expect(text).not.toBe(OWN);
    expect(text).toMatch(/Слишком много запросов/);
  });

  it("недоступный геокодер (503) называет сервис, а не повтор", async () => {
    const text = await shown(await geocodeGET(new Request("http://localhost/api/address/geocode?q=Тверская")));
    expect(text).not.toBe(OWN);
    expect(text).toMatch(/Сервис адресов временно недоступен/);
  });

  it("429 и 503 — разные строки", async () => {
    checkRateLimit.mockResolvedValue({ limited: true });
    const tooMany = await shown(await suggestGET(new Request("http://localhost/api/address/suggest?q=a1")));
    checkRateLimit.mockResolvedValue({ limited: false });
    const down = await shown(await geocodeGET(new Request("http://localhost/api/address/geocode?q=a1")));
    expect(tooMany).not.toBe(down);
  });

  it("counter-case: обрыв сети — строка поверхности", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const text = await fetchJson("/x").then(
      () => "",
      (error: unknown) => serverMessageOr(error, OWN),
    );
    vi.unstubAllGlobals();
    expect(text).toBe(OWN);
  });
});

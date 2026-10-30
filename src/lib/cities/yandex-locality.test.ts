import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 27 — страна из ответа геокодера. Тихая поломка разбора
 * (страна всегда `null`) не уронила бы ничего: фильтр по решению 27.2 такой
 * адрес ПРОПУСКАЕТ. Поэтому разбор закреплён отдельно.
 */

vi.mock("@/lib/env", () => ({ env: { YANDEX_GEOCODER_API_KEY: "test-key" } }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { geocodeWithLocality } from "@/lib/cities/yandex-locality";

function respond(address: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          response: {
            GeoObjectCollection: {
              featureMember: [
                { GeoObject: { Point: { pos: "76.95 43.24" }, metaDataProperty: { GeocoderMetaData: { Address: address } } } },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("geocodeWithLocality — страна", () => {
  it("берёт country_code и название компонента «страна»", async () => {
    respond({
      country_code: "KZ",
      Components: [
        { kind: "country", name: "Казахстан" },
        { kind: "locality", name: "Алматы" },
      ],
    });
    const outcome = await geocodeWithLocality("Алматы, ул. Достык, 89");
    expect(outcome.kind).toBe("found");
    const result = outcome.kind === "found" ? outcome.result : null;
    expect(result?.country).toEqual({ code: "KZ", name: "Казахстан" });
    expect(result?.locality).toBe("Алматы");
  });

  it("без кода — только название; без обоих — null, null", async () => {
    respond({ Components: [{ kind: "country", name: "Россия" }, { kind: "locality", name: "Москва" }] });
    expect(foundCountry(await geocodeWithLocality("Москва"))).toEqual({ code: null, name: "Россия" });

    respond({ Components: [] });
    expect(foundCountry(await geocodeWithLocality("где-то"))).toEqual({ code: null, name: null });
  });
});

function foundCountry(outcome: Awaited<ReturnType<typeof geocodeWithLocality>>) {
  return outcome.kind === "found" ? outcome.result.country : undefined;
}

/**
 * GEOCODER-UNAVAILABLE-503 (A-03) — «геокодер недоступен» и «адрес не
 * распознан» различаются. Раньше оба были `null`, и кабинет мастера на
 * временный сбой обнулял город (мастер молча выпадал из каталога).
 *
 * @probe 2026-10-30 — ветка `!response.ok` возвращена к единому `not_found`
 * (как прежний `null`): покраснели все шесть кейсов HTTP (429, 5xx, 401/403).
 * Возвращено — зелёный.
 */
describe("geocodeWithLocality — недоступен ≠ не распознан", () => {
  function status(code: number, body = "{}") {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: code })));
  }

  it.each([429, 500, 502, 503, 401, 403])("HTTP %i — unavailable (повтор может помочь)", async (code) => {
    status(code);
    expect(await geocodeWithLocality("Москва, Тверская 1")).toEqual({ kind: "unavailable" });
  });

  it("обрыв сети / таймаут — unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await geocodeWithLocality("Москва, Тверская 1")).toEqual({ kind: "unavailable" });
  });

  it("ответ не JSON (страница ошибки прокси) — unavailable", async () => {
    status(200, "<html>bad gateway</html>");
    expect(await geocodeWithLocality("Москва, Тверская 1")).toEqual({ kind: "unavailable" });
  });

  it("400 — not_found: Яндекс отверг сам запрос, повтор того же адреса не поможет", async () => {
    status(400);
    expect(await geocodeWithLocality("???")).toEqual({ kind: "not_found" });
  });

  it("пустая выдача — not_found (адрес не распознан)", async () => {
    status(200, JSON.stringify({ response: { GeoObjectCollection: { featureMember: [] } } }));
    expect(await geocodeWithLocality("нигде")).toEqual({ kind: "not_found" });
  });
});

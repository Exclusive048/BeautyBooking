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
    const result = await geocodeWithLocality("Алматы, ул. Достык, 89");
    expect(result?.country).toEqual({ code: "KZ", name: "Казахстан" });
    expect(result?.locality).toBe("Алматы");
  });

  it("без кода — только название; без обоих — null, null", async () => {
    respond({ Components: [{ kind: "country", name: "Россия" }, { kind: "locality", name: "Москва" }] });
    expect((await geocodeWithLocality("Москва"))?.country).toEqual({ code: null, name: "Россия" });

    respond({ Components: [] });
    expect((await geocodeWithLocality("где-то"))?.country).toEqual({ code: null, name: null });
  });
});

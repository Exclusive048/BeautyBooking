import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, findFirst, create, geocodeWithLocality } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  geocodeWithLocality: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    city: { findUnique, findFirst, create },
  },
}));

vi.mock("@/lib/cities/yandex-locality", () => ({
  geocodeWithLocality,
}));

vi.mock("@/lib/logging/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

// `Prisma` is imported by detect-city for the unique-violation check; mock it
// minimally so we can throw the right error shape from `create.mockRejectedValue`.
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return {
    Prisma: { PrismaClientKnownRequestError },
  };
});

import { Prisma } from "@prisma/client";
import { logInfo } from "@/lib/logging/logger";
import { detectCityFromAddress } from "@/lib/cities/detect-city";

const moskvaRow = {
  id: "city-moskva",
  slug: "moskva",
  name: "Москва",
  nameGenitive: null,
  latitude: 55.75,
  longitude: 37.62,
  timezone: "Europe/Moscow",
  isActive: true,
  sortOrder: 1,
  autoCreated: false,
};

const krasnodarRow = {
  ...moskvaRow,
  id: "city-krasnodar",
  slug: "krasnodar",
  name: "Краснодар",
  latitude: 45.04,
  longitude: 38.97,
  autoCreated: true,
};

describe("detectCityFromAddress", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
    create.mockReset();
    geocodeWithLocality.mockReset();
  });

  it("returns no_address when input is empty / whitespace", async () => {
    const empty = await detectCityFromAddress("");
    expect(empty).toEqual({ ok: false, reason: "no_address" });

    const ws = await detectCityFromAddress("   ");
    expect(ws).toEqual({ ok: false, reason: "no_address" });

    const nullish = await detectCityFromAddress(null);
    expect(nullish).toEqual({ ok: false, reason: "no_address" });

    expect(geocodeWithLocality).not.toHaveBeenCalled();
  });

  it("returns geocoder_failed when geocoder is unavailable", async () => {
    geocodeWithLocality.mockResolvedValue(null);
    const result = await detectCityFromAddress("Москва, Тверская 1");
    expect(result).toEqual({ ok: false, reason: "geocoder_failed" });
  });

  it("returns no_locality when geocoder result has no city component", async () => {
    geocodeWithLocality.mockResolvedValue({ geoLat: 55.7, geoLng: 37.6, locality: null });
    const result = await detectCityFromAddress("какой-то остров без города");
    expect(result).toEqual({ ok: false, reason: "no_locality" });
  });

  it("returns existing city when slug matches", async () => {
    geocodeWithLocality.mockResolvedValue({ geoLat: 55.75, geoLng: 37.62, locality: "Москва" });
    findUnique.mockResolvedValue(moskvaRow);

    const result = await detectCityFromAddress("Москва, Тверская 1");

    expect(result).toEqual({
      ok: true,
      cityId: "city-moskva",
      cityName: "Москва",
      timezone: "Europe/Moscow",
      geoLat: 55.75,
      geoLng: 37.62,
      wasCreated: false,
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { slug: "moskva" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("normalizes 'г. Москва' before slug lookup (no duplicate)", async () => {
    geocodeWithLocality.mockResolvedValue({
      geoLat: 55.75,
      geoLng: 37.62,
      locality: "г. Москва",
    });
    findUnique.mockResolvedValue(moskvaRow);

    const result = await detectCityFromAddress("Тверская 1");

    expect(result.ok).toBe(true);
    // The "г. " prefix must be stripped before computing slug. If it weren't,
    // we'd look up slug="g-moskva" or similar and miss the existing row.
    expect(findUnique).toHaveBeenCalledWith({ where: { slug: "moskva" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("новый город получает пояс своего субъекта, адрес в лог не пишется", async () => {
    geocodeWithLocality.mockResolvedValue({
      geoLat: 53.2,
      geoLng: 50.15,
      locality: "Самара",
      regions: ["Приволжский федеральный округ", "Самарская область"],
    });
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...krasnodarRow,
      id: "city-samara",
      slug: "samara",
      name: "Самара",
      timezone: data.timezone,
    }));

    const result = await detectCityFromAddress("Самара, ул. Ленинградская 1, кв. 5");

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: "samara", timezone: "Europe/Samara" }),
    });
    expect(result).toMatchObject({ ok: true, timezone: "Europe/Samara", wasCreated: true });
    expect(JSON.stringify(vi.mocked(logInfo).mock.calls)).not.toContain("Ленинградская");
  });

  it("auto-creates new city with autoCreated:true when slug doesn't exist", async () => {
    geocodeWithLocality.mockResolvedValue({
      geoLat: 45.04,
      geoLng: 38.97,
      locality: "Краснодар",
    });
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue(krasnodarRow);

    const result = await detectCityFromAddress("Краснодар, ул. Красная 100");

    expect(result).toEqual({
      ok: true,
      cityId: "city-krasnodar",
      cityName: "Краснодар",
      timezone: "Europe/Moscow",
      geoLat: 45.04,
      geoLng: 38.97,
      wasCreated: true,
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: "krasnodar",
        name: "Краснодар",
        latitude: 45.04,
        longitude: 38.97,
        timezone: "Europe/Moscow",
        autoCreated: true,
        isActive: true,
      }),
    });
  });

  it("recovers from race condition: P2002 on create → re-fetch wins", async () => {
    geocodeWithLocality.mockResolvedValue({
      geoLat: 45.04,
      geoLng: 38.97,
      locality: "Краснодар",
    });
    // First lookup miss (no city yet)
    findUnique.mockResolvedValueOnce(null);
    findFirst.mockResolvedValueOnce(null);
    // Create races and loses → unique violation. Real Prisma type wants
    // `clientVersion`; our vi.mock provides a relaxed shim — cast for TS.
    const PrismaErr = Prisma.PrismaClientKnownRequestError as unknown as new (
      message: string,
      opts: { code: string },
    ) => Error;
    create.mockRejectedValueOnce(new PrismaErr("unique violation", { code: "P2002" }));
    // Re-fetch finds the row that the winning request just created
    findUnique.mockResolvedValueOnce(krasnodarRow);

    const result = await detectCityFromAddress("Краснодар, ул. Красная 100");

    expect(result).toEqual({
      ok: true,
      cityId: "city-krasnodar",
      cityName: "Краснодар",
      timezone: "Europe/Moscow",
      geoLat: 45.04,
      geoLng: 38.97,
      wasCreated: false, // we didn't create — the racing request did
    });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("falls back to case-insensitive name match before auto-creating", async () => {
    // Admin manually created "Москва" with slug "msk" (custom slug).
    // Our slug computation gives "moskva", which doesn't match → fallback to name.
    geocodeWithLocality.mockResolvedValue({
      geoLat: 55.75,
      geoLng: 37.62,
      locality: "Москва",
    });
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue({ ...moskvaRow, slug: "msk" });

    const result = await detectCityFromAddress("Тверская 1");

    expect(result.ok).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { name: { equals: "Москва", mode: "insensitive" } },
    });
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * 29.09 доработки · 27 — только Россия (RF-ONLY-SCOPE-01). Страна — из ответа
 * геокодера (`country_code`, запасной путь — компонент «страна»).
 *
 * @probe 2026-10-01 — проверка страны перенесена ПОСЛЕ поиска города (только
 * перед созданием): покраснели три — «KZ — отказ, город не ищется», «существующий
 * город + KZ — тоже отказ» и «кода нет — по названию страны» (заведённый город
 * возвращался `ok: true`). Возвращено — зелёный.
 */
describe("detectCityFromAddress — страна", () => {
  const almatyRow = { ...moskvaRow, id: "city-almaty", slug: "almaty", name: "Алматы", autoCreated: true };

  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
    create.mockReset();
    geocodeWithLocality.mockReset();
    vi.mocked(logInfo).mockClear();
  });

  it("KZ — отказ foreign_country, город не ищется и не создаётся", async () => {
    geocodeWithLocality.mockResolvedValue({
      geoLat: 43.24,
      geoLng: 76.95,
      locality: "Алматы",
      regions: [],
      country: { code: "KZ", name: "Казахстан" },
    });
    const result = await detectCityFromAddress("Алматы, ул. Достык, 89");
    expect(result).toEqual({ ok: false, reason: "foreign_country" });
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("существующий город + KZ — тоже отказ (заведённая раньше «Алматы» адресов не принимает)", async () => {
    findUnique.mockResolvedValue(almatyRow);
    geocodeWithLocality.mockResolvedValue({
      geoLat: 43.24,
      geoLng: 76.95,
      locality: "Алматы",
      regions: [],
      country: { code: "KZ", name: null },
    });
    expect(await detectCityFromAddress("Алматы, ул. Достык, 89")).toEqual({ ok: false, reason: "foreign_country" });
  });

  it("RU — как раньше", async () => {
    findUnique.mockResolvedValue(moskvaRow);
    geocodeWithLocality.mockResolvedValue({
      geoLat: 55.75,
      geoLng: 37.62,
      locality: "Москва",
      regions: [],
      country: { code: "RU", name: "Россия" },
    });
    const result = await detectCityFromAddress("Москва, Тверская 1");
    expect(result).toMatchObject({ ok: true, cityId: "city-moskva" });
  });

  it("кода нет — по названию страны: «Россия» пускает, другое — отказ", async () => {
    findUnique.mockResolvedValue(moskvaRow);
    geocodeWithLocality.mockResolvedValue({
      geoLat: 55.75,
      geoLng: 37.62,
      locality: "Москва",
      regions: [],
      country: { code: null, name: "Россия" },
    });
    expect(await detectCityFromAddress("Москва")).toMatchObject({ ok: true });

    geocodeWithLocality.mockResolvedValue({
      geoLat: 53.9,
      geoLng: 27.56,
      locality: "Минск",
      regions: [],
      country: { code: null, name: "Беларусь" },
    });
    expect(await detectCityFromAddress("Минск")).toEqual({ ok: false, reason: "foreign_country" });
  });

  it("страны в ответе нет (пустые компоненты) — пускаем и пишем в лог, а не foreign_country (решение 27.2)", async () => {
    findUnique.mockResolvedValue(moskvaRow);
    geocodeWithLocality.mockResolvedValue({
      geoLat: 55.75,
      geoLng: 37.62,
      locality: "Москва",
      regions: [],
      country: { code: null, name: null },
    });
    expect(await detectCityFromAddress("Москва")).toMatchObject({ ok: true });
    expect(logInfo).toHaveBeenCalledWith("city.country_unknown", { locality: "Москва" });
  });

  it("в лог автосоздания адрес не пишется (ПДн)", async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ ...krasnodarRow, id: "city-samara", slug: "samara", name: "Самара" });
    geocodeWithLocality.mockResolvedValue({
      geoLat: 53.2,
      geoLng: 50.15,
      locality: "Самара",
      regions: ["Самарская область"],
      country: { code: "RU", name: "Россия" },
    });
    await detectCityFromAddress("Самара, ул. Ленинградская, 24, кв. 5");
    const logged = JSON.stringify(vi.mocked(logInfo).mock.calls);
    expect(logged).toContain("city.auto_created");
    expect(logged).not.toContain("Ленинградская");
  });
});

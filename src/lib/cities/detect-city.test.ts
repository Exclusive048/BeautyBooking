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

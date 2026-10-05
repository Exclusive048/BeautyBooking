import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — явный город `?city=<slug>`: главнее куки `mr-city-slug`,
 * неизвестный/погашенный — 400 `CITY_NOT_FOUND` (кука в том же случае молча
 * даёт «все города», как и раньше).
 *
 * @probe 2026-10-03 — `resolveRequestCity` переставлен «кука, потом
 *        параметр»: красные «параметр главнее куки» и «явный неизвестный —
 *        отказ, даже если кука годная». Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  cities: new Map<string, { isActive: boolean }>(),
}));
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "mr-city-slug" && state.cookie ? { value: state.cookie } : undefined),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    city: {
      findUnique: (args: { where: { slug: string } }) => {
        findUnique(args);
        const row = state.cities.get(args.where.slug);
        return Promise.resolve(
          row
            ? {
                id: `id-${args.where.slug}`,
                slug: args.where.slug,
                name: args.where.slug,
                nameGenitive: null,
                latitude: 0,
                longitude: 0,
                timezone: "Europe/Moscow",
                isActive: row.isActive,
              }
            : null,
        );
      },
    },
  },
}));

import { cityQueryParamSchema } from "@/lib/cities/city-param";
import { getServerCity, resolveCityParam, resolveRequestCity } from "@/lib/cities/server-city";

beforeEach(() => {
  state.cookie = undefined;
  state.cities = new Map([
    ["kazan", { isActive: true }],
    ["moskva", { isActive: true }],
    ["closed", { isActive: false }],
  ]);
  findUnique.mockClear();
});

describe("cityQueryParamSchema", () => {
  it("обрезает пробелы; пустое — как отсутствующее", () => {
    expect(cityQueryParamSchema.parse(" kazan ")).toBe("kazan");
    expect(cityQueryParamSchema.parse("")).toBeUndefined();
    expect(cityQueryParamSchema.parse("   ")).toBeUndefined();
    expect(cityQueryParamSchema.parse(undefined)).toBeUndefined();
  });

  it("длиннее 64 — ошибка валидации", () => {
    expect(cityQueryParamSchema.safeParse("x".repeat(65)).success).toBe(false);
  });
});

describe("resolveCityParam — явный город", () => {
  it("без параметра — null, в БД не ходит", async () => {
    expect(await resolveCityParam(undefined)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("активный slug — город", async () => {
    expect((await resolveCityParam("kazan"))?.id).toBe("id-kazan");
  });

  it.each(["nowhere", "closed"])("неизвестный/погашенный (%s) — 400 CITY_NOT_FOUND", async (slug) => {
    await expect(resolveCityParam(slug)).rejects.toMatchObject({ status: 400, code: "CITY_NOT_FOUND" });
  });
});

describe("resolveRequestCity — параметр главнее куки", () => {
  it("параметр главнее куки", async () => {
    state.cookie = "moskva";
    expect((await resolveRequestCity("kazan"))?.slug).toBe("kazan");
  });

  it("без параметра — кука, как на вебе", async () => {
    state.cookie = "moskva";
    expect((await resolveRequestCity(undefined))?.slug).toBe("moskva");
  });

  it("битая кука по-прежнему молча = все города", async () => {
    state.cookie = "closed";
    expect(await resolveRequestCity(undefined)).toBeNull();
    expect(await getServerCity()).toBeNull();
  });

  it("явный неизвестный — отказ, даже если кука годная", async () => {
    state.cookie = "moskva";
    await expect(resolveRequestCity("nowhere")).rejects.toMatchObject({ code: "CITY_NOT_FOUND" });
  });
});

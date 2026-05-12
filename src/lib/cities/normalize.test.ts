import { describe, it, expect } from "vitest";
import { citySlugFromName, normalizeCityName } from "@/lib/cities/normalize";

describe("normalizeCityName", () => {
  it("removes 'г.' prefix", () => {
    expect(normalizeCityName("г. Москва")).toBe("Москва");
  });

  it("removes 'г' prefix without dot", () => {
    expect(normalizeCityName("г Москва")).toBe("Москва");
  });

  it("removes country suffix", () => {
    expect(normalizeCityName("Москва, Россия")).toBe("Москва");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCityName("  Воронеж  ")).toBe("Воронеж");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeCityName("Нижний  Новгород")).toBe("Нижний Новгород");
  });

  it("handles compound transformation (prefix + suffix + whitespace)", () => {
    expect(normalizeCityName("  г. Санкт-Петербург, Россия  ")).toBe("Санкт-Петербург");
  });

  it("returns identity for already-clean names", () => {
    expect(normalizeCityName("Краснодар")).toBe("Краснодар");
  });
});

describe("citySlugFromName", () => {
  it("transliterates Russian to Latin slug", () => {
    expect(citySlugFromName("Москва")).toBe("moskva");
  });

  it("handles 'ж' digraph", () => {
    expect(citySlugFromName("Воронеж")).toBe("voronezh");
  });

  it("preserves hyphens between transliterated parts", () => {
    expect(citySlugFromName("Санкт-Петербург")).toBe("sankt-peterburg");
  });

  it("converts spaces to hyphens", () => {
    expect(citySlugFromName("Нижний Новгород")).toBe("nizhniy-novgorod");
  });

  it("collapses repeated hyphens", () => {
    expect(citySlugFromName("Ростов--на--Дону")).toBe("rostov-na-donu");
  });

  it("trims leading and trailing hyphens", () => {
    expect(citySlugFromName(" Тула ")).toBe("tula");
  });

  it("strips characters that don't transliterate (мягкий знак, твёрдый знак)", () => {
    expect(citySlugFromName("Тверь")).toBe("tver");
    expect(citySlugFromName("Подъезд")).toBe("podezd");
  });

  it("yields different slugs for different names (sanity)", () => {
    expect(citySlugFromName("Москва")).not.toBe(citySlugFromName("Краснодар"));
  });
});

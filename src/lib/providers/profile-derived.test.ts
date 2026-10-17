import { describe, expect, it } from "vitest";
import { profileCategories, profileMinPrice } from "@/lib/providers/mappers";
import type { ProviderServiceDto } from "@/lib/providers/dto";

function service(partial: Partial<ProviderServiceDto>): ProviderServiceDto {
  return {
    id: partial.id ?? "s",
    name: partial.name ?? "Услуга",
    durationMin: partial.durationMin ?? 60,
    price: partial.price ?? 0,
    categoryName: partial.categoryName ?? null,
    categoryOrder: partial.categoryOrder ?? null,
  };
}

// PROFILE-CATEGORIES-FROM-SERVICES: страница студии с услугами в категориях
// показывала «Без категорий» и «от 0 ₽» — читались колонки, которые никто не пишет.
describe("profileCategories", () => {
  it("берёт категории услуг в порядке каталога, без повторов", () => {
    const services = [
      service({ categoryName: "Макияж", categoryOrder: 3 }),
      service({ categoryName: "Маникюр", categoryOrder: 1 }),
      service({ categoryName: "Макияж", categoryOrder: 3 }),
      service({ categoryName: null }),
    ];
    expect(profileCategories(services)).toEqual(["Маникюр", "Макияж"]);
  });

  it("без категорий у услуг — пусто, а не слаги из колонки `Provider.categories`", () => {
    expect(profileCategories([service({})])).toEqual([]);
    expect(profileCategories([])).toEqual([]);
  });
});

describe("profileMinPrice", () => {
  it("самая низкая ненулевая цена услуг", () => {
    expect(profileMinPrice([service({ price: 250000 }), service({ price: 0 }), service({ price: 150000 })])).toBe(
      150000,
    );
  });

  it("без цен у услуг — ноль (строка «от» не показывается)", () => {
    expect(profileMinPrice([service({ price: 0 })])).toBe(0);
    expect(profileMinPrice([])).toBe(0);
  });
});

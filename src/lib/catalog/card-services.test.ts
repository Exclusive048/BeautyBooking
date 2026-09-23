import { describe, expect, it, vi } from "vitest";

/**
 * CATALOG-CARD-STUDIO-MASTER-SERVICES — карточка мастера студии в каталоге
 * показывает то же, что его страница (`providers/usecases.ts`): свои услуги,
 * если они есть, иначе студийные с персональными переопределениями.
 *
 * @probe 2026-09-23 — в `resolveCardServices` возвращено прежнее слияние
 * (`[...own, ...links]` без переопределений): красные «свои услуги есть —
 * студийные не подмешиваются» и «без своих — цена и длительность из
 * переопределения». Возвращено — зелёный.
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveCardServices } from "@/lib/catalog/catalog.service";

const own = {
  id: "own-1",
  name: "Маникюр",
  title: null,
  price: 150_000,
  durationMin: 60,
  category: null,
};
const OPEN_STUDIO = { isPublished: true };
const studioService = {
  id: "studio-1",
  name: "Педикюр",
  title: null,
  price: 250_000,
  durationMin: 90,
  category: { title: "Ногти" },
};

describe("resolveCardServices", () => {
  it("свои услуги есть — студийные не подмешиваются", () => {
    const services = resolveCardServices({
      studioPaused: false,
      studio: OPEN_STUDIO,
      services: [own],
      masterServices: [{ priceOverride: null, durationOverrideMin: null, service: studioService }],
    });
    expect(services.map((s) => s.id)).toEqual(["own-1"]);
  });

  it("без своих — студийные, цена и длительность из переопределения", () => {
    const [service] = resolveCardServices({
      studioPaused: false,
      studio: OPEN_STUDIO,
      services: [],
      masterServices: [{ priceOverride: 200_000, durationOverrideMin: 75, service: studioService }],
    });
    expect(service).toMatchObject({ id: "studio-1", price: 200_000, durationMin: 75, categoryTitle: "Ногти" });
  });

  it("без переопределения — студийная цена", () => {
    const [service] = resolveCardServices({
      studioPaused: false,
      studio: OPEN_STUDIO,
      services: [],
      masterServices: [{ priceOverride: null, durationOverrideMin: null, service: studioService }],
    });
    expect(service).toMatchObject({ price: 250_000, durationMin: 90 });
  });

  it("мастер на паузе в студии — студийные услуги не продаются (STUDIO-PAUSE-SPLIT-01)", () => {
    const services = resolveCardServices({
      studioPaused: true,
      studio: OPEN_STUDIO,
      services: [],
      masterServices: [{ priceOverride: null, durationOverrideMin: null, service: studioService }],
    });
    expect(services).toEqual([]);
  });

  // STUDIO-HIDDEN-MASTER-SERVICES · @probe 2026-09-23 — из `sellsStudioServices`
  // убрано условие `studioAcceptsBookings`: красный этот кейс. Возвращено — зелёный.
  it("скрытая студия записей не принимает — её услуги через мастера не продаются", () => {
    const services = resolveCardServices({
      studioPaused: false,
      studio: { isPublished: false },
      services: [],
      masterServices: [{ priceOverride: null, durationOverrideMin: null, service: studioService }],
    });
    expect(services).toEqual([]);
  });
});

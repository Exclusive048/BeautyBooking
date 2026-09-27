import { describe, expect, it, vi } from "vitest";

/**
 * Карточка мастера в каталоге показывает то же, что его страница
 * (`providers/usecases.ts`): только СВОИ услуги профиля.
 *
 * STUDIO-MASTER-PROFILES (этап 2, решение владельца 2026-09-27): услуги
 * профилей не смешиваются. Прежнее правило CATALOG-CARD-STUDIO-MASTER-SERVICES
 * («мастер студии без своих услуг продаёт студийные») удалено: запись на
 * студийную услугу с личной страницы становилась ЛИЧНОЙ записью мастера.
 * Теперь входной тип карточки студийных связей не принимает вовсе — вернуть их
 * на карточку можно только правкой типа, а не незаметно.
 *
 * @probe 2026-09-27 — в `resolveCardServices` возвращено прежнее тело
 * (`provider.services` пусты → студийные связи с переопределениями) вместе с
 * полем `masterServices` во входном типе: краснеет «своих услуг нет — карточка
 * пуста» (карточка получает студийную «Педикюр»). Возвращено — зелёный.
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

describe("resolveCardServices", () => {
  it("свои услуги профиля — на карточке", () => {
    const services = resolveCardServices({ services: [own] });
    expect(services.map((s) => s.id)).toEqual(["own-1"]);
  });

  it("своих услуг нет — карточка пуста, студийные не подставляются", () => {
    const studioLinked = {
      services: [],
      masterServices: [
        {
          priceOverride: 200_000,
          durationOverrideMin: 75,
          service: { id: "studio-1", name: "Педикюр", title: null, price: 250_000, durationMin: 90, category: null },
        },
      ],
    };
    expect(resolveCardServices(studioLinked)).toEqual([]);
  });
});

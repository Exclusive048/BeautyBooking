import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import {
  PROVIDER_RELATION_DISPOSITION,
  findStaleProviderDispositionKeys,
  findUnclassifiedProviderRelations,
} from "@/lib/deletion/provider-data-disposition";

/**
 * DELETION-02 — близнец guard'а инв. #35, но для `Provider`.
 *
 * Ключевой факт, который делает этот guard нужным: удаление кабинета
 * АНОНИМИЗИРУЕТ строку `Provider`, а не удаляет её, поэтому объявленные
 * `onDelete: Cascade` не срабатывают НИКОГДА. Связь, о которой забыли,
 * молча остаётся висеть на мёртвом провайдере.
 */

function providerRelationFields(): string[] {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "Provider");
  if (!model) throw new Error("Provider model missing from the Prisma DMMF");
  return model.fields.filter((f) => f.kind === "object").map((f) => f.name);
}

describe("provider deletion disposition map", () => {
  it("классифицирует КАЖДУЮ связь Provider (анти-decay guard)", () => {
    const unclassified = findUnclassifiedProviderRelations(providerRelationFields());
    expect(
      unclassified,
      `Неклассифицированные связи Provider: ${unclassified.join(", ")}.\n` +
        "Добавьте диспозицию в src/lib/deletion/provider-data-disposition.ts. " +
        "Помните: строка Provider переживает удаление кабинета, поэтому onDelete: Cascade " +
        "НЕ сработает — если связь должна исчезнуть, её надо удалить явно.",
    ).toEqual([]);
  });

  it("кусается, когда связь не классифицирована (guard не вакуумен)", () => {
    const withNew = [...providerRelationFields(), "somethingBrandNew"];
    expect(findUnclassifiedProviderRelations(withNew)).toEqual(["somethingBrandNew"]);
  });

  it("ловит протухший ключ после переименования связи", () => {
    const fewer = providerRelationFields().filter((n) => n !== "hotSlots");
    expect(findStaleProviderDispositionKeys(fewer)).toContain("hotSlots");
  });

  it("у каждой записи есть непустое обоснование", () => {
    for (const [name, d] of Object.entries(PROVIDER_RELATION_DISPOSITION)) {
      expect(d.reason.length, `${name}: пустой reason`).toBeGreaterThan(20);
    }
  });

  it("пинит класс dangling-строк: клиентские указатели удаляются, история — нет", () => {
    // Именно эти две связи RKN-FIX-03-A нашёл висящими.
    expect(PROVIDER_RELATION_DISPOSITION.hotSlotSubscriptions.kind).toBe("DELETED");
    expect(PROVIDER_RELATION_DISPOSITION.favoritedBy.kind).toBe("DELETED");
    // А история обязана пережить — ради неё Provider и не удаляется.
    expect(PROVIDER_RELATION_DISPOSITION.bookings.kind).toBe("RETAINED");
    expect(PROVIDER_RELATION_DISPOSITION.reviewsAbout.kind).toBe("RETAINED");
  });
});

import { describe, expect, it } from "vitest";
import { groupServicesByCategory } from "@/lib/providers/group-services";
import type { ProviderServiceDto } from "@/lib/providers/dto";

function svc(
  id: string,
  categoryName: string | null,
  categoryOrder: number | null,
): ProviderServiceDto {
  return { id, name: `service-${id}`, durationMin: 60, price: 1000, categoryName, categoryOrder };
}

describe("groupServicesByCategory", () => {
  it("returns empty for empty input", () => {
    expect(groupServicesByCategory([])).toEqual([]);
  });

  it("orders groups by categoryOrder asc", () => {
    const groups = groupServicesByCategory([
      svc("a", "Стрижки", 2),
      svc("b", "Маникюр", 1),
      svc("c", "Брови", 3),
    ]);
    expect(groups.map((g) => g.categoryName)).toEqual(["Маникюр", "Стрижки", "Брови"]);
  });

  it("breaks order ties by ru-locale label", () => {
    const groups = groupServicesByCategory([
      svc("a", "Яркость", 0),
      svc("b", "Абонемент", 0),
    ]);
    expect(groups.map((g) => g.categoryName)).toEqual(["Абонемент", "Яркость"]);
  });

  it("always sinks the uncategorized bucket to the bottom", () => {
    const groups = groupServicesByCategory([
      svc("a", null, null),
      svc("b", "Маникюр", 5),
      svc("c", null, null),
    ]);
    expect(groups.map((g) => g.categoryName)).toEqual(["Маникюр", null]);
    expect(groups.at(-1)?.services.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("groups multiple services under the same category", () => {
    const groups = groupServicesByCategory([
      svc("a", "Маникюр", 1),
      svc("b", "Маникюр", 1),
      svc("c", "Стрижки", 2),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.services.map((s) => s.id)).toEqual(["a", "b"]);
    expect(groups[1]?.services.map((s) => s.id)).toEqual(["c"]);
  });

  it("keeps a single-service category as its own group", () => {
    const groups = groupServicesByCategory([svc("a", "Массаж", 1)]);
    expect(groups).toEqual([{ categoryName: "Массаж", services: [svc("a", "Массаж", 1)] }]);
  });

  it("preserves input order within a group", () => {
    const groups = groupServicesByCategory([
      svc("z", "Маникюр", 1),
      svc("a", "Маникюр", 1),
      svc("m", "Маникюр", 1),
    ]);
    expect(groups[0]?.services.map((s) => s.id)).toEqual(["z", "a", "m"]);
  });

  it("emits only categories present (search-filtered list yields matching groups only)", () => {
    // Simulates a post-search subset: only Маникюр services survived the filter.
    const groups = groupServicesByCategory([svc("a", "Маникюр", 1)]);
    expect(groups.map((g) => g.categoryName)).toEqual(["Маникюр"]);
  });
});

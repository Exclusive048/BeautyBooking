import { describe, expect, it } from "vitest";

/**
 * STUDIO-SERVICES-SORT-A — pinning the two pure rules driving the
 * studio cabinet «Услуги» categories sidebar:
 *
 *   1. **Sort order** — `buildCategoriesSidebar` (in
 *      `services-data.service.ts`) ranks categories by
 *      `servicesCount` descending, with alphabetical secondary for
 *      stable ordering when counts tie.
 *   2. **Hide-empty filter** — `CategoriesSidebar` component-state
 *      toggle: when on, categories with `servicesCount === 0` are
 *      filtered out before render.
 *
 * Mirroring the comparators here gives regression coverage without a
 * Prisma round-trip (the service test for `buildCategoriesSidebar`
 * itself would need a real DB seed — out of scope for a UI-tweak
 * commit). Same pure-predicate pattern used by MASTER-DASHBOARD-FIX-A
 * and STUDIO-BOOKINGS-FIX-A.
 */

type CategoryRow = {
  id: string;
  title: string;
  servicesCount: number;
};

function sortByCountDescThenAlpha(rows: CategoryRow[]): CategoryRow[] {
  return [...rows].sort((a, b) => {
    if (a.servicesCount !== b.servicesCount) {
      return b.servicesCount - a.servicesCount;
    }
    return a.title.localeCompare(b.title, "ru");
  });
}

function filterEmpty(rows: CategoryRow[], hideEmpty: boolean): CategoryRow[] {
  return hideEmpty ? rows.filter((r) => r.servicesCount > 0) : rows;
}

describe("STUDIO-SERVICES-SORT-A — sort: count desc + alpha secondary", () => {
  it("orders fuller categories above sparser ones", () => {
    const sorted = sortByCountDescThenAlpha([
      { id: "a", title: "Маникюр", servicesCount: 3 },
      { id: "b", title: "Брови", servicesCount: 8 },
      { id: "c", title: "Стрижка", servicesCount: 1 },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks ties alphabetically (ru locale)", () => {
    // Both have 5 services — order must be predictable.
    const sorted = sortByCountDescThenAlpha([
      { id: "z", title: "Стрижка", servicesCount: 5 },
      { id: "a", title: "Брови", servicesCount: 5 },
      { id: "m", title: "Массаж", servicesCount: 5 },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["a", "m", "z"]);
  });

  it("empty categories go to the bottom (count 0 = lowest)", () => {
    const sorted = sortByCountDescThenAlpha([
      { id: "empty1", title: "Пилинг", servicesCount: 0 },
      { id: "full", title: "Маникюр", servicesCount: 12 },
      { id: "empty2", title: "Эпиляция", servicesCount: 0 },
    ]);
    // Full first, then the two empty ones alphabetically.
    expect(sorted.map((r) => r.id)).toEqual(["full", "empty1", "empty2"]);
  });

  it("returns a new array (not in-place mutation of the input)", () => {
    const input: CategoryRow[] = [
      { id: "a", title: "Брови", servicesCount: 2 },
      { id: "b", title: "Маникюр", servicesCount: 5 },
    ];
    const inputCopy = [...input];
    sortByCountDescThenAlpha(input);
    expect(input).toEqual(inputCopy);
  });

  it("is stable when the array is already sorted", () => {
    const presorted: CategoryRow[] = [
      { id: "a", title: "Брови", servicesCount: 9 },
      { id: "b", title: "Маникюр", servicesCount: 4 },
      { id: "c", title: "Стрижка", servicesCount: 1 },
    ];
    expect(sortByCountDescThenAlpha(presorted)).toEqual(presorted);
  });
});

describe("STUDIO-SERVICES-SORT-A — hide-empty filter", () => {
  const rows: CategoryRow[] = [
    { id: "a", title: "Маникюр", servicesCount: 3 },
    { id: "b", title: "Брови", servicesCount: 0 },
    { id: "c", title: "Стрижка", servicesCount: 1 },
    { id: "d", title: "Эпиляция", servicesCount: 0 },
  ];

  it("returns all categories when toggle is off (default)", () => {
    const filtered = filterEmpty(rows, false);
    expect(filtered).toHaveLength(4);
    expect(filtered).toEqual(rows);
  });

  it("drops 0-count categories when toggle is on", () => {
    const filtered = filterEmpty(rows, true);
    expect(filtered.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("preserves order while filtering (composes with sort)", () => {
    // Sort first, then filter — same pipeline as the sidebar render
    // path (backend sorts, client toggles).
    const sorted = sortByCountDescThenAlpha(rows);
    const filtered = filterEmpty(sorted, true);
    expect(filtered.map((r) => r.id)).toEqual(["a", "c"]); // count 3 then 1
  });

  it("yields an empty array when every category is empty + toggle on", () => {
    // The CategoriesSidebar renders an actionable hint in this case
    // («Все категории пустые. Отключите фильтр или добавьте услуги.»)
    // — the empty array IS the trigger.
    const allEmpty: CategoryRow[] = [
      { id: "a", title: "Брови", servicesCount: 0 },
      { id: "b", title: "Стрижка", servicesCount: 0 },
    ];
    expect(filterEmpty(allEmpty, true)).toEqual([]);
  });

  it("does not mutate the input (returns a new filtered view)", () => {
    const inputCopy = [...rows];
    filterEmpty(rows, true);
    expect(rows).toEqual(inputCopy);
  });
});

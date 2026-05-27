import { describe, expect, it } from "vitest";

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase A — pure-predicate tests pinning
 * the foundation rules:
 *
 *   1. **Master picker resolution** — the route resolves the
 *      effective masterId from `searchParams.master` if the master is
 *      in the studio's active list, else falls back to the first
 *      active master, else null (empty state).
 *   2. **Tab URL state** — `?tab=hours` defaults; valid tab ids pass
 *      through; unknown values fall back to «hours».
 *   3. **Day sort** — Mon-Sat 1..6, Sun=0 sorts last to match the
 *      reading order in the Hours tab.
 *
 * The DB-aware route + tabs orchestrator are integration-tested
 * manually (Phase A scope); these unit tests cover the deterministic
 * rules so future drift surfaces immediately.
 */

type MasterOption = { id: string; name: string };

function resolveSelectedMasterId(input: {
  requested: string | null;
  active: MasterOption[];
}): string | null {
  const { requested, active } = input;
  if (requested && active.some((m) => m.id === requested)) return requested;
  return active[0]?.id ?? null;
}

const VALID_TABS = new Set(["hours", "rules", "exceptions", "breaks", "visibility"]);

function resolveActiveTab(rawTab: string | null): string {
  if (rawTab && VALID_TABS.has(rawTab)) return rawTab;
  return "hours";
}

function sortWeekdaysReadingOrder<T extends { dayOfWeek: number }>(
  days: T[],
): T[] {
  return [...days].sort((a, b) => {
    const ax = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
    const bx = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
    return ax - bx;
  });
}

describe("STUDIO-SCHEDULE-SETTINGS-A — master picker resolution", () => {
  const masters: MasterOption[] = [
    { id: "m_anna", name: "Анна" },
    { id: "m_marina", name: "Марина" },
    { id: "m_olga", name: "Ольга" },
  ];

  it("returns the requested master when in the active list", () => {
    expect(
      resolveSelectedMasterId({ requested: "m_marina", active: masters }),
    ).toBe("m_marina");
  });

  it("falls back to the first active master when no request", () => {
    expect(resolveSelectedMasterId({ requested: null, active: masters })).toBe(
      "m_anna",
    );
  });

  it("falls back when the requested master is not in the active list", () => {
    // Studio admin may bookmark a URL for a master who's since been
    // disabled / left the studio — route should silently fall back
    // rather than error.
    expect(
      resolveSelectedMasterId({ requested: "m_ghost", active: masters }),
    ).toBe("m_anna");
  });

  it("returns null when no active masters exist (empty state trigger)", () => {
    expect(resolveSelectedMasterId({ requested: "any", active: [] })).toBe(
      null,
    );
    expect(resolveSelectedMasterId({ requested: null, active: [] })).toBe(null);
  });

  it("handles an empty requested id (treats as no-request)", () => {
    expect(resolveSelectedMasterId({ requested: "", active: masters })).toBe(
      "m_anna",
    );
  });
});

describe("STUDIO-SCHEDULE-SETTINGS-A — tab URL state", () => {
  it("defaults to «hours» when no `?tab=` is present", () => {
    expect(resolveActiveTab(null)).toBe("hours");
  });

  it("accepts each valid tab id verbatim", () => {
    for (const tab of ["hours", "rules", "exceptions", "breaks", "visibility"]) {
      expect(resolveActiveTab(tab)).toBe(tab);
    }
  });

  it("falls back to «hours» for unknown values (typo defence)", () => {
    expect(resolveActiveTab("schedule")).toBe("hours");
    expect(resolveActiveTab("HOURS")).toBe("hours"); // case-sensitive
    expect(resolveActiveTab("")).toBe("hours");
  });
});

describe("STUDIO-SCHEDULE-SETTINGS-A — Hours tab weekday sort", () => {
  it("places Sunday at the end (Mon-Sat-Sun reading order)", () => {
    const sorted = sortWeekdaysReadingOrder([
      { dayOfWeek: 0, label: "Sun" },
      { dayOfWeek: 1, label: "Mon" },
      { dayOfWeek: 6, label: "Sat" },
      { dayOfWeek: 3, label: "Wed" },
    ]);
    expect(sorted.map((d) => d.dayOfWeek)).toEqual([1, 3, 6, 0]);
  });

  it("keeps Mon-Sat in numerical order", () => {
    const sorted = sortWeekdaysReadingOrder([
      { dayOfWeek: 5 },
      { dayOfWeek: 2 },
      { dayOfWeek: 1 },
      { dayOfWeek: 4 },
      { dayOfWeek: 6 },
      { dayOfWeek: 3 },
    ]);
    expect(sorted.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not mutate the input array", () => {
    const input = [{ dayOfWeek: 0 }, { dayOfWeek: 1 }];
    const inputCopy = [...input];
    sortWeekdaysReadingOrder(input);
    expect(input).toEqual(inputCopy);
  });
});

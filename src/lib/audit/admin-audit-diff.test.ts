import { describe, expect, it } from "vitest";
import { buildAdminAuditDiff, hasAnyDiff } from "./admin-audit-diff";

describe("buildAdminAuditDiff", () => {
  it("returns empty diff when nothing changed", () => {
    const before = { name: "Foo", price: 100 };
    const after = { name: "Foo", price: 100 };
    expect(buildAdminAuditDiff(before, after)).toEqual({});
  });

  it("records changed string field", () => {
    const before = { name: "Foo" };
    const after = { name: "Bar" };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      name: { before: "Foo", after: "Bar" },
    });
  });

  it("records changed numeric field", () => {
    const before = { price: 100 };
    const after = { price: 200 };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      price: { before: 100, after: 200 },
    });
  });

  it("records changed boolean field", () => {
    const before = { active: true };
    const after = { active: false };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      active: { before: true, after: false },
    });
  });

  it("treats null ↔ value as a change", () => {
    const before = { name: null as string | null };
    const after = { name: "Foo" };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      name: { before: null, after: "Foo" },
    });
  });

  it("ignores keys not present in `after`", () => {
    const before = { name: "Foo", price: 100 };
    const after = { price: 200 };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      price: { before: 100, after: 200 },
    });
  });

  it("records multiple changes", () => {
    const before = { name: "Foo", price: 100, active: true };
    const after = { name: "Bar", price: 200, active: false };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      name: { before: "Foo", after: "Bar" },
      price: { before: 100, after: 200 },
      active: { before: true, after: false },
    });
  });

  it("compares nested objects via JSON stringify", () => {
    const before = { prices: { m1: 100, m3: 250 } };
    const after = { prices: { m1: 100, m3: 250 } };
    expect(buildAdminAuditDiff(before, after)).toEqual({});

    const after2 = { prices: { m1: 100, m3: 300 } };
    expect(buildAdminAuditDiff(before, after2)).toEqual({
      prices: { before: { m1: 100, m3: 250 }, after: { m1: 100, m3: 300 } },
    });
  });

  it("compares arrays via JSON stringify", () => {
    const before = { ids: [1, 2, 3] };
    expect(buildAdminAuditDiff(before, { ids: [1, 2, 3] })).toEqual({});
    expect(buildAdminAuditDiff(before, { ids: [3, 2, 1] })).toEqual({
      ids: { before: [1, 2, 3], after: [3, 2, 1] },
    });
  });

  it("treats undefined ↔ value as a change", () => {
    const before = { name: undefined as string | undefined };
    const after = { name: "Foo" as string | undefined };
    expect(buildAdminAuditDiff(before, after)).toEqual({
      name: { before: undefined, after: "Foo" },
    });
  });
});

describe("hasAnyDiff", () => {
  it("returns true when diff has at least one entry", () => {
    expect(hasAnyDiff({ name: { before: "a", after: "b" } })).toBe(true);
  });

  it("returns false for empty diff", () => {
    expect(hasAnyDiff({})).toBe(false);
  });
});

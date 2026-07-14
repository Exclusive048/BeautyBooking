import { describe, it, expect } from "vitest";
// PRISMA-INCLUDE-WHERE-CI-CHECK — unit tests for the gate's detection logic.
// The .mjs exports pure functions so we can test them without spawning the CLI.
import {
  detectUnboundedListIncludes,
  loadListRelationFields,
} from "./check-include-where.mjs";

const GROWTH = new Set(["bookings", "messages", "services"]);

function relations(source: string): string[] {
  return detectUnboundedListIncludes(source, "fixture.ts", GROWTH).map((f) => f.relation);
}

describe("detectUnboundedListIncludes — flags unbounded growth-capable list includes", () => {
  it("flags a growth relation included with NO where/take", () => {
    const src = `prisma.provider.findMany({ include: { bookings: { select: { id: true } } } });`;
    expect(relations(src)).toEqual(["bookings"]);
  });

  it("flags `relation: true` (whole list, unbounded)", () => {
    const src = `prisma.provider.findMany({ include: { bookings: true } });`;
    expect(relations(src)).toEqual(["bookings"]);
  });

  it("passes when bounded by `where`", () => {
    const src = `prisma.provider.findMany({ include: { bookings: { where: { status: "CONFIRMED" } } } });`;
    expect(relations(src)).toEqual([]);
  });

  it("passes when bounded by `take`", () => {
    const src = `prisma.provider.findMany({ include: { bookings: { take: 5, orderBy: { createdAt: "desc" } } } });`;
    expect(relations(src)).toEqual([]);
  });

  it("does NOT count a `where` on the PARENT query as bounding the nested list", () => {
    const src = `prisma.provider.findMany({ where: { isPublished: true }, include: { bookings: { select: { id: true } } } });`;
    expect(relations(src)).toEqual(["bookings"]);
  });

  it("skips `relation: false` (not fetched)", () => {
    const src = `prisma.provider.findMany({ include: { bookings: false } });`;
    expect(relations(src)).toEqual([]);
  });

  it("skips a guarded conditional (`cond ? { where } : false`)", () => {
    const src = `prisma.provider.findMany({ include: { bookings: userId ? { where: { userId } } : false } });`;
    expect(relations(src)).toEqual([]);
  });

  it("does not flag 1:1 / non-growth relations (not in the growth set)", () => {
    const src = `prisma.booking.findMany({ include: { provider: { select: { name: true } }, service: true } });`;
    expect(relations(src)).toEqual([]);
  });

  it("works inside a `select:` block too", () => {
    const src = `prisma.provider.findMany({ select: { id: true, messages: { select: { body: true } } } });`;
    expect(relations(src)).toEqual(["messages"]);
  });

  it("detects nested list includes at any depth", () => {
    const src = `prisma.a.findMany({ include: { service: { include: { bookings: { select: { id: true } } } } } });`;
    expect(relations(src)).toEqual(["bookings"]);
  });

  it("respects `// include-ok:` opt-out on the line above", () => {
    const src = [
      "prisma.provider.findMany({ include: {",
      "  // include-ok: deliberate full fetch",
      "  bookings: { select: { id: true } },",
      "} });",
    ].join("\n");
    expect(relations(src)).toEqual([]);
  });

  it("respects `// include-ok:` opt-out on the same line", () => {
    const src = `prisma.provider.findMany({ include: { bookings: { select: { id: true } } } }); // include-ok: full`;
    expect(relations(src)).toEqual([]);
  });

  it("flags multiple unbounded relations in one selection", () => {
    const src = `prisma.provider.findMany({ include: { bookings: { select: { id: true } }, services: true } });`;
    expect(relations(src).sort()).toEqual(["bookings", "services"]);
  });
});

describe("loadListRelationFields — schema-derived list relations (excludes scalar/enum arrays)", () => {
  const listFields = loadListRelationFields();

  it("includes growth-capable model[] relations", () => {
    for (const rel of ["bookings", "services", "messages", "reviews", "payments", "masters"]) {
      expect(listFields.has(rel)).toBe(true);
    }
  });

  it("excludes scalar / enum array fields (roles/categories/serviceIds)", () => {
    // `roles AccountType[]`, `categories String[]`, `serviceIds String[]` are
    // scalar/enum arrays, not relations — a `select: { roles: true }` must never flag.
    for (const scalar of ["roles", "categories", "serviceIds"]) {
      expect(listFields.has(scalar)).toBe(false);
    }
  });
});

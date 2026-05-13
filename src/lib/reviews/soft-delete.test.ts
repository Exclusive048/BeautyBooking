import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { ACTIVE_REVIEW_FILTER } from "./soft-delete";

describe("ACTIVE_REVIEW_FILTER", () => {
  it("filters out soft-deleted reviews with `deletedAt: null`", () => {
    expect(ACTIVE_REVIEW_FILTER).toEqual({ deletedAt: null });
  });

  it("type-checks as a partial Prisma.ReviewWhereInput", () => {
    // Compile-time assertion masquerading as a runtime test: if the
    // type signature drifts (e.g. someone renames `deletedAt` in the
    // schema), this file stops compiling and the spread sites below
    // start failing — much louder than a silent regression.
    const where: Prisma.ReviewWhereInput = {
      targetType: "provider",
      targetId: "abc",
      ...ACTIVE_REVIEW_FILTER,
    };
    expect(where.deletedAt).toBe(null);
  });

  it("composes with additional conditions via spread", () => {
    const composed: Prisma.ReviewWhereInput = {
      ...ACTIVE_REVIEW_FILTER,
      reportedAt: { not: null },
      rating: { lte: 2 },
    };
    expect(composed.deletedAt).toBe(null);
    expect(composed.reportedAt).toEqual({ not: null });
    expect(composed.rating).toEqual({ lte: 2 });
  });

  it("can be overridden by a downstream spread (admin internal queries)", () => {
    // Admin internal contexts that explicitly want deleted rows can
    // override by spreading after the constant. This is rare and
    // intentional (deletedLastWeek KPI is the canonical example).
    const includeDeleted: Prisma.ReviewWhereInput = {
      ...ACTIVE_REVIEW_FILTER,
      deletedAt: { gte: new Date("2026-01-01") },
    };
    expect(includeDeleted.deletedAt).toEqual({ gte: new Date("2026-01-01") });
  });
});

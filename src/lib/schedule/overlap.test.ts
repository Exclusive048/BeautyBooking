import { buildBookingOverlapWhere, bookingOverlapsRange } from "@/lib/schedule/overlap";
import { describe, it, expect } from "vitest";
describe("schedule/overlap", () => {
  it("builds overlap predicate with exclusive boundaries", () => {
    const from = new Date("2026-03-01T10:00:00Z");
    const to = new Date("2026-03-01T12:00:00Z");
    const where = buildBookingOverlapWhere(from, to);

    expect(where.startAtUtc.not).toBeNull();
    expect(where.startAtUtc.lt).toEqual(to);
    expect(where.endAtUtc.not).toBeNull();
    expect(where.endAtUtc.gt).toEqual(from);
  });
});

describe("bookingOverlapsRange (FIX-8 — in-memory twin of buildBookingOverlapWhere)", () => {
  const from = new Date("2026-07-07T10:00:00Z");
  const to = new Date("2026-07-07T12:00:00Z");
  const b = (startIso: string, endIso: string) => ({
    startAtUtc: new Date(startIso),
    endAtUtc: new Date(endIso),
  });

  it("booking fully inside the range overlaps", () => {
    expect(bookingOverlapsRange(b("2026-07-07T10:30:00Z", "2026-07-07T11:00:00Z"), from, to)).toBe(true);
  });

  it("starts BEFORE the range, ends inside (in-progress / cross-boundary) overlaps", () => {
    expect(bookingOverlapsRange(b("2026-07-07T09:30:00Z", "2026-07-07T10:30:00Z"), from, to)).toBe(true);
  });

  it("starts inside, ends AFTER the range overlaps", () => {
    expect(bookingOverlapsRange(b("2026-07-07T11:30:00Z", "2026-07-07T13:00:00Z"), from, to)).toBe(true);
  });

  it("spans the whole range (started before, ends after) overlaps", () => {
    expect(bookingOverlapsRange(b("2026-07-07T08:00:00Z", "2026-07-07T14:00:00Z"), from, to)).toBe(true);
  });

  it("entirely before the range does NOT overlap", () => {
    expect(bookingOverlapsRange(b("2026-07-07T08:00:00Z", "2026-07-07T09:00:00Z"), from, to)).toBe(false);
  });

  it("entirely after the range does NOT overlap", () => {
    expect(bookingOverlapsRange(b("2026-07-07T13:00:00Z", "2026-07-07T14:00:00Z"), from, to)).toBe(false);
  });

  it("half-open: ends exactly at range start → no overlap", () => {
    expect(bookingOverlapsRange(b("2026-07-07T09:00:00Z", "2026-07-07T10:00:00Z"), from, to)).toBe(false);
  });

  it("half-open: starts exactly at range end → no overlap", () => {
    expect(bookingOverlapsRange(b("2026-07-07T12:00:00Z", "2026-07-07T13:00:00Z"), from, to)).toBe(false);
  });
});

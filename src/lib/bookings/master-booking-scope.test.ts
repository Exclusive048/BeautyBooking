import { describe, expect, it } from "vitest";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";

/**
 * FIX-STUDIO-BLOCKERS-01 (F1) — the access boundary of the master cabinet's
 * booking reads, pinned in BOTH directions with two masters in one studio.
 *
 * Keying reality the predicate must encode:
 *   solo booking:            providerId = master,  masterProviderId = null|self
 *   studio booking (mine):   providerId = STUDIO,  masterProviderId = me
 *   studio booking (other):  providerId = STUDIO,  masterProviderId = other
 *   studio booking (unassigned): providerId = STUDIO, masterProviderId = null
 *
 * The old filter (`providerId = me` alone) made every studio booking
 * invisible to its performing master. The WIDENED filter must not overshoot:
 * another master's bookings and unassigned studio bookings stay invisible.
 */

const ME = "master-me";
const OTHER = "master-other";
const STUDIO = "studio-provider";

type BookingKey = { providerId: string; masterProviderId: string | null };

/** Evaluate the Prisma where-fragment the way the DB would, for our shape. */
function matches(where: ReturnType<typeof masterPerformedBookingWhere>, b: BookingKey): boolean {
  return (where.OR ?? []).some((clause) => {
    const c = clause as Partial<BookingKey>;
    if ("masterProviderId" in c && c.masterProviderId !== b.masterProviderId) return false;
    if ("providerId" in c && c.providerId !== b.providerId) return false;
    return true;
  });
}

describe("masterPerformedBookingWhere — F1 access boundary", () => {
  const where = masterPerformedBookingWhere(ME);

  it("keeps the exact analytics-pinned shape (no drift, no match-all clause)", () => {
    expect(where).toEqual({
      OR: [{ masterProviderId: ME }, { masterProviderId: null, providerId: ME }],
    });
    expect(where.OR?.some((clause) => Object.keys(clause).length === 0)).toBe(false);
  });

  it("solo booking (own provider, unassigned) → VISIBLE", () => {
    expect(matches(where, { providerId: ME, masterProviderId: null })).toBe(true);
  });

  it("solo booking with explicit self-assignment → VISIBLE", () => {
    expect(matches(where, { providerId: ME, masterProviderId: ME })).toBe(true);
  });

  it("own studio booking (providerId = studio, performed by me) → VISIBLE", () => {
    expect(matches(where, { providerId: STUDIO, masterProviderId: ME })).toBe(true);
  });

  it("🔴 another master's studio booking → NOT visible (the leak direction)", () => {
    expect(matches(where, { providerId: STUDIO, masterProviderId: OTHER })).toBe(false);
  });

  it("🔴 unassigned STUDIO booking → NOT visible (belongs to the studio journal)", () => {
    expect(matches(where, { providerId: STUDIO, masterProviderId: null })).toBe(false);
  });

  it("another master's solo booking → NOT visible", () => {
    expect(matches(where, { providerId: OTHER, masterProviderId: null })).toBe(false);
    expect(matches(where, { providerId: OTHER, masterProviderId: OTHER })).toBe(false);
  });
});

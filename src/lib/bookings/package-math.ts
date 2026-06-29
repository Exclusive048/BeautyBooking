/**
 * PACKAGE-BOOKING-MVP-1 — pure math for atomic package bookings.
 *
 * Two side-effect-free helpers, exhaustively unit-tested:
 *   1. `proportionalDiscountedPrices` — split the package's final (already
 *      discounted) total across components in proportion to each
 *      component's price, using LARGEST-REMAINDER so the parts sum to the
 *      final total EXACTLY in kopeks (a naive per-item round drifts the Σ
 *      off the total → analytics mismatch + customer charged ≠ shown).
 *   2. `intraPackageOverlap` — siblings being created in the same tx are
 *      invisible to `ensureNoConflicts` (it only sees committed rows), so
 *      the N sibling slots must be pairwise-checked in memory.
 */

/**
 * Distributes `finalTotal` (kopeks) across `prices` proportionally.
 * Guarantees `Σ result === finalTotal` exactly (largest-remainder).
 *
 * - `prices.length === 0` → `[]`.
 * - `Σ prices === 0` (all free) → every component gets 0 (finalTotal is 0
 *   by construction when the base total is 0).
 * - Floors each raw share, then hands the leftover kopeks one-by-one to the
 *   components with the largest fractional remainder (ties broken by index
 *   → deterministic).
 */
export function proportionalDiscountedPrices(prices: number[], finalTotal: number): number[] {
  const n = prices.length;
  if (n === 0) return [];

  const total = prices.reduce((sum, p) => sum + Math.max(0, p), 0);
  const target = Math.max(0, Math.round(finalTotal));

  if (total <= 0) {
    // All components free → nothing to weight by; everyone 0.
    return prices.map(() => 0);
  }

  const raw = prices.map((p) => (Math.max(0, p) * target) / total);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = target - floors.reduce((sum, f) => sum + f, 0);

  // Rank indices by descending fractional part (stable: index asc on ties).
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.index - b.index));

  const result = [...floors];
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    result[order[cursor % order.length]!.index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return result;
}

/**
 * The package's final (discounted) total in kopeks — byte-identical to
 * `computeBundlePricing(...).finalPrice` so the BOOKED total always matches
 * the bundle price the client saw on the profile card. PERCENT rounds the
 * percentage off the sum; FIXED is capped at the sum; never negative.
 * `discountType` is the `DiscountType` enum value as a string ("PERCENT" |
 * "FIXED") so this stays a pure helper (no Prisma import).
 */
export function packageFinalTotal(
  prices: number[],
  discountType: "PERCENT" | "FIXED",
  discountValue: number,
): number {
  const total = prices.reduce((sum, p) => sum + Math.max(0, p), 0);
  const value = Math.max(0, Math.floor(discountValue));
  const discount =
    discountType === "PERCENT" ? Math.round((total * value) / 100) : Math.min(total, value);
  return Math.max(0, total - discount);
}

export type PackageSlot = {
  startAtUtc: Date;
  endAtUtc: Date;
};

/**
 * Returns true iff any two sibling slots are closer than `bufferMin` (same
 * master — solo package). Siblings being created in the same tx are invisible
 * to `ensureNoConflicts` (it only sees committed rows), so this is the
 * mandatory in-memory guard.
 *
 * The buffer is applied as a SINGLE gap between two bookings — matching the
 * engine's `ensureNoConflicts` semantics (it pads one row by buffer and
 * compares to the other raw, requiring a `buffer`-sized gap). Padding BOTH
 * sides would double-count and reject a validly back-to-back-with-one-gap
 * pair. Symmetric form: `aStart < bEnd+buf && bStart < aEnd+buf`.
 */
export function intraPackageOverlap(slots: PackageSlot[], bufferMin: number): boolean {
  const buffer = Math.max(0, Math.floor(bufferMin)) * 60 * 1000;
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i]!;
      const b = slots[j]!;
      const aStart = a.startAtUtc.getTime();
      const aEnd = a.endAtUtc.getTime();
      const bStart = b.startAtUtc.getTime();
      const bEnd = b.endAtUtc.getTime();
      if (aStart < bEnd + buffer && bStart < aEnd + buffer) return true;
    }
  }
  return false;
}

export type PackageComponentSlot = {
  startAtUtc: Date;
  endAtUtc: Date;
  /** The chosen master for this component (studio package — different masters per component). */
  masterProviderId: string | null;
  /** The chosen master's between-bookings buffer, in minutes. */
  bufferMin: number;
};

/**
 * PACKAGE-BOOKING-MVP-2 — the BY-CLIENT intra-package overlap guard for
 * STUDIO multi-master packages.
 *
 * The invariant (MVP-2): a studio package's components are sequential along
 * the ONE CLIENT's timeline, even across different masters (the client walks
 * master to master — there is NO parallel placement). So the constraint that
 * matters is "the client can't be in two chairs at once": any two component
 * windows must not overlap in CLIENT time, REGARDLESS of which master each is
 * with.
 *
 * This is the axis the solo `intraPackageOverlap` does NOT model: solo is
 * single-master, so by-time == by-master == by-client. Studio is multi-master,
 * so a naive by-MASTER check (each master's `ensureNoConflicts` only sees its
 * OWN bookings) would wrongly ALLOW two different-master components at the same
 * instant. This helper closes that — it pairwise-checks the client windows.
 *
 * Two refinements over a pure non-overlap check:
 *   - DIFFERENT masters → buffer 0 (the client teleports between chairs; the
 *     only constraint is non-overlap; touching back-to-back is allowed). This
 *     is what catches the critical "same-instant-different-masters" case.
 *   - SAME master twice (the client picked one master for two services) → that
 *     master ALSO needs its between-bookings buffer, and the two siblings are
 *     invisible to `ensureNoConflicts` until the second is created in-tx, so
 *     pad by the master's buffer here too (single-gap, matching the engine's
 *     `ensureNoConflicts` semantics — same as solo `intraPackageOverlap`).
 *
 * Returns true iff any pair violates its constraint.
 */
export function intraPackageOverlapMultiMaster(components: PackageComponentSlot[]): boolean {
  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      const a = components[i]!;
      const b = components[j]!;
      const sameMaster =
        a.masterProviderId !== null && a.masterProviderId === b.masterProviderId;
      const bufferMin = sameMaster ? Math.max(a.bufferMin, b.bufferMin) : 0;
      const buffer = Math.max(0, Math.floor(bufferMin)) * 60 * 1000;
      const aStart = a.startAtUtc.getTime();
      const aEnd = a.endAtUtc.getTime();
      const bStart = b.startAtUtc.getTime();
      const bEnd = b.endAtUtc.getTime();
      if (aStart < bEnd + buffer && bStart < aEnd + buffer) return true;
    }
  }
  return false;
}

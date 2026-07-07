export type BookingOverlapWhere = {
  startAtUtc: { not: null; lt: Date };
  endAtUtc: { not: null; gt: Date };
};

export function buildBookingOverlapWhere(rangeFromUtc: Date, rangeToExclusiveUtc: Date): BookingOverlapWhere {
  return {
    startAtUtc: { not: null, lt: rangeToExclusiveUtc },
    endAtUtc: { not: null, gt: rangeFromUtc },
  };
}

/**
 * In-memory counterpart of `buildBookingOverlapWhere`, byte-for-byte the same
 * half-open overlap: `start < rangeToExclusive && end > rangeFrom`. Used to
 * bucket an already-fetched booking set per salon-local day without a fourth
 * overlap definition (FIX-8 / HARDENING-04). A booking that STARTED before the
 * range but runs into it (in-progress / cross-midnight) still overlaps — the
 * exact case a `startAtUtc >= now` probe dropped.
 */
export function bookingOverlapsRange(
  booking: { startAtUtc: Date; endAtUtc: Date },
  rangeFromUtc: Date,
  rangeToExclusiveUtc: Date,
): boolean {
  return booking.startAtUtc < rangeToExclusiveUtc && booking.endAtUtc > rangeFromUtc;
}

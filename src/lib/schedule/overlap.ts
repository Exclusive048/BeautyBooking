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

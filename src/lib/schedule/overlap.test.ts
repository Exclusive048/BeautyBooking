import test from "node:test";
import assert from "node:assert/strict";
import { buildBookingOverlapWhere } from "@/lib/schedule/overlap";

test("buildBookingOverlapWhere matches overlap predicate", () => {
  const rangeFromUtc = new Date(Date.UTC(2026, 1, 10, 0, 0, 0));
  const rangeToExclusiveUtc = new Date(Date.UTC(2026, 1, 11, 0, 0, 0));

  const where = buildBookingOverlapWhere(rangeFromUtc, rangeToExclusiveUtc);

  assert.deepEqual(where, {
    startAtUtc: { not: null, lt: rangeToExclusiveUtc },
    endAtUtc: { not: null, gt: rangeFromUtc },
  });
});

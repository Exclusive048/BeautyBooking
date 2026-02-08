import test from "node:test";
import assert from "node:assert/strict";
import { getBookingDateKeys } from "@/lib/schedule/slotsCache";

test("getBookingDateKeys returns date keys spanning two days", () => {
  const startAtUtc = new Date(Date.UTC(2026, 1, 10, 23, 0, 0));
  const endAtUtc = new Date(Date.UTC(2026, 1, 11, 1, 0, 0));

  const keys = getBookingDateKeys(startAtUtc, endAtUtc, "UTC");

  assert.deepEqual(keys, ["2026-02-10", "2026-02-11"]);
});

test("getBookingDateKeys excludes end day when booking ends at midnight", () => {
  const startAtUtc = new Date(Date.UTC(2026, 1, 8, 10, 0, 0));
  const endAtUtc = new Date(Date.UTC(2026, 1, 9, 0, 0, 0));

  const keys = getBookingDateKeys(startAtUtc, endAtUtc, "UTC");

  assert.deepEqual(keys, ["2026-02-08"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";

test("blocks rebook within 24 hours before slot", () => {
  const slotStart = new Date(Date.UTC(2026, 1, 10, 10, 0, 0));
  const cancelled = new Date(slotStart.getTime() - 23 * 60 * 60 * 1000);
  assert.equal(isHotSlotRebookBlocked(cancelled, slotStart), true);
});

test("allows rebook after 24 hours window", () => {
  const slotStart = new Date(Date.UTC(2026, 1, 10, 10, 0, 0));
  const cancelled = new Date(slotStart.getTime() - 26 * 60 * 60 * 1000);
  assert.equal(isHotSlotRebookBlocked(cancelled, slotStart), false);
});

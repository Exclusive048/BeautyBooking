import test from "node:test";
import assert from "node:assert/strict";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import { timeToMinutes } from "@/lib/schedule/time";
import type { DayPlan } from "@/lib/schedule/types";
import { applyPublishHorizon } from "@/lib/schedule/publish-horizon";

const basePlan: DayPlan = {
  isWorking: true,
  workingIntervals: [{ start: "10:00", end: "19:00" }],
  breaks: [],
  meta: { source: "weekly-template" },
};

test("non-working day yields no slots", () => {
  const plan: DayPlan = { ...basePlan, isWorking: false, workingIntervals: [] };
  const slots = buildSlotsForDay({
    dayPlan: plan,
    dateKey: "2026-02-10",
    timeZone: "UTC",
    serviceDurationMin: 60,
    bufferMin: 0,
    bookings: [],
    now: new Date(Date.UTC(2026, 1, 10, 9, 0, 0)),
  });
  assert.equal(slots.length, 0);
});

test("date beyond publish horizon yields no slots and reason", () => {
  const plan: DayPlan = { ...basePlan };
  const gated = applyPublishHorizon({
    plan,
    dateKey: "2026-02-20",
    publishedUntilLocal: "2026-02-10",
  });
  assert.equal(gated.isWorking, false);
  assert.equal(gated.meta.reason, "out_of_publish_horizon");

  const slots = buildSlotsForDay({
    dayPlan: gated,
    dateKey: "2026-02-20",
    timeZone: "UTC",
    serviceDurationMin: 60,
    bufferMin: 0,
    bookings: [],
    now: new Date(Date.UTC(2026, 1, 10, 9, 0, 0)),
  });
  assert.equal(slots.length, 0);
});

test("working day starts at or after 10:00", () => {
  const slots = buildSlotsForDay({
    dayPlan: basePlan,
    dateKey: "2026-02-10",
    timeZone: "UTC",
    serviceDurationMin: 60,
    bufferMin: 0,
    bookings: [],
    now: new Date(Date.UTC(2026, 1, 10, 9, 0, 0)),
  });
  assert.ok(slots.length > 0);
  const first = slots[0]?.label.split(" ")[1] ?? "";
  const firstMinutes = timeToMinutes(first) ?? 0;
  assert.ok(firstMinutes >= 10 * 60);
});

test("breaks exclude overlapping slots", () => {
  const plan: DayPlan = {
    ...basePlan,
    breaks: [{ start: "13:00", end: "14:00" }],
  };
  const slots = buildSlotsForDay({
    dayPlan: plan,
    dateKey: "2026-02-10",
    timeZone: "UTC",
    serviceDurationMin: 60,
    bufferMin: 0,
    bookings: [],
    now: new Date(Date.UTC(2026, 1, 10, 9, 0, 0)),
  });
  const breakStart = 13 * 60;
  const breakEnd = 14 * 60;
  const overlapsBreak = slots.some((slot) => {
    const time = slot.label.split(" ")[1] ?? "";
    const start = timeToMinutes(time);
    if (start === null) return false;
    const end = start + 60;
    return start < breakEnd && end > breakStart;
  });
  assert.equal(overlapsBreak, false);
});

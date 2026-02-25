import test from "node:test";
import assert from "node:assert/strict";
import { resolveReminderSchedule } from "@/lib/bookings/reminders";

test("schedules both reminders when far from start", () => {
  const now = new Date(Date.UTC(2026, 1, 10, 8, 0, 0));
  const startAt = new Date(Date.UTC(2026, 1, 11, 14, 0, 0)); // 30h later
  const schedule = resolveReminderSchedule(startAt, now);
  const kinds = schedule.map((item) => item.kind).sort();
  assert.deepEqual(kinds, ["REMINDER_24H", "REMINDER_2H"]);
});

test("schedules only 2h reminder when under 24h", () => {
  const now = new Date(Date.UTC(2026, 1, 10, 8, 0, 0));
  const startAt = new Date(Date.UTC(2026, 1, 10, 18, 0, 0)); // 10h later
  const schedule = resolveReminderSchedule(startAt, now);
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0]?.kind, "REMINDER_2H");
});

test("skips reminders when within 15 minutes", () => {
  const now = new Date(Date.UTC(2026, 1, 10, 8, 0, 0));
  const startAt = new Date(Date.UTC(2026, 1, 10, 8, 10, 0)); // 10 min later
  const schedule = resolveReminderSchedule(startAt, now);
  assert.equal(schedule.length, 0);
});

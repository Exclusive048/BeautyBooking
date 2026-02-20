import test from "node:test";
import assert from "node:assert/strict";
import { BookingStatus } from "@prisma/client";
import { getChatAvailability, isChatOpen, OPEN_STATUSES, READONLY_WINDOW_HOURS } from "@/lib/chat/status";

const CLOSED_STATUSES: BookingStatus[] = [
  BookingStatus.NEW,
  BookingStatus.PENDING,
  BookingStatus.CHANGE_REQUESTED,
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

test("isChatOpen returns true only for open statuses", () => {
  for (const status of OPEN_STATUSES) {
    assert.equal(isChatOpen(status), true);
  }
  for (const status of [BookingStatus.FINISHED, ...CLOSED_STATUSES]) {
    assert.equal(isChatOpen(status), false);
  }
});

test("getChatAvailability returns canSend for open statuses", () => {
  for (const status of OPEN_STATUSES) {
    const availability = getChatAvailability(status, null);
    assert.equal(availability.canSend, true);
    assert.equal(availability.isReadOnly, false);
    assert.equal(availability.isAvailable, true);
  }
});

test("getChatAvailability returns read-only for finished within window", () => {
  const withinWindowMs = (READONLY_WINDOW_HOURS - 1) * 60 * 60 * 1000;
  const startAtUtc = new Date(Date.now() - withinWindowMs);
  const availability = getChatAvailability(BookingStatus.FINISHED, startAtUtc);
  assert.equal(availability.canSend, false);
  assert.equal(availability.isReadOnly, true);
  assert.equal(availability.isAvailable, true);
});

test("getChatAvailability keeps history for finished after window", () => {
  const pastWindowMs = (READONLY_WINDOW_HOURS + 1) * 60 * 60 * 1000;
  const startAtUtc = new Date(Date.now() - pastWindowMs);
  const availability = getChatAvailability(BookingStatus.FINISHED, startAtUtc);
  assert.equal(availability.canSend, false);
  assert.equal(availability.isReadOnly, false);
  assert.equal(availability.isAvailable, true);
});

test("getChatAvailability closes finished without startAtUtc", () => {
  const availability = getChatAvailability(BookingStatus.FINISHED, null);
  assert.equal(availability.canSend, false);
  assert.equal(availability.isReadOnly, false);
  assert.equal(availability.isAvailable, false);
});

test("getChatAvailability closes other statuses", () => {
  for (const status of CLOSED_STATUSES) {
    const availability = getChatAvailability(status, new Date());
    assert.equal(availability.canSend, false);
    assert.equal(availability.isReadOnly, false);
    assert.equal(availability.isAvailable, false);
  }
});

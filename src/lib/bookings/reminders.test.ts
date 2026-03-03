import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaTransaction = vi.hoisted(() => vi.fn());
const bookingFindUnique = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const createBookingReminderJob = vi.hoisted(
  () => vi.fn((payload: unknown, input?: { runAt?: number }) => ({
  type: "booking.reminder",
  payload,
  runAt: input?.runAt,
  }))
);
const createBookingReminderNotifications = vi.hoisted(() => vi.fn());
const publishNotifications = vi.hoisted(() => vi.fn());
const sendBookingReminderTelegramNotifications = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: bookingFindUnique },
    $transaction: prismaTransaction,
  },
}));

vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/queue/types", () => ({
  BOOKING_REMINDER_JOB_TYPE: "booking.reminder",
  createBookingReminderJob,
}));
vi.mock("@/lib/notifications/service", () => ({
  createBookingReminderNotifications,
  publishNotifications,
}));
vi.mock("@/lib/notifications/bookingTelegramService", () => ({
  sendBookingReminderTelegramNotifications,
}));
vi.mock("@/lib/logging/logger", () => ({ logError }));

import {
  isBookingReminderJob,
  processBookingReminder,
  resolveReminderSchedule,
  scheduleBookingReminders,
} from "@/lib/bookings/reminders";

describe("bookings/reminders", () => {
  beforeEach(() => {
    bookingFindUnique.mockReset();
    prismaTransaction.mockReset();
    enqueue.mockReset();
    createBookingReminderJob.mockClear();
    createBookingReminderNotifications.mockReset();
    publishNotifications.mockReset();
    sendBookingReminderTelegramNotifications.mockReset();
    logError.mockReset();
  });

  it("resolves both reminders when far from start", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const start = new Date("2026-03-02T02:30:00Z");
    const schedule = resolveReminderSchedule(start, now);
    expect(schedule.map((item) => item.kind).sort()).toEqual(["REMINDER_24H", "REMINDER_2H"].sort());
  });

  it("resolves only 2h reminder when under threshold", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const start = new Date("2026-03-01T02:10:00Z");
    const schedule = resolveReminderSchedule(start, now);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]?.kind).toBe("REMINDER_2H");
  });

  it("schedules jobs for confirmed booking", async () => {
    bookingFindUnique.mockResolvedValueOnce({
      id: "b1",
      status: "CONFIRMED",
      startAtUtc: new Date(Date.now() + 26 * 60 * 60 * 1000),
      silentMode: false,
      provider: { remindersEnabled: true },
    });

    await scheduleBookingReminders("b1");
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("publishes notifications when reminder is processed", async () => {
    prismaTransaction.mockResolvedValueOnce({
      sent: true,
      notifications: [{ id: "n1" }],
    });

    await processBookingReminder({
      bookingId: "b1",
      kind: "REMINDER_2H",
      startAtUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    expect(publishNotifications).toHaveBeenCalledTimes(1);
    expect(sendBookingReminderTelegramNotifications).toHaveBeenCalledTimes(1);
  });

  it("recognizes reminder jobs", () => {
    expect(isBookingReminderJob({ type: "booking.reminder" })).toBe(true);
    expect(isBookingReminderJob({ type: "other" })).toBe(false);
  });
});

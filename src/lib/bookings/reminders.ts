import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { enqueue } from "@/lib/queue/queue";
import {
  BOOKING_REMINDER_JOB_TYPE,
  createBookingReminderJob,
  type BookingReminderKind,
  type BookingReminderPayload,
} from "@/lib/queue/types";
import {
  createBookingReminderNotifications,
  publishNotifications,
} from "@/lib/notifications/service";
import { sendBookingReminderTelegramNotifications } from "@/lib/notifications/bookingTelegramService";

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;

const REMINDER_24H_MS = 24 * HOURS;
const REMINDER_2H_MS = 2 * HOURS;
const MIN_LEAD_MS = 15 * MINUTES;
const SINGLE_REMINDER_THRESHOLD_MS = 2.5 * HOURS;

type ReminderScheduleItem = {
  kind: BookingReminderKind;
  runAt: Date;
};

function normalizeStartAt(startAtUtc: Date | null | undefined): Date | null {
  if (!startAtUtc) return null;
  if (!(startAtUtc instanceof Date)) return null;
  if (Number.isNaN(startAtUtc.getTime())) return null;
  return startAtUtc;
}

export function resolveReminderSchedule(startAtUtc: Date, now = new Date()): ReminderScheduleItem[] {
  const start = normalizeStartAt(startAtUtc);
  if (!start) return [];
  const nowTime = now.getTime();
  const startTime = start.getTime();
  if (startTime <= nowTime) return [];

  const diff = startTime - nowTime;
  if (diff < MIN_LEAD_MS) return [];

  const items: ReminderScheduleItem[] = [];
  const twoHoursAt = new Date(startTime - REMINDER_2H_MS);
  const safeTwoHoursAt = new Date(Math.max(twoHoursAt.getTime(), nowTime));
  items.push({ kind: "REMINDER_2H", runAt: safeTwoHoursAt });

  if (diff >= SINGLE_REMINDER_THRESHOLD_MS) {
    const twentyFourAt = new Date(startTime - REMINDER_24H_MS);
    if (twentyFourAt.getTime() > nowTime) {
      items.push({ kind: "REMINDER_24H", runAt: twentyFourAt });
    }
  }

  return items;
}

export async function scheduleBookingReminders(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      silentMode: true,
      provider: { select: { remindersEnabled: true } },
    },
  });

  if (!booking || booking.status !== "CONFIRMED") return;
  if (!booking.startAtUtc) return;
  if (booking.silentMode) return;
  if (!booking.provider.remindersEnabled) return;

  const schedule = resolveReminderSchedule(booking.startAtUtc);
  if (schedule.length === 0) return;

  const startAtIso = booking.startAtUtc.toISOString();
  await Promise.all(
    schedule.map((item) =>
      enqueue(
        createBookingReminderJob(
          {
            bookingId,
            kind: item.kind,
            startAtUtc: startAtIso,
          },
          {
            runAt: item.runAt.getTime(),
          }
        )
      )
    )
  );
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function markReminderSent(
  tx: DbClient,
  bookingId: string,
  kind: BookingReminderKind
): Promise<boolean> {
  const data =
    kind === "REMINDER_24H"
      ? { reminder24hSentAt: new Date() }
      : { reminder2hSentAt: new Date() };

  const where =
    kind === "REMINDER_24H"
      ? { id: bookingId, reminder24hSentAt: null }
      : { id: bookingId, reminder2hSentAt: null };

  const result = await tx.booking.updateMany({ where, data });
  return result.count > 0;
}

export async function processBookingReminder(payload: BookingReminderPayload): Promise<void> {
  const jobStart = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: payload.bookingId },
      select: {
        id: true,
        status: true,
        startAtUtc: true,
        silentMode: true,
        reminder24hSentAt: true,
        reminder2hSentAt: true,
        provider: { select: { remindersEnabled: true } },
      },
    });

    if (!booking) return { sent: false };
    if (booking.status !== "CONFIRMED") return { sent: false };
    if (!booking.startAtUtc) return { sent: false };
    if (booking.startAtUtc.toISOString() !== payload.startAtUtc) return { sent: false };
    if (booking.startAtUtc.getTime() <= jobStart.getTime()) return { sent: false };
    if (booking.silentMode) return { sent: false };
    if (!booking.provider.remindersEnabled) return { sent: false };
    if (payload.kind === "REMINDER_24H" && booking.reminder24hSentAt) return { sent: false };
    if (payload.kind === "REMINDER_2H" && booking.reminder2hSentAt) return { sent: false };

    const updated = await markReminderSent(tx, booking.id, payload.kind);
    if (!updated) return { sent: false };

    const notifications = await createBookingReminderNotifications({
      bookingId: booking.id,
      kind: payload.kind,
      db: tx,
    });

    return { sent: true, notifications };
  });

  if (!result.sent) return;

  const notifications = result.notifications ?? [];
  if (notifications.length > 0) {
    publishNotifications(notifications);
  }

  await sendBookingReminderTelegramNotifications(payload.bookingId, payload.kind);
}

export function isBookingReminderJob(job: { type: string }): job is { type: typeof BOOKING_REMINDER_JOB_TYPE } {
  return job.type === BOOKING_REMINDER_JOB_TYPE;
}

import { randomUUID } from "crypto";

export type TelegramSendPayload = {
  chatId: string;
  text: string;
};

export type BookingReminderKind = "REMINDER_24H" | "REMINDER_2H";

export type BookingReminderPayload = {
  bookingId: string;
  kind: BookingReminderKind;
  startAtUtc: string;
};

export type TelegramSendJob = {
  id: string;
  type: "telegram.send";
  payload: TelegramSendPayload;
  attempts: number;
  maxAttempts: number;
  runAt?: number;
  createdAt: number;
};

export type BookingReminderJob = {
  id: string;
  type: "booking.reminder";
  payload: BookingReminderPayload;
  attempts: number;
  maxAttempts: number;
  runAt?: number;
  createdAt: number;
};

export type Job = TelegramSendJob | BookingReminderJob;

export const TELEGRAM_SEND_JOB_TYPE = "telegram.send";
export const BOOKING_REMINDER_JOB_TYPE = "booking.reminder";
export const DEFAULT_JOB_MAX_ATTEMPTS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTelegramSendPayload(value: unknown): value is TelegramSendPayload {
  if (!isRecord(value)) return false;
  return typeof value.chatId === "string" && typeof value.text === "string";
}

function isBookingReminderPayload(value: unknown): value is BookingReminderPayload {
  if (!isRecord(value)) return false;
  if (typeof value.bookingId !== "string" || value.bookingId.length === 0) return false;
  if (value.kind !== "REMINDER_24H" && value.kind !== "REMINDER_2H") return false;
  if (typeof value.startAtUtc !== "string" || value.startAtUtc.length === 0) return false;
  return true;
}

export function isJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.attempts !== "number") return false;
  if (typeof value.maxAttempts !== "number") return false;
  if (typeof value.createdAt !== "number") return false;
  if (typeof value.runAt !== "undefined" && typeof value.runAt !== "number") return false;

  if (value.type === TELEGRAM_SEND_JOB_TYPE) {
    return isTelegramSendPayload(value.payload);
  }

  if (value.type === BOOKING_REMINDER_JOB_TYPE) {
    return isBookingReminderPayload(value.payload);
  }

  return false;
}

export function createTelegramSendJob(
  payload: TelegramSendPayload,
  input?: Partial<Pick<TelegramSendJob, "id" | "attempts" | "maxAttempts" | "runAt" | "createdAt">>
): TelegramSendJob {
  return {
    id: input?.id ?? randomUUID(),
    type: TELEGRAM_SEND_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  };
}

export function createBookingReminderJob(
  payload: BookingReminderPayload,
  input?: Partial<Pick<BookingReminderJob, "id" | "attempts" | "maxAttempts" | "runAt" | "createdAt">>
): BookingReminderJob {
  return {
    id: input?.id ?? randomUUID(),
    type: BOOKING_REMINDER_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  };
}

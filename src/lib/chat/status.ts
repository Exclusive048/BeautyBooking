import { BookingStatus } from "@prisma/client";

export const OPEN_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PREPAID,
  BookingStatus.STARTED,
  BookingStatus.IN_PROGRESS,
];

export const READONLY_WINDOW_HOURS = 24;

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isChatOpen(status: BookingStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function getChatAvailability(
  status: BookingStatus,
  startAtUtc: Date | string | null
): { canSend: boolean; isReadOnly: boolean; isAvailable: boolean } {
  const canSend = isChatOpen(status);
  const isFinished = status === BookingStatus.FINISHED;
  const startAt = isFinished ? toDate(startAtUtc) : null;
  let isReadOnly = false;

  if (!canSend && isFinished && startAt) {
    const diffMs = Date.now() - startAt.getTime();
    if (diffMs >= 0 && diffMs <= READONLY_WINDOW_HOURS * 60 * 60 * 1000) {
      isReadOnly = true;
    }
  }

  return {
    canSend,
    isReadOnly,
    isAvailable: canSend || isReadOnly || Boolean(isFinished && startAt),
  };
}

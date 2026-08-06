import { BookingStatus } from "@/lib/prisma-enums";

export type BookingStatusTone = "confirmed" | "pending" | "new" | "done" | "muted";

/**
 * Maps a `BookingStatus` to a coarse colour bucket used by the grid
 * cells. The "new" tone is reserved for first-time-client highlight and
 * is applied at the row level (not from this map) — see `day-schedule`
 * service for the `isNewClient` flag.
 */
export function bookingToneFromStatus(status: BookingStatus): BookingStatusTone {
  switch (status) {
    case BookingStatus.CONFIRMED:
    case BookingStatus.PREPAID:
    case BookingStatus.STARTED:
    case BookingStatus.IN_PROGRESS:
      return "confirmed";
    case BookingStatus.PENDING:
    case BookingStatus.CHANGE_REQUESTED:
      return "pending";
    case BookingStatus.FINISHED:
      return "done";
    case BookingStatus.CANCELLED:
    case BookingStatus.REJECTED:
    case BookingStatus.NO_SHOW:
    case BookingStatus.NEW:
      return "muted";
    default:
      return "muted";
  }
}

/**
 * Tailwind class bundle for the absolute-positioned booking cell. Kept
 * close to the tone map so visual + semantic stay in sync.
 */
export const BOOKING_CELL_CLASS: Record<BookingStatusTone, string> = {
  confirmed:
    "border border-primary/40 bg-primary/15 text-text-main hover:bg-primary/20",
  pending:
    "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
  new: "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  done: "border border-border-subtle bg-bg-input/70 text-text-sec",
  muted: "border border-border-subtle bg-bg-input/40 text-text-sec",
};

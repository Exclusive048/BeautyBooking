import { BookingSource } from "@prisma/client";

export type SourceTone = "info" | "neutral";

export type SourceDisplay = {
  /** UI_TEXT key under `studioCabinet.bookingsV2.source` */
  labelKey: "catalog" | "phone" | "app";
  tone: SourceTone;
};

/**
 * Maps `BookingSource` to a journal-friendly display. `MANUAL` covers
 * admin-entered bookings (phone calls from clients), `WEB` covers
 * public catalog flow. `APP` is reserved for the future PWA/mobile
 * surface — handled gracefully with the same neutral tone as MANUAL.
 */
export function getBookingSourceDisplay(source: BookingSource): SourceDisplay {
  switch (source) {
    case BookingSource.WEB:
      return { labelKey: "catalog", tone: "info" };
    case BookingSource.APP:
      return { labelKey: "app", tone: "neutral" };
    case BookingSource.MANUAL:
    default:
      return { labelKey: "phone", tone: "neutral" };
  }
}

export const SOURCE_BADGE_CLASS: Record<SourceTone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300",
  neutral: "border-border-subtle bg-bg-input text-text-sec",
};

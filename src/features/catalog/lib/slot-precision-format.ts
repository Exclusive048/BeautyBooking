import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * `Provider.slotPrecision` controls how the public catalog (and other
 * public surfaces) presents booking availability. Values mirror the
 * canonical type in `src/lib/schedule/editor-shared.ts:86`:
 *
 *   - "exact"       — show the precise next slot (e.g. «Ближайшее: 25 мая, 14:30»)
 *   - "today_free"  — hide the time, show «Сегодня свободно» when the
 *                     `availableToday` snapshot is set
 *   - "date_only"   — show the date of the next slot but not the time
 *                     (e.g. «Свободно 25 мая»)
 *
 * Helper is **purely presentational** — it does NOT compute slots.
 * Callers pass whatever availability signal the listing already has
 * cheaply (today the catalog query exposes `availableToday` boolean +
 * a `nextSlot` placeholder that is always null until a snapshot
 * helper exists, see CATALOG-ENHANCEMENTS-A backlog «catalog
 * availability pre-computation»).
 */

export type SlotPrecision = "exact" | "today_free" | "date_only";

export type AvailabilitySignal = {
  /** Provider's stated precision preference. Default `"exact"`. */
  precision: SlotPrecision;
  /** ISO string of the nearest slot start, if the listing knows. */
  nextSlotStartAt?: string | null;
  /** Snapshot boolean: provider has at least one free slot today. */
  availableToday?: boolean;
  /** Viewer timezone for date/time formatting. */
  timeZone: string;
  /**
   * If `false`, callers should suppress the chip entirely — provider
   * is unpublished or the surface doesn't want a fallback string.
   * Defaults to `true` (booking is "open" if no other signal).
   */
  fallbackToOpen?: boolean;
};

export type AvailabilityDisplay = {
  /** Localised label or `null` if nothing useful to display. */
  label: string | null;
  /**
   * Tone hint — `"available"` (green) when a positive signal is
   * present, `"neutral"` (muted) for the generic «Запись открыта»
   * fallback. Callers can ignore and apply their own styling.
   */
  tone: "available" | "neutral";
};

const isSlotPrecision = (value: unknown): value is SlotPrecision =>
  value === "exact" || value === "today_free" || value === "date_only";

export function normalizeSlotPrecision(value: unknown): SlotPrecision {
  return isSlotPrecision(value) ? value : "exact";
}

/**
 * Format a provider's availability per their `slotPrecision` setting.
 * Returns `{ label, tone }` — callers decide how to render. Returns
 * `{ label: null, tone: "neutral" }` when nothing useful is known and
 * `fallbackToOpen=false`.
 */
export function formatAvailability(signal: AvailabilitySignal): AvailabilityDisplay {
  const { precision, nextSlotStartAt, availableToday, timeZone, fallbackToOpen = true } = signal;
  const T = UI_TEXT.catalog2.card.availability;

  if (precision === "exact" && nextSlotStartAt) {
    return {
      label: T.nextSlotExact.replace(
        "{when}",
        UI_FMT.dateTimeShort(nextSlotStartAt, { timeZone }),
      ),
      tone: "available",
    };
  }

  if (precision === "today_free" && availableToday) {
    return { label: T.todayFree, tone: "available" };
  }

  if (precision === "date_only" && nextSlotStartAt) {
    return {
      label: T.dateOnly.replace(
        "{date}",
        UI_FMT.dateShort(nextSlotStartAt, { timeZone }),
      ),
      tone: "available",
    };
  }

  // Soft fallbacks — provider's precision implies "show something
  // positive when we can". `availableToday` is a cheap snapshot, so
  // use it even when precision was `"exact"` but we don't have a
  // precise slot to show (no snapshot pipeline yet).
  if (availableToday) {
    return { label: T.todayFree, tone: "available" };
  }

  if (fallbackToOpen) {
    return { label: T.bookingOpen, tone: "neutral" };
  }

  return { label: null, tone: "neutral" };
}

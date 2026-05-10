/**
 * URL state for booking widget (32b).
 *
 * `?bookingId=` survives across refresh / share — when present, the
 * widget skips selection/form and hydrates the success card via
 * `/api/public/bookings/[id]`.
 *
 * Mutations use `history.replaceState` (not push) so the back button
 * doesn't trap the user inside the widget.
 */
const BOOKING_ID_PARAM = "bookingId";

export function readBookingIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(BOOKING_ID_PARAM);
  return value && value.length >= 8 ? value : null;
}

export function writeBookingIdToUrl(bookingId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(BOOKING_ID_PARAM, bookingId);
  window.history.replaceState({}, "", url.toString());
}

export function clearBookingIdFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(BOOKING_ID_PARAM)) return;
  url.searchParams.delete(BOOKING_ID_PARAM);
  window.history.replaceState({}, "", url.toString());
}

import type { BookingStatus } from "@prisma/client";

/**
 * BOOKING-STUDIO-RESCHEDULE-PARITY-01 — studio-cabinet parity for accepting /
 * declining a client-proposed reschedule (two-sided approval), reusing the
 * existing `/confirm` + `/decline-reschedule` endpoints (no new API, no schema).
 *
 * Pure + client-safe (only a type import from `@prisma/client`): shared by the
 * server data services (DTO mapping) AND the client calendar/journal UI (the
 * accept/decline gate + endpoint URL). Keeping the gate in one place means the
 * calendar cell, the action menu, and the server all agree.
 */

/** Shape carried onto `ScheduleBookingCell` / `StudioBookingRow` for a booking
 *  that may have a pending client-proposed reschedule. Times are UTC ISO (rule 8
 *  — display in salon-tz at the surface via `formatLocalHm`). */
export type ProposedReschedule = {
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
};

/**
 * Maps the Prisma booking columns to the serializable DTO shape. Mirrors the
 * generic booking mapper (`src/lib/bookings/mappers.ts`: `proposedStartAtUtc:
 * model.proposedStartAt ? toISO(...) : null`). Used by both studio server
 * services so the two paths cannot drift.
 */
export function mapProposedReschedule(input: {
  proposedStartAt: Date | null;
  proposedEndAt: Date | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
}): ProposedReschedule {
  return {
    proposedStartAtUtc: input.proposedStartAt
      ? input.proposedStartAt.toISOString()
      : null,
    proposedEndAtUtc: input.proposedEndAt ? input.proposedEndAt.toISOString() : null,
    actionRequiredBy: input.actionRequiredBy ?? null,
  };
}

/**
 * True when the CLIENT proposed a new time and the STUDIO must accept/decline.
 * Mirrors the master-side gate (`confirmBooking` / `booking-card-actions`):
 * `status === CHANGE_REQUESTED && actionRequiredBy === "MASTER"`. When the
 * studio/master is the initiator (`actionRequiredBy === "CLIENT"`) they're the
 * side waiting on the client → NO accept/decline shown (the endpoints would 409
 * "Action is required from another side" anyway). `proposedStartAtUtc` guards
 * against a half-cleared row.
 */
export function isPendingClientReschedule(cell: {
  status: BookingStatus;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  proposedStartAtUtc: string | null;
}): boolean {
  return (
    cell.status === "CHANGE_REQUESTED" &&
    cell.actionRequiredBy === "MASTER" &&
    cell.proposedStartAtUtc !== null
  );
}

/**
 * Endpoint URL for the two-sided approval decision. Accept reuses the shared
 * atomic `confirmBooking` path (applies the proposed time, re-validates slot
 * conflicts); decline reverts to the original time. Both admit a studio admin
 * via `requireBookingConfirmAccess` (→ actor "MASTER"). POST, no body.
 */
export function bookingDecisionUrl(
  bookingId: string,
  decision: "accept" | "decline",
): string {
  const id = encodeURIComponent(bookingId);
  return decision === "accept"
    ? `/api/bookings/${id}/confirm`
    : `/api/bookings/${id}/decline-reschedule`;
}

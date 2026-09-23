import { bookingToneFromStatus } from "@/features/studio-cabinet/schedule/lib/booking-status-display";
import type { ScheduleBookingCell } from "@/features/studio-cabinet/schedule/server/types";
import type { StudioBookingRow } from "../server/types";

/**
 * BOOKING-JOURNAL-SERVICEID-01 — journal row → calendar-cell adapter.
 *
 * The studio bookings-journal reuses the calendar's `BookingActionMenu` +
 * `MoveBookingDialog` via a `ScheduleBookingCell`. Previously this mapped
 * `serviceId: ""` (a placeholder), which made Move-from-journal's target-master
 * picker gate on `master.serviceIds.includes("")` — false for every master
 * (serviceIds are cuids), so **all masters showed as «· несовместим» (disabled)**
 * and the admin could not pick any target. (The server `moveStudioBooking` still
 * re-validated `assertMasterPerformsService` from DB, so it was a UI over-block,
 * not an integrity hole.) Threading the real `Booking.serviceId` makes
 * Move-from-journal gate identically to Move-from-calendar (which builds the
 * cell with the same `serviceId`). Extracted from `booking-row.tsx` so the
 * mapping is testable in isolation.
 *
 * Pure — no React/DOM deps (only `bookingToneFromStatus` + types).
 */
export function bookingToCell(row: StudioBookingRow): ScheduleBookingCell {
  return {
    id: row.id,
    masterId: row.master.id,
    startAtUtc: row.startAtUtc,
    endAtUtc: row.endAtUtc,
    status: row.status,
    tone: bookingToneFromStatus(row.status),
    clientName: row.client.displayName,
    clientPhone: row.client.phone,
    isNewClient: row.client.isNewClient,
    serviceTitle: row.service.name,
    serviceId: row.serviceId,
    priceKopeks: row.priceKopeks,
    proposedStartAtUtc: row.proposedStartAtUtc,
    proposedEndAtUtc: row.proposedEndAtUtc,
    actionRequiredBy: row.actionRequiredBy,
    // Журнал студии показывает только записи, которыми студия управляет.
    isPersonal: false,
  };
}

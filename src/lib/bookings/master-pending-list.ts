import { BookingActionRequiredBy, BookingStatus } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type PendingBookingRow = {
  id: string;
  clientName: string;
  startAtUtc: Date | null;
  serviceTitle: string;
  changeComment: string | null;
};

/**
 * Top-N bookings the master must act on. Used by the dashboard "Требуют
 * внимания" column — count comes from `getPendingBookingsCountForMaster`,
 * this fetches the actual rows for inline display.
 */
export const getPendingBookingsForMaster = cache(
  async (masterProviderId: string, limit = 3): Promise<PendingBookingRow[]> => {
    // MASTER-DASHBOARD-FIX-A #1а: exclude bookings whose start time
    // has already passed — confirm/decline is no longer meaningful
    // once the booking moment has arrived. The dashboard attention
    // panel must only surface rows where action is still possible.
    // `{ gt: now }` also excludes legacy slot-label-only rows with
    // null startAtUtc — fine, those aren't time-bound and wouldn't
    // be safely actionable from a dashboard reminder either.
    const now = new Date();
    const rows = await prisma.booking.findMany({
      where: {
        providerId: masterProviderId,
        startAtUtc: { gt: now },
        OR: [
          {
            status: BookingStatus.PENDING,
            actionRequiredBy: BookingActionRequiredBy.MASTER,
          },
          {
            status: BookingStatus.CHANGE_REQUESTED,
            actionRequiredBy: BookingActionRequiredBy.MASTER,
          },
        ],
      },
      // Nearest upcoming first — after the `gt now` filter, ascending
      // start time gives "what needs attention soonest" at the top.
      orderBy: { startAtUtc: "asc" },
      take: limit,
      select: {
        id: true,
        clientName: true,
        startAtUtc: true,
        changeComment: true,
        service: { select: { name: true, title: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      clientName: row.clientName,
      startAtUtc: row.startAtUtc,
      serviceTitle: row.service.title?.trim() || row.service.name,
      changeComment: row.changeComment,
    }));
  },
);

import { BookingActionRequiredBy, BookingStatus } from "@prisma/client";
import { cache } from "react";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { prisma } from "@/lib/prisma";

/**
 * Bookings the master must explicitly act on — PENDING with action assigned
 * to MASTER, plus CHANGE_REQUESTED waiting for master's reply. Powers the
 * sidebar badge in the master cabinet shell.
 */
export const getPendingBookingsCountForMaster = cache(
  // STUDIO-MASTER-PROFILES (этап 4): записи всех рабочих профилей мастера.
  async (masterProviderId: string | readonly string[]): Promise<number> => {
    return prisma.booking.count({
      where: {
        // F1: performer predicate (studio bookings carry providerId=STUDIO).
        // AND-wrapped: this query has its own OR for the actionable statuses.
        AND: [masterPerformedBookingWhere(masterProviderId)],
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
    });
  },
);

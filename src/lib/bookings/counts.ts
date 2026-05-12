import { BookingActionRequiredBy, BookingStatus } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Bookings the master must explicitly act on — PENDING with action assigned
 * to MASTER, plus CHANGE_REQUESTED waiting for master's reply. Powers the
 * sidebar badge in the master cabinet shell.
 */
export const getPendingBookingsCountForMaster = cache(
  async (masterProviderId: string): Promise<number> => {
    return prisma.booking.count({
      where: {
        providerId: masterProviderId,
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

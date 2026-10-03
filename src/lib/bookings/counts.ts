import { BookingActionRequiredBy, BookingStatus, type Prisma } from "@prisma/client";
import { cache } from "react";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { prisma } from "@/lib/prisma";

/**
 * «Ждут ответа мастера»: неподтверждённая запись и перенос, о котором просит
 * клиент. Одно условие на бейдж кабинета и разбивку для приложения.
 */
const ACTION_REQUIRED_BY_MASTER_WHERE = {
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
} satisfies Prisma.BookingWhereInput;

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
        ...ACTION_REQUIRED_BY_MASTER_WHERE,
      },
    });
  },
);

export type ActionRequiredBookingCounts = {
  /** Всего ждут ответа мастера — то же число, что бейдж «Записи» кабинета. */
  total: number;
  /** Новые записи, ждущие подтверждения. */
  pendingConfirmation: number;
  /** Переносы, о которых просит клиент. */
  rescheduleRequests: number;
};

/**
 * MOBILE-MASTER-C — то же множество, что {@link getPendingBookingsCountForMaster},
 * с разбивкой «подтвердить запись / ответить на перенос» (экран «Сегодня»
 * приложения). Один `groupBy` по статусу.
 */
export const getActionRequiredBookingCountsForMaster = cache(
  async (masterProviderId: string | readonly string[]): Promise<ActionRequiredBookingCounts> => {
    const rows = await prisma.booking.groupBy({
      by: ["status"],
      where: {
        AND: [masterPerformedBookingWhere(masterProviderId)],
        ...ACTION_REQUIRED_BY_MASTER_WHERE,
      },
      _count: { _all: true },
    });
    let pendingConfirmation = 0;
    let rescheduleRequests = 0;
    for (const row of rows) {
      if (row.status === BookingStatus.CHANGE_REQUESTED) rescheduleRequests += row._count._all;
      else pendingConfirmation += row._count._all;
    }
    return { total: pendingConfirmation + rescheduleRequests, pendingConfirmation, rescheduleRequests };
  },
);

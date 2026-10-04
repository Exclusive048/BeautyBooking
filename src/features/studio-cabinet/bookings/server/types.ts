import type { BookingSource, BookingStatus } from "@prisma/client";

export type StudioBookingRow = {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  master: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    specialization: string;
  };
  client: {
    displayName: string;
    phone: string | null;
    isNewClient: boolean;
    isVip: boolean;
  };
  /**
   * BOOKING-JOURNAL-SERVICEID-01: the booking's primary gating service
   * (`Booking.serviceId`, non-null FK). Threaded into the calendar-cell shape
   * so Move-from-journal gates the target-master picker identically to
   * Move-from-calendar (`assertMasterPerformsService`); was hardcoded `""`
   * which blocked every master. A package booking is N independent child rows,
   * each with its own single `serviceId`, so there is no ambiguity here.
   */
  serviceId: string;
  service: {
    name: string;
    durationMin: number;
  };
  priceKopeks: number;
  source: BookingSource;
  status: BookingStatus;
  /**
   * BOOKING-STUDIO-RESCHEDULE-PARITY-01: a client-proposed reschedule the
   * studio must accept/decline (see `ScheduleBookingCell`). Non-null only when
   * `status === CHANGE_REQUESTED`; times are UTC ISO (salon-tz at display).
   */
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** MOBILE-STUDIO-C (ops): пакет записи — отмена только пакетом целиком. */
  bookingPackageId: string | null;
};

export type StudioBookingsRangeCounts = {
  today: number;
  tomorrow: number;
  week: number;
  all: number;
};

export type StudioBookingsListData = {
  items: StudioBookingRow[];
  nextCursor: string | null;
  rangeCounts: StudioBookingsRangeCounts;
  /**
   * FIX-STUDIO-CALENDAR-SALON-TZ: the salon's own tz. The journal shows
   * each booking's start time + today/tomorrow date in this tz (matching
   * the calendar), not the admin's browser tz.
   */
  timezone: string;
};

export type StudioBookingsKpis = {
  todayCount: number;
  todayCompleted: number;
  todayUpcoming: number;
  needsActionCount: number;
  confirmedNext7Days: number;
  revenueTodayKopeks: number;
  revenueDeltaPercent: number | null;
  noShowLast7Days: number;
};

export type MasterOption = {
  id: string;
  name: string;
};

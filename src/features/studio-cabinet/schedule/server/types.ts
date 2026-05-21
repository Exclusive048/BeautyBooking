import type { BookingStatus, TimeBlockType } from "@prisma/client";
import type { BookingStatusTone } from "../lib/booking-status-display";

export type ScheduleMasterColumn = {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  reviewsCount: number;
  /** False when the master is paused (`Provider.isPublished = false`). */
  isAvailable: boolean;
  /**
   * STUDIO-RESCHEDULE-VALIDATION-A: serviceIds the master has enabled
   * via `MasterService`. Consumed by the move-booking dialog's master
   * picker to gate (disabled + tooltip) masters who cannot perform the
   * booking's service. Defense-in-depth — backend's
   * `assertMasterPerformsService` still validates server-side.
   */
  serviceIds: string[];
};

export type ScheduleBookingCell = {
  id: string;
  masterId: string;
  startAtUtc: string;
  endAtUtc: string;
  status: BookingStatus;
  tone: BookingStatusTone;
  clientName: string;
  clientPhone: string | null;
  isNewClient: boolean;
  serviceTitle: string;
  serviceId: string;
  priceKopeks: number;
};

export type ScheduleBreakCell = {
  id: string;
  masterId: string;
  startAtUtc: string;
  endAtUtc: string;
  type: TimeBlockType;
  note: string | null;
};

export type ScheduleDayData = {
  dateKey: string;
  /** UTC day start anchor for client-side `top` math. */
  dayStartIso: string;
  columns: ScheduleMasterColumn[];
  bookings: ScheduleBookingCell[];
  breaks: ScheduleBreakCell[];
};

export type ScheduleKpis = {
  bookingsCount: number;
  bookingsConfirmedCount: number;
  revenueKopeks: number;
  occupancyPercent: number;
  occupancyHoursDenominator: number;
  mastersOnShift: number;
  freeWindowsCount: number;
};

export type ScheduleWeekDay = {
  dateKey: string;
  weekdayLabel: string;
  dayNumber: number;
  isToday: boolean;
};

export type ScheduleWeekRow = {
  master: ScheduleMasterColumn;
  cells: Array<{
    dateKey: string;
    booked: number;
    capacity: number;
    percent: number;
    isDayOff: boolean;
  }>;
};

export type ScheduleWeekData = {
  days: ScheduleWeekDay[];
  rows: ScheduleWeekRow[];
};

export type StudioScheduleData = {
  dateKey: string;
  view: "day" | "week";
  day: ScheduleDayData;
  kpis: ScheduleKpis;
  week: ScheduleWeekData | null;
  /** Service catalogue passed to the create-booking dialog. */
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
};

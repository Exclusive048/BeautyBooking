import type { BookingStatus, TimeBlockType } from "@prisma/client";
import type { BookingStatusTone } from "../lib/booking-status-display";
import type { GridWindow } from "../lib/time-grid";

export type ScheduleMasterColumn = {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  reviewsCount: number;
  /** False when the master is paused in the studio (`Provider.studioPaused`) or not yet claimed. */
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
  /**
   * BOOKING-STUDIO-RESCHEDULE-PARITY-01: a client-proposed reschedule the
   * studio must accept/decline. Present (non-null) only when `status ===
   * CHANGE_REQUESTED`. Times are UTC ISO — display in salon-tz at the surface
   * via `formatLocalHm`. `actionRequiredBy === "MASTER"` = studio's turn.
   */
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /**
   * MOBILE-STUDIO-C (ops): пакет, в который входит запись. Отмена такой
   * записи — только пакетом (`cancelBooking` → `PACKAGE_CANCEL_WHOLE`).
   * У личной записи мастера — `null`.
   */
  bookingPackageId: string | null;
  /**
   * STUDIO-MASTER-OWN-BOOKINGS-01 — запись с личной страницы мастера студии
   * (`Booking.studioId = null`). Календарь показывает её, чтобы админ видел
   * занятость мастера (LOGIC-01), но студия ею не управляет (`auth/ownership.ts`
   * выводит право из `Booking.studioId`): ни данных клиента, ни действий.
   */
  isPersonal: boolean;
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
  /** Начало дня САЛОНА (полночь в его поясе) — якорь даты для диалогов и метки зоны. */
  dayStartIso: string;
  /** Окно сетки дня в часах салона: 09–21 и шире под часы мастеров и записи. */
  gridWindow: GridWindow;
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
  /**
   * MOBILE-POLISH: загрузка по НАСТОЯЩЕМУ графику мастера (`loadStudioWeekCells`,
   * как у приложения), а не «5 записей = 100%». Выходной — мастер недоступен
   * или день нерабочий по графику.
   */
  cells: Array<{
    dateKey: string;
    booked: number;
    /** Минуты записей дня. */
    bookedMinutes: number;
    /** Рабочие минуты без перерывов; `null` — день «Фиксированное время»; `0` — выходной. */
    capacityMinutes: number | null;
    /** Число фиксированных начал (день «Фиксированное время»), иначе `null`. */
    fixedSlots: number | null;
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
  /**
   * FIX-STUDIO-CALENDAR-SALON-TZ: the salon's own tz (`Provider.timezone`).
   * The day grid positions + labels appointment times in this tz so a
   * cross-tz admin (e.g. Moscow browser) sees the salon's local schedule,
   * not the browser's — matching the client-cabinet convention (QA-107).
   */
  timezone: string;
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

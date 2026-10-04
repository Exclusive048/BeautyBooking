import type { BookingStatus, TimeBlockType } from "@prisma/client";
import { resolveBookingRuntimeStatus, type BookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  resolveStudioBookingActions,
  studioBookingNeedsAnswer,
  type StudioBookingActions,
} from "@/lib/bookings/studio-actions";
import type { DayPlan } from "@/lib/schedule/types";
import { bookingToneFromRuntimeStatus, type BookingStatusTone } from "../lib/booking-status-display";
import type { GridWindow } from "../lib/time-grid";
import type { ScheduleDayData, ScheduleKpis } from "./types";

/**
 * MOBILE-STUDIO-C (ops) — день календаря студии для приложения
 * (`GET /api/cabinet/studio/calendar/day`) из сборки дня веба
 * (`loadStudioScheduleDay`): часы каждого мастера из плана дня движка,
 * записи студии с действиями (без телефона), личные записи мастеров — только
 * занятостью, блокировки студии — со всем, что нужно для правки.
 */

export type StudioDayMasterHours = {
  isWorking: boolean;
  intervals: Array<{ start: string; end: string }>;
  breaks: Array<{ start: string; end: string }>;
  fixedStarts: string[] | null;
};

export type StudioDayBookingJson = {
  id: string;
  masterId: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  status: BookingStatus;
  runtimeStatus: BookingRuntimeStatus;
  tone: BookingStatusTone;
  clientName: string;
  isNewClient: boolean;
  serviceId: string;
  serviceTitle: string;
  priceKopeks: number;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  bookingPackageId: string | null;
  needsAnswer: boolean;
  actions: StudioBookingActions;
};

export type StudioCalendarDayJson = {
  studioId: string;
  timezone: string;
  date: string;
  todayKey: string;
  dayStartUtc: string;
  gridWindow: GridWindow;
  masters: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    rating: number;
    reviewsCount: number;
    isAvailable: boolean;
    serviceIds: string[];
    hours: StudioDayMasterHours;
  }>;
  bookings: StudioDayBookingJson[];
  personalBusy: Array<{ id: string; masterId: string; startAtUtc: string; endAtUtc: string }>;
  blocks: Array<{
    id: string;
    masterId: string;
    startAtUtc: string;
    endAtUtc: string;
    type: TimeBlockType;
    note: string | null;
  }>;
  kpis: Omit<ScheduleKpis, "occupancyHoursDenominator">;
};

const DAY_OFF: StudioDayMasterHours = { isWorking: false, intervals: [], breaks: [], fixedStarts: null };

/**
 * Часы колонки из плана дня. Неактивный мастер и мастер без плана — выходной.
 * День «Фиксированное время» отдаёт выбранные начала (`fixedStarts`), а
 * отрезки — как хранит движок (сутки 00:00–23:55): рисовать по началам.
 */
export function studioDayMasterHours(plan: DayPlan | undefined, isAvailable: boolean): StudioDayMasterHours {
  if (!isAvailable || !plan?.isWorking) return DAY_OFF;
  return {
    isWorking: true,
    intervals: plan.workingIntervals.map(({ start, end }) => ({ start, end })),
    breaks: plan.breaks.map(({ start, end }) => ({ start, end })),
    fixedStarts: plan.fixedStarts ? [...plan.fixedStarts] : null,
  };
}

function minutesBetween(startIso: string, endIso: string): number {
  const diff = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
  return diff > 0 ? diff : 0;
}

export function toStudioCalendarDayJson(input: {
  studioId: string;
  timezone: string;
  todayKey: string;
  day: ScheduleDayData;
  kpis: ScheduleKpis;
  plans: Map<string, DayPlan>;
  now: Date;
}): StudioCalendarDayJson {
  const { day, now } = input;
  const bookings: StudioDayBookingJson[] = [];
  const personalBusy: StudioCalendarDayJson["personalBusy"] = [];

  for (const cell of day.bookings) {
    if (cell.isPersonal) {
      personalBusy.push({ id: cell.id, masterId: cell.masterId, startAtUtc: cell.startAtUtc, endAtUtc: cell.endAtUtc });
      continue;
    }
    const startAt = new Date(cell.startAtUtc);
    const endAt = new Date(cell.endAtUtc);
    const runtimeStatus = resolveBookingRuntimeStatus({ status: cell.status, startAtUtc: startAt, endAtUtc: endAt, now });
    const actions = resolveStudioBookingActions({
      status: cell.status,
      startAtUtc: startAt,
      endAtUtc: endAt,
      actionRequiredBy: cell.actionRequiredBy,
      proposedStartAt: cell.proposedStartAtUtc ? new Date(cell.proposedStartAtUtc) : null,
      proposedEndAt: cell.proposedEndAtUtc ? new Date(cell.proposedEndAtUtc) : null,
      bookingPackageId: cell.bookingPackageId,
      now,
    });
    bookings.push({
      id: cell.id,
      masterId: cell.masterId,
      startAtUtc: cell.startAtUtc,
      endAtUtc: cell.endAtUtc,
      durationMin: minutesBetween(cell.startAtUtc, cell.endAtUtc),
      status: cell.status,
      runtimeStatus,
      tone: bookingToneFromRuntimeStatus(runtimeStatus, cell.isNewClient),
      clientName: cell.clientName || "—",
      isNewClient: cell.isNewClient,
      serviceId: cell.serviceId,
      serviceTitle: cell.serviceTitle,
      priceKopeks: cell.priceKopeks,
      proposedStartAtUtc: cell.proposedStartAtUtc,
      proposedEndAtUtc: cell.proposedEndAtUtc,
      actionRequiredBy: cell.actionRequiredBy,
      bookingPackageId: cell.bookingPackageId,
      needsAnswer: studioBookingNeedsAnswer(actions),
      actions,
    });
  }

  return {
    studioId: input.studioId,
    timezone: input.timezone,
    date: day.dateKey,
    todayKey: input.todayKey,
    dayStartUtc: day.dayStartIso,
    gridWindow: day.gridWindow,
    masters: day.columns.map((column) => ({
      id: column.id,
      name: column.name,
      avatarUrl: column.avatarUrl,
      rating: column.rating,
      reviewsCount: column.reviewsCount,
      isAvailable: column.isAvailable,
      serviceIds: column.serviceIds,
      hours: studioDayMasterHours(input.plans.get(column.id), column.isAvailable),
    })),
    bookings,
    personalBusy,
    blocks: day.breaks.map((block) => ({
      id: block.id,
      masterId: block.masterId,
      startAtUtc: block.startAtUtc,
      endAtUtc: block.endAtUtc,
      type: block.type,
      note: block.note,
    })),
    kpis: {
      bookingsCount: input.kpis.bookingsCount,
      bookingsConfirmedCount: input.kpis.bookingsConfirmedCount,
      revenueKopeks: input.kpis.revenueKopeks,
      occupancyPercent: input.kpis.occupancyPercent,
      mastersOnShift: input.kpis.mastersOnShift,
      freeWindowsCount: input.kpis.freeWindowsCount,
    },
  };
}

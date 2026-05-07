import { BookingStatus } from "@prisma/client";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export type BookingClientRow = {
  id: string;
  status: BookingStatus;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientNameSnapshot: string | null;
  clientPhoneSnapshot: string | null;
  startAtUtc: Date | null;
  createdAt: Date;
  service: {
    name: string;
    title: string | null;
    price: number;
  };
  serviceItems: Array<{
    titleSnapshot: string;
    priceSnapshot: number;
  }>;
};

export type ClientAggregate = {
  key: string;
  clientUserId: string | null;
  phone: string;
  displayName: string;
  lastBookingAt: Date;
  lastVisitAt: Date | null;
  /** Earliest FINISHED visit. Null when the client has only upcoming or
   * non-completed bookings. Used by 27a's classifier to mark recent
   * arrivals as "Новые". */
  firstVisitAt: Date | null;
  lastServiceName: string;
  visitsCount: number;
  totalAmount: number;
};

const COMPLETED_STATUSES: BookingStatus[] = ["FINISHED"];

function resolveBookingPhone(booking: BookingClientRow): string | null {
  const source = booking.clientPhoneSnapshot?.trim() || booking.clientPhone?.trim() || "";
  if (!source) return null;
  return normalizeRussianPhone(source);
}

function resolveBookingName(booking: BookingClientRow): string {
  return booking.clientNameSnapshot?.trim() || booking.clientName.trim() || "Клиент";
}

function resolveServiceTitle(booking: BookingClientRow): string {
  const snapshot = booking.serviceItems[0]?.titleSnapshot?.trim();
  if (snapshot) return snapshot;
  return booking.service.title?.trim() || booking.service.name;
}

function resolveBookingAmount(booking: BookingClientRow): number {
  const snapshotSum = booking.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, booking.service.price);
}

function bookingSortDate(booking: BookingClientRow): Date {
  return booking.startAtUtc ?? booking.createdAt;
}

export function groupBookings(bookings: BookingClientRow[]): Map<string, ClientAggregate> {
  const grouped = new Map<string, ClientAggregate>();

  for (const booking of bookings) {
    const phone = resolveBookingPhone(booking);
    const userId = booking.clientUserId ?? null;
    if (!userId && !phone) continue;
    const key = userId ? `user:${userId}` : `phone:${phone}`;

    const visitDate = bookingSortDate(booking);
    const serviceTitle = resolveServiceTitle(booking);
    const displayName = resolveBookingName(booking);
    const safePhone = phone ?? "—";
    const bookingAmount = resolveBookingAmount(booking);
    const isCompleted = COMPLETED_STATUSES.includes(booking.status);

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        key,
        clientUserId: userId,
        phone: safePhone,
        displayName,
        lastBookingAt: visitDate,
        lastVisitAt: isCompleted ? visitDate : null,
        firstVisitAt: isCompleted ? visitDate : null,
        lastServiceName: serviceTitle,
        visitsCount: isCompleted ? 1 : 0,
        totalAmount: isCompleted ? bookingAmount : 0,
      });
      continue;
    }

    if (visitDate.getTime() > current.lastBookingAt.getTime()) {
      current.lastBookingAt = visitDate;
      current.lastServiceName = serviceTitle;
      current.displayName = displayName;
      current.phone = safePhone;
    }

    if (isCompleted) {
      current.visitsCount += 1;
      current.totalAmount += bookingAmount;
      if (!current.lastVisitAt || visitDate.getTime() > current.lastVisitAt.getTime()) {
        current.lastVisitAt = visitDate;
      }
      if (!current.firstVisitAt || visitDate.getTime() < current.firstVisitAt.getTime()) {
        current.firstVisitAt = visitDate;
      }
    }
  }

  return grouped;
}

export function applyProfileNames(
  grouped: Map<string, ClientAggregate>,
  profiles: Array<{ id: string; displayName: string | null }>
) {
  for (const profile of profiles) {
    const key = `user:${profile.id}`;
    const client = grouped.get(key);
    if (!client) continue;
    if (profile.displayName?.trim()) {
      client.displayName = profile.displayName.trim();
    }
  }
}

export function calculateDaysSinceLastVisit(lastVisitAt: Date | null, timeZone: string): number | null {
  if (!lastVisitAt) return null;
  const lastKey = toLocalDateKey(lastVisitAt, timeZone);
  const todayKey = toLocalDateKey(new Date(), timeZone);
  const lastDate = dateFromLocalDateKey(lastKey, timeZone);
  const todayDate = dateFromLocalDateKey(todayKey, timeZone);
  const diffMs = todayDate.getTime() - lastDate.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

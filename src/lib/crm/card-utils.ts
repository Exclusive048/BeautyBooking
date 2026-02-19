import type { BookingStatus } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { parseClientKey, type ClientKeyData } from "@/lib/crm/client-key";

export type BookingHistoryRow = {
  id: string;
  status: BookingStatus;
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

export function parseClientKeyOrThrow(clientKey: string): ClientKeyData {
  const parsed = parseClientKey(clientKey);
  if (!parsed) {
    throw new AppError("Некорректный ключ клиента", 400, "CLIENT_KEY_INVALID");
  }
  return parsed;
}

export function buildPhoneVariants(normalized: string): string[] {
  if (!normalized.startsWith("+7") || normalized.length !== 12) {
    return [normalized];
  }
  const digits = normalized.slice(2);
  return [normalized, `7${digits}`, `8${digits}`, `+8${digits}`];
}

export function resolveServiceTitle(booking: BookingHistoryRow): string {
  const snapshot = booking.serviceItems[0]?.titleSnapshot?.trim();
  if (snapshot) return snapshot;
  return booking.service.title?.trim() || booking.service.name;
}

export function resolveBookingAmount(booking: BookingHistoryRow): number {
  const snapshotSum = booking.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, booking.service.price);
}

export function resolveBookingDate(booking: BookingHistoryRow): Date {
  return booking.startAtUtc ?? booking.createdAt;
}

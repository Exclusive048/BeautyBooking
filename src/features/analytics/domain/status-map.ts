import { BookingStatus } from "@prisma/client";

export const STATUS_CREATED: BookingStatus[] = [
  "NEW",
  "PENDING",
  "CONFIRMED",
  "PREPAID",
  "STARTED",
  "IN_PROGRESS",
  "FINISHED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
];

export const STATUS_CONFIRMED: BookingStatus[] = [
  "CONFIRMED",
  "PREPAID",
  "STARTED",
  "IN_PROGRESS",
];

export const STATUS_COMPLETED: BookingStatus[] = ["FINISHED"];

export const STATUS_CANCELLED: BookingStatus[] = ["CANCELLED", "REJECTED"];

export const STATUS_NO_SHOW: BookingStatus[] = ["NO_SHOW"];

export const STATUS_OCCUPANCY: BookingStatus[] = [...STATUS_CONFIRMED, ...STATUS_COMPLETED];

export const STATUS_REVENUE: BookingStatus[] = [...STATUS_COMPLETED, ...STATUS_CONFIRMED];

export function buildCompletedWhere(now: Date) {
  return {
    OR: [
      { status: { in: STATUS_COMPLETED } },
      {
        status: { in: STATUS_CONFIRMED },
        endAtUtc: { lt: now },
      },
    ],
  };
}

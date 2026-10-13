import { BookingStatus } from "@/lib/prisma-enums";

/**
 * UX-PASS-01 — фильтр статуса журнала записей студии — ГРУППЫ статусов, а не
 * сырые значения enum. Прежний список (PENDING / CONFIRMED / IN_PROGRESS /
 * FINISHED / NO_SHOW / CANCELLED) не совпадал с тем, что лежит в базе:
 * отменённая запись хранится как REJECTED (`cancelBooking`), согласуемый
 * перенос — CHANGE_REQUESTED, оплаченная — PREPAID, и «Отменена» не находила
 * ни одной отмены, а неподтверждённые NEW и запросы переноса не попадали ни
 * под один пункт.
 *
 * Группы — те же, что у журнала приложения (`GET /api/cabinet/studio/bookings
 * ?status=`), один источник для обоих. Клиент-безопасен (значения enum — из
 * `@/lib/prisma-enums`).
 */
export const STUDIO_BOOKING_STATUS_GROUPS = {
  awaiting: [BookingStatus.NEW, BookingStatus.PENDING, BookingStatus.CHANGE_REQUESTED],
  confirmed: [
    BookingStatus.CONFIRMED,
    BookingStatus.PREPAID,
    BookingStatus.STARTED,
    BookingStatus.IN_PROGRESS,
  ],
  finished: [BookingStatus.FINISHED],
  cancelled: [BookingStatus.REJECTED, BookingStatus.CANCELLED],
  no_show: [BookingStatus.NO_SHOW],
} as const satisfies Record<string, readonly BookingStatus[]>;

export type StudioBookingStatusGroup = keyof typeof STUDIO_BOOKING_STATUS_GROUPS;

/** Порядок пунктов в фильтре. */
export const STUDIO_BOOKING_STATUS_GROUP_IDS = [
  "awaiting",
  "confirmed",
  "finished",
  "cancelled",
  "no_show",
] as const satisfies readonly StudioBookingStatusGroup[];

function isGroup(value: string): value is StudioBookingStatusGroup {
  return Object.prototype.hasOwnProperty.call(STUDIO_BOOKING_STATUS_GROUPS, value);
}

/**
 * `?status=` → группа. Старые ссылки с одиночным статусом (`?status=PENDING`)
 * ведут в группу, где этот статус лежит; прочее — «все записи».
 */
export function parseStudioBookingStatusGroup(
  value: string | undefined,
): StudioBookingStatusGroup | "all" {
  if (!value || value === "all") return "all";
  if (isGroup(value)) return value;
  for (const group of STUDIO_BOOKING_STATUS_GROUP_IDS) {
    if ((STUDIO_BOOKING_STATUS_GROUPS[group] as readonly string[]).includes(value)) {
      return group;
    }
  }
  return "all";
}

/** Группа → условие `status` для `listStudioBookings`. */
export function studioBookingStatusFilter(
  group: StudioBookingStatusGroup | "all",
): BookingStatus[] | "all" {
  return group === "all" ? "all" : [...STUDIO_BOOKING_STATUS_GROUPS[group]];
}

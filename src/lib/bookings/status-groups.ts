import { BookingStatus } from "@/lib/prisma-enums";

/**
 * Группы статусов журнала записей — фильтр «Статус» в кабинетах мастера и
 * студии и `?status=` журнала приложения (`GET /api/cabinet/studio/bookings`).
 *
 * UX-PASS-01: фильтр — ГРУППЫ, а не сырые значения enum. Прежний список
 * (PENDING / CONFIRMED / IN_PROGRESS / FINISHED / NO_SHOW / CANCELLED) не
 * совпадал с тем, что лежит в базе: отменённая запись хранится как REJECTED
 * (`cancelBooking`), согласуемый перенос — CHANGE_REQUESTED, оплаченная —
 * PREPAID, и «Отменена» не находила ни одной отмены, а неподтверждённые NEW и
 * запросы переноса не попадали ни под один пункт.
 *
 * BOOKINGS-JOURNAL (2026-10-31): модуль переехал из кабинета студии — тем же
 * фильтром пользуется журнал мастера. Клиент-безопасен (значения enum — из
 * `@/lib/prisma-enums`).
 */
export const BOOKING_STATUS_GROUPS = {
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

export type BookingStatusGroup = keyof typeof BOOKING_STATUS_GROUPS;

/** Порядок пунктов в фильтре. */
export const BOOKING_STATUS_GROUP_IDS = [
  "awaiting",
  "confirmed",
  "finished",
  "cancelled",
  "no_show",
] as const satisfies readonly BookingStatusGroup[];

function isGroup(value: string): value is BookingStatusGroup {
  return Object.prototype.hasOwnProperty.call(BOOKING_STATUS_GROUPS, value);
}

/**
 * `?status=` → группа. Старые ссылки с одиночным статусом (`?status=PENDING`)
 * ведут в группу, где этот статус лежит; прочее — «все записи».
 */
export function parseBookingStatusGroup(value: string | undefined): BookingStatusGroup | "all" {
  if (!value || value === "all") return "all";
  if (isGroup(value)) return value;
  for (const group of BOOKING_STATUS_GROUP_IDS) {
    if ((BOOKING_STATUS_GROUPS[group] as readonly string[]).includes(value)) {
      return group;
    }
  }
  return "all";
}

/** Группа → список статусов для условия `status: { in }`; «все» — `"all"`. */
export function bookingStatusGroupFilter(group: BookingStatusGroup | "all"): BookingStatus[] | "all" {
  return group === "all" ? "all" : [...BOOKING_STATUS_GROUPS[group]];
}

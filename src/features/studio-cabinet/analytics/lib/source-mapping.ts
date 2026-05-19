import { BookingSource } from "@prisma/client";

/**
 * BookingSource → user-facing label. Only the 3 enum values that exist
 * in the schema — no fabricated «Сарафан» / «Соцсети» (those would
 * require new tracking infrastructure not present today). Donut chart
 * silently drops sources with `count === 0` so a studio with only
 * WEB + MANUAL traffic sees 2 slices, not 3 with a zero-width APP.
 */
export const SOURCE_LABEL: Record<BookingSource, string> = {
  WEB: "Каталог",
  MANUAL: "Звонок",
  APP: "Приложение",
};

export const SOURCE_TONE: Record<BookingSource, string> = {
  WEB: "bg-emerald-500",
  MANUAL: "bg-blue-500",
  APP: "bg-violet-500",
};

export const SOURCE_RING: Record<BookingSource, string> = {
  WEB: "stroke-emerald-500",
  MANUAL: "stroke-blue-500",
  APP: "stroke-violet-500",
};

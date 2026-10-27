import type {
  AdminEventCategory,
  AdminEventType,
} from "@/features/admin-cabinet/dashboard/types";

/**
 * ADMIN-EVENTS-02 — источники «Истории событий» в порядке выдачи. Порядок
 * значим: события одного момента идут в этом порядке, и на нём держится
 * курсор «Показать ещё» (`events.service.ts`). Client-safe.
 */
export const ADMIN_EVENT_TYPES: readonly AdminEventType[] = [
  "booking",
  "booking_cancel",
  "registration",
  "cabinet_created",
  "subscription",
  "payment",
  "review",
  "complaint",
  "content_report",
  "admin_action",
];

/** Сколько последних событий показывает виджет дашборда. */
export const ADMIN_DASHBOARD_EVENTS = 10;
/** Страница «Истории событий»: первая загрузка и «Показать ещё». */
export const ADMIN_EVENTS_HISTORY_PAGE = 50;

/** Вкладки фильтра → источники. «Все» — все источники. */
export const ADMIN_EVENT_CATEGORY_TYPES: Record<
  Exclude<AdminEventCategory, "all">,
  readonly AdminEventType[]
> = {
  bookings: ["booking", "booking_cancel"],
  users: ["registration", "cabinet_created"],
  billing: ["subscription", "payment"],
  reviews: ["review", "complaint", "content_report"],
  admin: ["admin_action"],
};

export const ADMIN_EVENT_CATEGORIES: readonly AdminEventCategory[] = [
  "all",
  "bookings",
  "users",
  "billing",
  "reviews",
  "admin",
];

export function parseAdminEventCategory(value: string | null | undefined): AdminEventCategory {
  return (ADMIN_EVENT_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as AdminEventCategory)
    : "all";
}

export function adminEventTypesFor(category: AdminEventCategory): readonly AdminEventType[] {
  return category === "all" ? ADMIN_EVENT_TYPES : ADMIN_EVENT_CATEGORY_TYPES[category];
}

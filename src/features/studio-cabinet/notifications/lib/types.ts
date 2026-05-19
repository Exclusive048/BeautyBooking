/**
 * STUDIO-NOTIFICATIONS-A — types for the studio cabinet notifications page.
 *
 * The studio cabinet feed mirrors the master 26-NOTIF redesign but uses a
 * different bucketing (10 chips vs master's 8 tabs) because studio scope
 * adds Team + Finance categories on top of the booking/review/system mix.
 *
 * Cabinet/room concepts intentionally absent — no schema model exists,
 * no notification type covers "кабинет N", so the spec's «Кабинеты»
 * chip + «Кабинет N» line are dropped.
 */

import type { NotificationCenterNotificationItem } from "@/lib/notifications/center";
import type { NotificationDayGroup, NotificationSort } from "@/features/master/components/notifications/lib/group-by-day";

export type StudioNotificationChip =
  | "all"
  | "unread"
  | "bookings"
  | "cancellations"
  | "reschedules"
  | "reviews"
  | "messages"
  | "team"
  | "finance"
  | "system";

export type StudioNotificationsKpi = {
  unreadCount: number;
  totalCount: number;
  todayCount: number;
  /** Pending actions awaiting the owner/admin — currently
   *  ScheduleChangeRequest pseudo-notifications (PENDING). */
  needsDecisionCount: number;
  pushEnabled: boolean;
};

export type StudioNotificationsChipCounts = Record<StudioNotificationChip, number>;

export type StudioNotificationsData = {
  kpi: StudioNotificationsKpi;
  chipCounts: StudioNotificationsChipCounts;
  groups: NotificationDayGroup[];
  activeChip: StudioNotificationChip;
  sort: NotificationSort;
};

export function isStudioNotificationChip(value: unknown): value is StudioNotificationChip {
  return (
    value === "all" ||
    value === "unread" ||
    value === "bookings" ||
    value === "cancellations" ||
    value === "reschedules" ||
    value === "reviews" ||
    value === "messages" ||
    value === "team" ||
    value === "finance" ||
    value === "system"
  );
}

export type { NotificationCenterNotificationItem, NotificationDayGroup, NotificationSort };

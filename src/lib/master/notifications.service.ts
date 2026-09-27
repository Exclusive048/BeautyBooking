import { cache } from "react";
import { getPendingBookingsCountForMaster } from "@/lib/bookings/counts";
import {
  getNotificationCenterData,
  type NotificationCenterNotificationItem,
} from "@/lib/notifications/center";
import { prisma } from "@/lib/prisma";
import { getUnansweredReviewsCountForMaster } from "@/lib/reviews/counts";
import {
  classifyTabBucket,
  type NotificationTabId,
} from "@/features/master/components/notifications/lib/card-config";
import {
  groupNotificationsByDay,
  type NotificationDayGroup,
  type NotificationSort,
} from "@/features/master/components/notifications/lib/group-by-day";
import { toLocalDateKey } from "@/lib/schedule/timezone";

const DEFAULT_DISPLAY_TIMEZONE = "Europe/Moscow";

export type MasterNotificationsKpi = {
  unreadCount: number;
  totalCount: number;
  todayCount: number;
  waitingCount: number;
  pushEnabled: boolean;
};

export type MasterNotificationsData = {
  kpi: MasterNotificationsKpi;
  tabCounts: Record<NotificationTabId, number>;
  groups: NotificationDayGroup[];
  activeTab: NotificationTabId;
  sort: NotificationSort;
};

const VALID_TABS: ReadonlySet<NotificationTabId> = new Set([
  "all",
  "unread",
  "new_booking",
  "cancelled",
  "rescheduled",
  "reminder",
  "review",
  "message",
  "system",
]);

export function parseTab(value: string | undefined | null): NotificationTabId {
  return value && VALID_TABS.has(value as NotificationTabId)
    ? (value as NotificationTabId)
    : "all";
}

export function parseSort(value: string | undefined | null): NotificationSort {
  return value === "oldest" ? "oldest" : "newest";
}

// FIX-04 (QA-113): "today" computed in the master's own timezone (self-view),
// not the Node process TZ.
function isToday(iso: string, now: Date, timeZone: string): boolean {
  return toLocalDateKey(new Date(iso), timeZone) === toLocalDateKey(now, timeZone);
}

function applyTabFilter(
  items: NotificationCenterNotificationItem[],
  tab: NotificationTabId
): NotificationCenterNotificationItem[] {
  if (tab === "all") return items;
  if (tab === "unread") return items.filter((item) => !item.isRead);
  return items.filter((item) => classifyTabBucket(item.type) === tab);
}

const getPushEnabled = cache(async (userId: string): Promise<boolean> => {
  const count = await prisma.pushSubscription.count({ where: { userId } });
  return count > 0;
});

/**
 * Aggregates everything the master notifications page needs in one pass:
 *
 * - KPI tiles: unread/total counts, today's count, "waiting for me" count
 *   (pending bookings + unanswered reviews), push status.
 * - Tab counts: number of notifications per filter bucket. Computed from
 *   the same source list so the badge in the tab bar always matches what
 *   the user sees after switching to that tab.
 * - Day-grouped list: filtered by active tab, sorted by the chosen
 *   direction, then bucketed into Today / Yesterday / dated days.
 *
 * Everything is master-channel only — relies on the existing
 * `classifyNotificationChannel` machinery in `getNotificationCenterData`,
 * filtering to `channel === "MASTER"` once and feeding the rest of the
 * pipeline. Studio invites are explicitly dropped (they live on the
 * personal `/notifications` surface).
 */
export async function getMasterNotificationsData(input: {
  userId: string;
  masterId: string;
  /** STUDIO-MASTER-PROFILES (этап 4): рабочие профили мастера — для счётчика записей. */
  workProfileIds?: readonly string[];
  phone: string | null;
  activeTab: NotificationTabId;
  sort: NotificationSort;
  now?: Date;
}): Promise<MasterNotificationsData> {
  const now = input.now ?? new Date();

  const [center, pendingBookings, unansweredReviews, pushEnabled, providerTz] = await Promise.all([
    getNotificationCenterData({ userId: input.userId, phone: input.phone }),
    getPendingBookingsCountForMaster(input.workProfileIds ?? input.masterId),
    getUnansweredReviewsCountForMaster(input.masterId),
    getPushEnabled(input.userId),
    prisma.provider.findUnique({ where: { id: input.masterId }, select: { timezone: true } }),
  ]);

  const timeZone = providerTz?.timezone ?? DEFAULT_DISPLAY_TIMEZONE;
  const masterItems = center.notifications.filter((item) => item.channel === "MASTER");

  const totalCount = masterItems.length;
  const unreadCount = masterItems.filter((item) => !item.isRead).length;
  const todayCount = masterItems.filter((item) => isToday(item.createdAt, now, timeZone)).length;
  const waitingCount = pendingBookings + unansweredReviews;

  const tabCounts: Record<NotificationTabId, number> = {
    all: totalCount,
    unread: unreadCount,
    new_booking: 0,
    cancelled: 0,
    rescheduled: 0,
    reminder: 0,
    review: 0,
    message: 0,
    system: 0,
  };
  for (const item of masterItems) {
    const bucket = classifyTabBucket(item.type);
    tabCounts[bucket] += 1;
  }

  const filtered = applyTabFilter(masterItems, input.activeTab);
  const groups = groupNotificationsByDay(filtered, input.sort, now, timeZone);

  return {
    kpi: { unreadCount, totalCount, todayCount, waitingCount, pushEnabled },
    tabCounts,
    groups,
    activeTab: input.activeTab,
    sort: input.sort,
  };
}

import {
  getNotificationCenterData,
  type NotificationCenterNotificationItem,
} from "@/lib/notifications/center";
import { prisma } from "@/lib/prisma";
import {
  classifyTabBucket,
  type NotificationTabId,
} from "@/features/master/components/notifications/lib/card-config";
import {
  groupNotificationsByDay,
  type NotificationDayGroup,
  type NotificationSort,
} from "@/features/master/components/notifications/lib/group-by-day";

const DEFAULT_DISPLAY_TIMEZONE = "Europe/Moscow";

export type MasterNotificationsData = {
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

function applyTabFilter(
  items: NotificationCenterNotificationItem[],
  tab: NotificationTabId
): NotificationCenterNotificationItem[] {
  if (tab === "all") return items;
  if (tab === "unread") return items.filter((item) => !item.isRead);
  return items.filter((item) => classifyTabBucket(item.type) === tab);
}

/**
 * Aggregates everything the master notifications page needs in one pass:
 *
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
  phone: string | null;
  activeTab: NotificationTabId;
  sort: NotificationSort;
  now?: Date;
}): Promise<MasterNotificationsData> {
  const now = input.now ?? new Date();

  const [center, providerTz] = await Promise.all([
    getNotificationCenterData({ userId: input.userId, phone: input.phone }),
    prisma.provider.findUnique({ where: { id: input.masterId }, select: { timezone: true } }),
  ]);

  const timeZone = providerTz?.timezone ?? DEFAULT_DISPLAY_TIMEZONE;
  const masterItems = center.notifications.filter((item) => item.channel === "MASTER");

  const tabCounts: Record<NotificationTabId, number> = {
    all: masterItems.length,
    unread: masterItems.filter((item) => !item.isRead).length,
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
    tabCounts,
    groups,
    activeTab: input.activeTab,
    sort: input.sort,
  };
}

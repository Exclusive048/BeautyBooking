import { prisma } from "@/lib/prisma";
import {
  getNotificationCenterData,
  type NotificationCenterNotificationItem,
} from "@/lib/notifications/center";
import { groupNotificationsByDay } from "@/features/master/components/notifications/lib/group-by-day";
import { classifyStudioChip } from "../lib/chip-classifier";

const DEFAULT_DISPLAY_TIMEZONE = "Europe/Moscow";
import type {
  NotificationSort,
  StudioNotificationChip,
  StudioNotificationsChipCounts,
  StudioNotificationsData,
} from "../lib/types";

/**
 * STUDIO-NOTIFICATIONS-A — aggregates everything the studio notifications
 * page needs in one pass.
 *
 * Reuses two pieces of 26-NOTIF infrastructure verbatim:
 *   1. `getNotificationCenterData` (src/lib/notifications/center.ts) —
 *      already resolves the per-notification channel ("MASTER" / "STUDIO"
 *      / "SYSTEM") and injects pseudo-notifications for PENDING
 *      ScheduleChangeRequest rows (channel "STUDIO", type
 *      "SCHEDULE_REQUEST", id prefixed `schedule-request:`).
 *   2. `groupNotificationsByDay` — date bucketing + sort.
 *
 * Studio scope is `channel === "STUDIO"`. The current user (admin/owner)
 * sees notifications addressed to *them* — Notification has a single
 * `userId` recipient column, so studio-event delivery (see
 * `studio-notifications.ts` in `src/lib/notifications/`) sends to the
 * owner. There's no multi-cast model and no "studio-wide" address; this
 * service matches the existing delivery semantics.
 */

const VALID_CHIPS: ReadonlySet<StudioNotificationChip> = new Set([
  "all",
  "unread",
  "bookings",
  "cancellations",
  "reschedules",
  "reviews",
  "messages",
  "team",
  "finance",
  "system",
]);

export function parseStudioChip(value: string | null | undefined): StudioNotificationChip {
  return value && VALID_CHIPS.has(value as StudioNotificationChip)
    ? (value as StudioNotificationChip)
    : "all";
}

export function parseStudioSort(value: string | null | undefined): NotificationSort {
  return value === "oldest" ? "oldest" : "newest";
}

function applyChipFilter(
  items: NotificationCenterNotificationItem[],
  chip: StudioNotificationChip,
): NotificationCenterNotificationItem[] {
  if (chip === "all") return items;
  if (chip === "unread") return items.filter((item) => !item.isRead);
  return items.filter((item) => classifyStudioChip(item.type) === chip);
}

export type LoadStudioNotificationsInput = {
  userId: string;
  /** Studio's provider id — used to render "today" grouping in the studio's own TZ (FIX-04 / QA-113). */
  studioProviderId: string;
  phone: string | null;
  activeChip: StudioNotificationChip;
  sort: NotificationSort;
  now?: Date;
};

export async function loadStudioNotificationsData(
  input: LoadStudioNotificationsInput,
): Promise<StudioNotificationsData> {
  const now = input.now ?? new Date();

  const [center, providerTz] = await Promise.all([
    getNotificationCenterData({ userId: input.userId, phone: input.phone }),
    prisma.provider.findUnique({ where: { id: input.studioProviderId }, select: { timezone: true } }),
  ]);

  const timeZone = providerTz?.timezone ?? DEFAULT_DISPLAY_TIMEZONE;
  const studioItems = center.notifications.filter((item) => item.channel === "STUDIO");

  const chipCounts: StudioNotificationsChipCounts = {
    all: studioItems.length,
    unread: studioItems.filter((item) => !item.isRead).length,
    bookings: 0,
    cancellations: 0,
    reschedules: 0,
    reviews: 0,
    messages: 0,
    team: 0,
    finance: 0,
    system: 0,
  };
  for (const item of studioItems) {
    const bucket = classifyStudioChip(item.type);
    chipCounts[bucket] += 1;
  }

  const filtered = applyChipFilter(studioItems, input.activeChip);
  const groups = groupNotificationsByDay(filtered, input.sort, now, timeZone);

  return {
    chipCounts,
    groups,
    timeZone,
    activeChip: input.activeChip,
    sort: input.sort,
  };
}

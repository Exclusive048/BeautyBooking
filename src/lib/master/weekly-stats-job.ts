import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as cache from "@/lib/cache/cache";
import { deliverNotification } from "@/lib/notifications/delivery";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError, logInfo } from "@/lib/logging/logger";
import { UI_TEXT } from "@/lib/ui/text";

const DEDUP_KEY_PREFIX = "weekly-stats:sent";
const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // 8 days
const BATCH_SIZE = 50;

function getWeekBounds(mondayUtc: Date): { weekStart: Date; weekEnd: Date } {
  const weekStart = new Date(mondayUtc);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  return { weekStart, weekEnd };
}

function getPreviousWeekBounds(weekStart: Date): { prevStart: Date; prevEnd: Date } {
  const prevEnd = new Date(weekStart);
  const prevStart = new Date(weekStart);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  return { prevStart, prevEnd };
}

function getWeekKey(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

function buildMotivation(
  bookings: number,
  prevBookings: number | null
): string {
  if (prevBookings === null) {
    return UI_TEXT.notifications.weeklyStats.motivationFirst;
  }
  if (prevBookings === 0 || bookings > prevBookings) {
    const pct =
      prevBookings === 0
        ? 100
        : Math.round(((bookings - prevBookings) / prevBookings) * 100);
    return UI_TEXT.notifications.weeklyStats.motivationGrowth(pct);
  }
  return UI_TEXT.notifications.weeklyStats.motivationDecline;
}

async function getWeekStats(
  providerId: string,
  start: Date,
  end: Date
): Promise<{ bookings: number; revenue: number }> {
  const rows = await prisma.booking.findMany({
    where: {
      providerId,
      status: "FINISHED",
      startAtUtc: { gte: start, lt: end },
    },
    select: {
      serviceItems: { select: { priceSnapshot: true } },
    },
  });

  const bookings = rows.length;
  const revenue = rows.reduce(
    (sum, b) =>
      sum +
      b.serviceItems.reduce(
        (s, item) => s + Math.max(0, item.priceSnapshot),
        0
      ),
    0
  );

  return { bookings, revenue };
}

async function processOneMaster(input: {
  providerId: string;
  ownerUserId: string;
  weekStart: Date;
  weekKey: string;
}): Promise<void> {
  const { providerId, ownerUserId, weekStart, weekKey } = input;

  const dedupKey = `${DEDUP_KEY_PREFIX}:${providerId}:${weekKey}`;
  const isFirst = await cache.setNx(dedupKey, "1", DEDUP_TTL_SECONDS);
  if (!isFirst) return;

  const { weekStart: ws, weekEnd: we } = getWeekBounds(weekStart);
  const { bookings, revenue } = await getWeekStats(providerId, ws, we);

  if (bookings === 0) {
    await cache.del(dedupKey);
    return;
  }

  const { prevStart, prevEnd } = getPreviousWeekBounds(ws);
  const prev = await getWeekStats(providerId, prevStart, prevEnd);

  const title = UI_TEXT.notifications.weeklyStats.title;
  const body = UI_TEXT.notifications.weeklyStats.body(bookings, revenue);
  const motivation = buildMotivation(bookings, prev.bookings > 0 ? prev.bookings : null);
  const fullBody = `${body}. ${motivation}`;

  const appUrl = getAppPublicUrl();
  const pushUrl = "/cabinet/master/analytics";
  const telegramText = `📊 ${title}\n${body}\n${motivation}${appUrl ? `\n${appUrl}${pushUrl}` : ""}`;

  await deliverNotification({
    userId: ownerUserId,
    type: NotificationType.MASTER_WEEKLY_STATS,
    title,
    body: fullBody,
    payloadJson: {
      providerId,
      weekStart: ws.toISOString(),
      bookings,
      revenue,
    },
    bookingId: null,
    pushUrl,
    telegramText,
  });
}

export async function runWeeklyStatsJob(now = new Date()): Promise<void> {
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
  if (dayOfWeek !== 1) return;

  const weekKey = getWeekKey(now);
  const runGuardKey = `weekly-stats:run:${weekKey}`;
  const isFirstRun = await cache.setNx(runGuardKey, "1", DEDUP_TTL_SECONDS);
  if (!isFirstRun) return;

  logInfo("runWeeklyStatsJob started", { weekKey });

  let cursor: string | undefined;
  let processed = 0;
  let sent = 0;

  try {
    while (true) {
      const providers = await prisma.provider.findMany({
        where: {
          type: "MASTER",
          isPublished: true,
          ownerUserId: { not: null },
        },
        select: { id: true, ownerUserId: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (providers.length === 0) break;

      for (const provider of providers) {
        if (!provider.ownerUserId) continue;
        try {
          await processOneMaster({
            providerId: provider.id,
            ownerUserId: provider.ownerUserId,
            weekStart: now,
            weekKey,
          });
          sent++;
        } catch (error) {
          logError("Weekly stats: failed to process master", {
            providerId: provider.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        processed++;
      }

      cursor = providers[providers.length - 1]?.id;
      if (providers.length < BATCH_SIZE) break;
    }
  } catch (error) {
    await cache.del(runGuardKey);
    logError("runWeeklyStatsJob failed, run guard cleared", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  logInfo("runWeeklyStatsJob completed", { weekKey, processed, sent });
}

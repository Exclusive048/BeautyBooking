import { NotificationType } from "@prisma/client";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { listStudioMasterProfiles } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import * as cache from "@/lib/cache/cache";
import {
  claimNotificationDedup,
  NotificationDedupUnavailableError,
} from "@/lib/notifications/dedup-guard";
import { deliverNotification } from "@/lib/notifications/delivery";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError, logInfo } from "@/lib/logging/logger";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

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

/**
 * Записи и выручка за неделю по ВСЕМ рабочим профилям мастера (личный + профили
 * в студиях) — то же правило, что у главной кабинета (`masterPerformedBookingWhere`).
 * Выручка — в копейках.
 */
async function getWeekStats(
  providerIds: string[],
  start: Date,
  end: Date
): Promise<{ bookings: number; revenueKopeks: number }> {
  const rows = await prisma.booking.findMany({
    where: {
      ...masterPerformedBookingWhere(providerIds),
      status: "FINISHED",
      startAtUtc: { gte: start, lt: end },
    },
    select: {
      serviceItems: { select: { priceSnapshot: true } },
    },
  });

  const bookings = rows.length;
  const revenueKopeks = rows.reduce(
    (sum, b) =>
      sum +
      b.serviceItems.reduce(
        (s, item) => s + Math.max(0, item.priceSnapshot),
        0
      ),
    0
  );

  return { bookings, revenueKopeks };
}

async function processOneMaster(input: {
  providerId: string;
  ownerUserId: string;
  weekStart: Date;
  weekKey: string;
}): Promise<void> {
  const { providerId, ownerUserId, weekStart, weekKey } = input;

  const dedupKey = `${DEDUP_KEY_PREFIX}:${providerId}:${weekKey}`;
  // FIX-C11: недоступный сторож = не рассылать (бросает). Дубликат «статистики
  // за неделю» виден пользователю; пропуск ждёт следующего тика планировщика.
  const isFirst = await claimNotificationDedup(dedupKey, DEDUP_TTL_SECONDS);
  if (!isFirst) return;

  const { weekStart: ws, weekEnd: we } = getWeekBounds(weekStart);
  const studioProfiles = await listStudioMasterProfiles(ownerUserId);
  const profileIds = [providerId, ...studioProfiles.map((profile) => profile.id)];
  const { bookings, revenueKopeks } = await getWeekStats(profileIds, ws, we);

  if (bookings === 0) {
    await cache.del(dedupKey);
    return;
  }

  const { prevStart, prevEnd } = getPreviousWeekBounds(ws);
  const prev = await getWeekStats(profileIds, prevStart, prevEnd);

  const title = UI_TEXT.notifications.weeklyStats.title;
  const body = UI_TEXT.notifications.weeklyStats.body(bookings, UI_FMT.priceLabel(revenueKopeks));
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
      revenueKopeks,
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
  // FIX-C11: та же семантика, что у сторожа на мастера, — прогон не начинается,
  // если посчитать «первый ли он» не удалось.
  const isFirstRun = await claimNotificationDedup(runGuardKey, DEDUP_TTL_SECONDS);
  if (!isFirstRun) return;

  logInfo("runWeeklyStatsJob started", { weekKey });

  let cursor: string | undefined;
  let processed = 0;
  let sent = 0;

  try {
    while (true) {
      const providers = await prisma.provider.findMany({
        // Один раз на человека — по ЛИЧНОМУ профилю (у него `MasterProfile`);
        // записи профилей в студиях считаются внутри. Профиль в студии всегда
        // `isPublished = false`, и раньше мастер, работающий только через
        // студию, сводки не получал вовсе.
        where: {
          type: "MASTER",
          masterProfile: { isNot: null },
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
          /**
           * FIX-C12 — отказ СТОРОЖА пробрасывается, отказ по МАСТЕРУ гасится.
           *
           * 🔴 Тот же класс, что у `slot-freed`, но с худшим исходом, и он был
           * не замечен FIX-C11: сторож стоит внутри цикла, а его отказ —
           * свойство прогона. Пока `NotificationDedupUnavailableError` гасился
           * здесь наравне с ошибкой конкретного мастера, обрыв Redis в середине
           * прогона давал: каждый оставшийся мастер падает и логируется, цикл
           * доходит до конца, внешний `catch` НЕ срабатывает — и `runGuardKey`
           * остаётся стоять с TTL 8 суток. То есть недельная статистика молча
           * пропускалась ДЛЯ ВСЕХ на всю неделю, и почасовой ретрай (см. ниже)
           * её не восстанавливал, потому что сторож прогона уже занят.
           *
           * Проброс уводит управление во внешний `catch`, который снимает
           * `runGuardKey` — и следующий часовой тик понедельника начинает
           * прогон заново. Ошибка КОНКРЕТНОГО мастера (БД, доставка)
           * по-прежнему не должна ронять прогон: она гасится.
           */
          if (error instanceof NotificationDedupUnavailableError) throw error;
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

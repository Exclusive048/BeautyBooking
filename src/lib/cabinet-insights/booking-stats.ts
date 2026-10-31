import type { BookingCancelledBy, BookingSource, BookingStatus } from "@prisma/client";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import { CABINET_AHEAD_DAYS, CABINET_HISTORY_DAYS, type CabinetBookingFacts } from "./types";

/**
 * AI-CABINET-ANALYSIS — статистика записей кабинета из уже прочитанных строк.
 * Чистая функция: загрузчик (`facts.ts`) читает записи одним запросом, всё
 * остальное считается здесь и пиннится `booking-stats.test.ts`.
 *
 * Окно истории — записи, чьё НАЧАЛО попало в последние 90 дней; окно «впереди»
 * — 14 дней от сейчас. Дни недели и время суток — пояс салона (rule 17).
 */

export type InsightBookingRow = {
  status: BookingStatus;
  cancelledBy: BookingCancelledBy | null;
  source: BookingSource;
  createdAt: Date;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  /** Ключ клиента: аккаунт либо нормализованный телефон (`resolveBookingClientKey`). */
  clientKey: string | null;
  serviceId: string | null;
  /** Исполнитель; у записи соло-мастера — он сам. */
  masterProviderId: string | null;
};

export type InsightBookingStats = {
  facts: CabinetBookingFacts;
  /** Записей на услугу за окно истории, кроме отменённых. */
  bookingsByService: Map<string, number>;
  /** Минут живых записей в окне «впереди» — всего и по исполнителю. */
  bookedMinutesAhead: number;
  bookedMinutesAheadByMaster: Map<string, number>;
  /** Состоявшихся визитов за окно истории по исполнителю. */
  completedByMaster: Map<string, number>;
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Ниже этого числа доли и средние не считаются — по трём записям выводов не делают. */
export const MIN_SAMPLE = 5;
/** Самые занятые дни недели называются только при таком числе визитов. */
const MIN_WEEKDAY_SAMPLE = 10;

const LIVE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "NEW",
  "PENDING",
  "CONFIRMED",
  "CHANGE_REQUESTED",
  "PREPAID",
  "STARTED",
  "IN_PROGRESS",
]);

/** Подтверждённая запись, чей визит прошёл, — визит состоялся. */
const CONFIRMED_LIKE: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "CONFIRMED",
  "PREPAID",
  "STARTED",
  "IN_PROGRESS",
]);

function isCancelled(status: BookingStatus): boolean {
  return status === "REJECTED" || status === "CANCELLED";
}

function isCompleted(row: InsightBookingRow, now: Date): boolean {
  if (row.status === "FINISHED") return true;
  if (!CONFIRMED_LIKE.has(row.status)) return false;
  const end = row.endAtUtc ?? row.startAtUtc;
  return end !== null && end.getTime() <= now.getTime();
}

/** 1 = пн … 7 = вс, по дате салона. */
function salonWeekday(date: Date, timeZone: string): number {
  const day = new Date(`${toLocalDateKey(date, timeZone)}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function share(part: number, total: number): number | null {
  return total >= MIN_SAMPLE ? part / total : null;
}

function bump(map: Map<string, number>, key: string | null, by = 1): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

export function computeBookingStats(
  rows: readonly InsightBookingRow[],
  input: { now: Date; timeZone: string },
): InsightBookingStats {
  const { now, timeZone } = input;
  const nowMs = now.getTime();
  const historyFrom = nowMs - CABINET_HISTORY_DAYS * DAY_MS;
  const aheadTo = nowMs + CABINET_AHEAD_DAYS * DAY_MS;

  let past = 0;
  let completed = 0;
  let cancelledByClient = 0;
  let cancelledByProvider = 0;
  let expiredUnconfirmed = 0;
  let noShow = 0;
  let upcoming = 0;
  let online = 0;
  const leadHours: number[] = [];
  const visitsByClient = new Map<string, number>();
  const weekdayCounts = new Map<number, number>();
  const timeOfDay = { morning: 0, day: 0, evening: 0 };
  const bookingsByService = new Map<string, number>();
  const bookedMinutesAheadByMaster = new Map<string, number>();
  const completedByMaster = new Map<string, number>();
  let bookedMinutesAhead = 0;

  for (const row of rows) {
    if (!row.startAtUtc) continue;
    const startMs = row.startAtUtc.getTime();

    if (startMs >= historyFrom && startMs < nowMs) {
      past += 1;
      const isOnline = row.source === "WEB" || row.source === "APP";
      if (isOnline) {
        online += 1;
        const lead = (startMs - row.createdAt.getTime()) / HOUR_MS;
        if (Number.isFinite(lead) && lead >= 0) leadHours.push(lead);
      }

      if (isCancelled(row.status)) {
        if (row.cancelledBy === "CLIENT") cancelledByClient += 1;
        else if (row.cancelledBy === "PROVIDER") cancelledByProvider += 1;
        else if (row.cancelledBy === "SYSTEM") expiredUnconfirmed += 1;
      } else {
        bump(bookingsByService, row.serviceId);
      }

      if (row.status === "NO_SHOW") noShow += 1;

      if (isCompleted(row, now)) {
        completed += 1;
        bump(visitsByClient, row.clientKey);
        bump(completedByMaster, row.masterProviderId);
        const weekday = salonWeekday(row.startAtUtc, timeZone);
        weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
        const { hour } = getLocalTimeParts(row.startAtUtc, timeZone);
        if (hour < 12) timeOfDay.morning += 1;
        else if (hour < 17) timeOfDay.day += 1;
        else timeOfDay.evening += 1;
      }
      continue;
    }

    if (startMs >= nowMs && startMs < aheadTo && LIVE_STATUSES.has(row.status)) {
      upcoming += 1;
      const endMs = Math.min((row.endAtUtc ?? row.startAtUtc).getTime(), aheadTo);
      const minutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
      bookedMinutesAhead += minutes;
      bump(bookedMinutesAheadByMaster, row.masterProviderId, minutes);
    }
  }

  const busiestWeekdays =
    completed >= MIN_WEEKDAY_SAMPLE
      ? Array.from(weekdayCounts.entries())
          .sort((a, b) => b[1] - a[1] || a[0] - b[0])
          .slice(0, 2)
          .map(([weekday]) => weekday)
      : [];

  const avgLeadHours =
    leadHours.length >= MIN_SAMPLE
      ? Math.round(leadHours.reduce((sum, value) => sum + value, 0) / leadHours.length)
      : null;
  const lastMinute = leadHours.filter((value) => value < 24).length;

  let returningClients = 0;
  for (const visits of visitsByClient.values()) {
    if (visits >= 2) returningClients += 1;
  }

  return {
    facts: {
      past,
      completed,
      cancelledByClient,
      cancelledByProvider,
      expiredUnconfirmed,
      noShow,
      upcoming,
      onlineShare: share(online, past),
      avgLeadHours,
      lastMinuteShare: share(lastMinute, leadHours.length),
      uniqueClients: visitsByClient.size,
      returningClients,
      busiestWeekdays,
      timeOfDay,
    },
    bookingsByService,
    bookedMinutesAhead,
    bookedMinutesAheadByMaster,
    completedByMaster,
  };
}

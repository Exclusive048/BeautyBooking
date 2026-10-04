import type { StudioBookingListItem } from "@/features/studio-cabinet/bookings/server/booking-json";
import type { DeltaTone } from "../lib/format-delta";
import type { StudioAttentionItem, StudioDashboardData, StudioKpiTile } from "./types";

/**
 * MOBILE-STUDIO-C (ops) — главная студии для приложения
 * (`GET /api/cabinet/studio/dashboard`) из данных веб-дашборда
 * (`loadStudioDashboardData`): числа вместо готовых строк дельт, пункты
 * «Требует внимания» без href веба (экран выбирает приложение по `id`) и
 * сами записи, ждущие ответа, с действиями.
 */

export type StudioKpiTileJson = {
  current: number;
  previous: number;
  /** Проценты (выручка, записи), п.п. (загрузка) или доля балла (рейтинг); `null` — сравнивать не с чем. */
  delta: number | null;
  tone: DeltaTone;
};

export type StudioDashboardJson = {
  studioId: string;
  timezone: string;
  todayKey: string;
  today: {
    bookingsCount: number;
    mastersOnShift: StudioDashboardData["todayBanner"]["mastersOnShift"];
    totalMasters: number;
    averageLoadPercent: number;
  };
  kpis: {
    periodDays: number;
    revenueKopeks: StudioKpiTileJson;
    bookingsCount: StudioKpiTileJson;
    occupancyPercent: StudioKpiTileJson;
    averageRating: StudioKpiTileJson;
    averageCheckKopeks: number;
    ratingCount: number;
    mastersOnShiftCount: number;
    totalMastersCount: number;
  };
  topMasters: StudioDashboardData["topMasters"];
  attention: {
    items: Array<{ id: StudioAttentionItem["id"]; count: number; urgent: boolean }>;
    urgentCount: number;
    bookings: StudioBookingListItem[];
    bookingsTotal: number;
  };
  topOccupancyToday: StudioDashboardData["topOccupancyToday"];
  popularServices: StudioDashboardData["popularServices"];
  revenueChart: StudioDashboardData["revenueChart"] & { period: "30d" };
};

/** Окно KPI дашборда: последние 30 дней салона против 30 предыдущих (`buildKpis`). */
const KPI_PERIOD_DAYS = 30;

function tile(value: StudioKpiTile): StudioKpiTileJson {
  return { current: value.current, previous: value.previous, delta: value.delta.value, tone: value.delta.tone };
}

export function toStudioDashboardJson(input: {
  studioId: string;
  timezone: string;
  todayKey: string;
  data: StudioDashboardData;
  awaitingBookings: StudioBookingListItem[];
}): StudioDashboardJson {
  const { data } = input;
  const awaiting = data.attentionItems.find((item) => item.id === "bookings-awaiting");
  return {
    studioId: input.studioId,
    timezone: input.timezone,
    todayKey: input.todayKey,
    today: {
      bookingsCount: data.todayBanner.bookingsToday,
      mastersOnShift: data.todayBanner.mastersOnShift,
      totalMasters: data.todayBanner.totalMasters,
      averageLoadPercent: data.todayBanner.averageLoadPercent,
    },
    kpis: {
      periodDays: KPI_PERIOD_DAYS,
      revenueKopeks: tile(data.kpis.revenueKopeks),
      bookingsCount: tile(data.kpis.bookingsCount),
      occupancyPercent: tile(data.kpis.occupancyPercent),
      averageRating: tile(data.kpis.averageRating),
      averageCheckKopeks: data.kpis.averageCheckKopeks,
      ratingCount: data.kpis.ratingCount,
      mastersOnShiftCount: data.kpis.mastersOnShiftCount,
      totalMastersCount: data.kpis.totalMastersCount,
    },
    topMasters: data.topMasters,
    attention: {
      items: data.attentionItems.map((item) => ({ id: item.id, count: item.count, urgent: item.urgent })),
      urgentCount: data.attentionUrgent,
      bookings: input.awaitingBookings,
      bookingsTotal: awaiting?.count ?? 0,
    },
    topOccupancyToday: data.topOccupancyToday,
    popularServices: data.popularServices,
    revenueChart: { period: "30d", ...data.revenueChart },
  };
}

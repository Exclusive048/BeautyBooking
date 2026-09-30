import type { FormattedDelta } from "../lib/format-delta";

export type StudioMasterOnShift = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type StudioTodayBannerData = {
  bookingsToday: number;
  mastersOnShift: StudioMasterOnShift[];
  totalMasters: number;
  averageLoadPercent: number;
  /** Пояс студии: дата «сегодня» в баннере — по нему (salon-tz). */
  timeZone: string;
};

export type StudioKpiTile = {
  current: number;
  previous: number;
  delta: FormattedDelta;
};

export type StudioKpis = {
  revenueKopeks: StudioKpiTile;
  bookingsCount: StudioKpiTile;
  averageCheckKopeks: number;
  occupancyPercent: StudioKpiTile;
  averageRating: StudioKpiTile;
  ratingCount: number;
  mastersOnShiftCount: number;
  totalMastersCount: number;
};

export type StudioTopMasterRow = {
  id: string;
  name: string;
  serviceLabel: string | null;
  avatarUrl: string | null;
  bookingsCount: number;
  revenueKopeks: number;
  /** Rating shown to the right; falls back to studio.ratingAvg per-master. */
  rating: number;
  /** Share of top1 — drives progress bar width 0–100. */
  percentOfTop: number;
};

export type StudioAttentionItem = {
  id:
    | "pending-master-approvals"
    | "bookings-awaiting"
    | "reviews-unanswered"
    | "schedule-requests";
  count: number;
  href: string;
  urgent: boolean;
};

export type StudioOccupancyRow = {
  id: string;
  name: string;
  bookingsCount: number;
  capacity: number;
  percent: number;
};

export type StudioPopularService = {
  id: string;
  name: string;
  bookingsCount: number;
  sharePercent: number;
  priceKopeks: number;
  revenueKopeks: number;
};

export type StudioRevenueChartPoint = {
  masterId: string;
  masterName: string;
  revenueKopeks: number;
  bookingsCount: number;
};

export type StudioRevenueChartData = {
  totalKopeks: number;
  points: StudioRevenueChartPoint[];
};

export type StudioDashboardData = {
  todayBanner: StudioTodayBannerData;
  kpis: StudioKpis;
  topMasters: StudioTopMasterRow[];
  attentionItems: StudioAttentionItem[];
  attentionTotal: number;
  attentionUrgent: number;
  topOccupancyToday: StudioOccupancyRow[];
  popularServices: StudioPopularService[];
  revenueChart: StudioRevenueChartData;
};

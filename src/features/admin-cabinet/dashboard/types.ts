/**
 * Plain-data types for the admin dashboard. Shared across server services
 * (`./server/*`) and client components — only primitives, no Prisma models,
 * no React, no functions. Safe to import from either side of the RSC
 * boundary via `import type`.
 */

export type AdminKpiKey =
  | "registrations7d"
  | "bookings1d"
  | "activeSubs"
  | "revenueMonth";

/** Single KPI tile. Delta is pre-computed on the server so the client
 * doesn't need to know about previous periods. */
export type AdminKpi = {
  key: AdminKpiKey;
  /** Pre-formatted display value, e.g. "248", "1 412", "4.2 млн ₽". */
  valueText: string;
  /** Underlying numeric value (for tests / accessibility). */
  rawValue: number;
  /** Delta text without the arrow glyph, e.g. "+18%", "+24", or `null`
   * when previous period was zero / unavailable. */
  deltaText: string | null;
  /** Sign of the delta. `null` means delta unavailable; "zero" means no
   * change. */
  deltaSign: "positive" | "negative" | "zero" | null;
};

export type AdminKpis = {
  items: AdminKpi[];
};

export type AdminChartPoint = {
  /** ISO date (UTC, day-precision) — `2026-05-12`. */
  date: string;
  /** Pre-formatted label, e.g. "12", "сегодня". */
  label: string;
  count: number;
};

export type AdminChartSeries = {
  total: number;
  /** "+18% vs прошлая неделя", localised on the server. */
  deltaText: string | null;
  deltaSign: "positive" | "negative" | "zero" | null;
  points: AdminChartPoint[];
};

export type AdminCharts = {
  registrations: AdminChartSeries;
  bookings: AdminChartSeries;
};

export type AdminEventType =
  | "booking"
  | "booking_cancel"
  | "registration_master"
  | "registration_client"
  | "subscription"
  | "complaint";

export type AdminEventDotTone = "ok" | "new" | "sub" | "cancel" | "alert";

export type AdminEventAmountTone = "neutral" | "positive" | "negative";

export type AdminEventItem = {
  /** Composite `"{type}:{entityId}"` — stable across polls, used to
   * deduplicate client-side. */
  id: string;
  type: AdminEventType;
  /** ISO timestamp, server-side UTC. */
  timeIso: string;
  /** Unix ms — handy for `?since=` polling without re-parsing. */
  timeMs: number;
  /** "Мария П. → Анна К." or "Регистрация · мастер". */
  primary: string;
  /** "Маникюр + гель" or "Юлия Серебрянникова". */
  secondary: string;
  /** Right-column text — "3 500 ₽", "−2 200 ₽", "Косметология". `null`
   * when not applicable. */
  amountText: string | null;
  amountTone: AdminEventAmountTone;
  dotTone: AdminEventDotTone;
};

export type AdminEventsResponse = {
  items: AdminEventItem[];
};

export type AdminHealthTone = "ok" | "warn" | "error" | "neutral";

export type AdminHealthStat = {
  key:
    | "apiUptime"
    | "p95"
    | "queuePending"
    | "queueDead"
    | "complaintsOpen"
    | "smsBalance";
  valueText: string;
  tone: AdminHealthTone;
  /** Optional hint shown on hover — e.g. why a metric is "—". */
  hint?: string;
};

export type AdminHealth = {
  stats: AdminHealthStat[];
};

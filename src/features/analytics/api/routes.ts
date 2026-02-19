import { SubscriptionScope } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { isDateKey } from "@/lib/schedule/dateKey";
import type { AnalyticsGranularity, AnalyticsPeriod } from "@/features/analytics/types";

export function parseScopeParams(url: URL): { scope: SubscriptionScope; masterId: string | null } {
  const scopeRaw = url.searchParams.get("scope");
  const scope =
    scopeRaw === "MASTER" || scopeRaw === "STUDIO" ? (scopeRaw as SubscriptionScope) : "MASTER";
  const masterId = url.searchParams.get("masterId");
  return { scope, masterId: masterId ? masterId.trim() : null };
}

export function parsePeriodParams(url: URL): {
  period: AnalyticsPeriod;
  from?: string | null;
  to?: string | null;
  compare: boolean;
} {
  const periodRaw = url.searchParams.get("period") ?? "month";
  const allowed: AnalyticsPeriod[] = ["today", "week", "month", "quarter", "custom"];
  if (!allowed.includes(periodRaw as AnalyticsPeriod)) {
    throw new AppError("Некорректный период.", 400, "VALIDATION_ERROR");
  }
  const period = periodRaw as AnalyticsPeriod;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (period === "custom") {
    if (!from || !to || !isDateKey(from) || !isDateKey(to)) {
      throw new AppError("Для произвольного периода нужны from/to.", 400, "VALIDATION_ERROR");
    }
  }
  const compare = url.searchParams.get("compare") === "1";
  return { period, from, to, compare };
}

export function parseGranularityParam(
  url: URL,
  fallback: AnalyticsGranularity
): AnalyticsGranularity {
  const value = url.searchParams.get("granularity");
  if (!value) return fallback;
  if (value === "day" || value === "week" || value === "month") return value;
  throw new AppError("Некорректная гранулярность.", 400, "VALIDATION_ERROR");
}

export function parseMonthParam(url: URL): string {
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError("Некорректный месяц.", 400, "VALIDATION_ERROR");
  }
  return month;
}

export function parseMonthsBackParam(url: URL, fallback = 6): number {
  const raw = url.searchParams.get("monthsBack");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError("Некорректное значение monthsBack.", 400, "VALIDATION_ERROR");
  }
  return Math.min(12, Math.max(1, Math.floor(value)));
}

export function parseThresholdDaysParam(url: URL, fallback = 45): number {
  const raw = url.searchParams.get("thresholdDays");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError("Некорректный порог.", 400, "VALIDATION_ERROR");
  }
  return Math.min(180, Math.max(1, Math.floor(value)));
}

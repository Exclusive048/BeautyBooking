/**
 * Period options for the revenue chart period selector. Studio-cabinet
 * dashboard scope only — the master analytics module already has its
 * own URL-driven period system (`MasterAnalyticsPeriodId`) which we do
 * not reuse here because the chart selector lives in local state, not
 * search params.
 */
export type StudioDashboardPeriodId = "7d" | "30d" | "90d" | "365d";

export const STUDIO_DASHBOARD_PERIODS: ReadonlyArray<{
  id: StudioDashboardPeriodId;
  days: number;
}> = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
  { id: "365d", days: 365 },
];

export function isStudioDashboardPeriodId(value: unknown): value is StudioDashboardPeriodId {
  return STUDIO_DASHBOARD_PERIODS.some((option) => option.id === value);
}

export function daysForPeriod(period: StudioDashboardPeriodId): number {
  const match = STUDIO_DASHBOARD_PERIODS.find((option) => option.id === period);
  return match?.days ?? 30;
}

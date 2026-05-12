import { redirect } from "next/navigation";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterAnalyticsFeatures } from "@/lib/master/analytics-features";
import {
  parseAnalyticsPeriod,
  parseComparisonFlag,
} from "@/lib/master/analytics-period";
import { isDateKey } from "@/lib/schedule/dateKey";
import { getMasterAnalyticsView } from "@/lib/master/analytics-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { AnalyticsKpiCards } from "./analytics-kpi-cards";
import { FeatureGate } from "./feature-gate";
import { FunnelSection } from "./funnel-section";
import { HeatmapSection } from "./heatmap-section";
import { InsightsSection } from "./insights-section";
import { PeriodSelectorBar } from "./period-selector-bar";
import { RevenueSection } from "./revenue-section";
import { TopServicesSection } from "./top-services-section";
import { periodLabelFor } from "./lib/format";

const T = UI_TEXT.cabinetMaster;

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SearchParams>;
};

function readString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Server orchestrator for `/cabinet/master/analytics` (30a · fix-02).
 *
 * URL-driven state:
 *   - `?period=` (7d / 30d / 90d / year / custom) — defaults to 30d
 *   - `?from=YYYY-MM-DD&to=YYYY-MM-DD` — required when `period=custom`
 *   - `?compare=off` — disables the prev-period overlay (default: on)
 *
 * fix-02: `custom` is wired up — the picker submits `from`/`to`, and
 * the view service consumes the explicit range. If `custom` is in the
 * URL without a valid `from`/`to` pair we fall back to 30d server-side
 * so the page never errors.
 */
export async function MasterAnalyticsPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = (await searchParams) ?? {};
  const periodId = parseAnalyticsPeriod(readString(params.period));
  const comparison = parseComparisonFlag(readString(params.compare));

  const fromKey = readString(params.from);
  const toKey = readString(params.to);
  const validCustomRange =
    periodId === "custom" &&
    fromKey &&
    toKey &&
    isDateKey(fromKey) &&
    isDateKey(toKey) &&
    fromKey <= toKey
      ? { fromKey, toKey }
      : null;
  const effectivePeriod = periodId === "custom" && !validCustomRange ? "30d" : periodId;

  const features = await getMasterAnalyticsFeatures(user.id);
  const data = await getMasterAnalyticsView({
    userId: user.id,
    period: effectivePeriod,
    customRange: validCustomRange,
    comparison,
    features,
  });

  const periodLabel = periodLabelFor(
    effectivePeriod === "custom" ? "30d" : effectivePeriod,
  );

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.analytics.breadcrumb },
        ]}
        title={T.analytics.title}
        subtitle={T.analytics.subtitle}
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <PeriodSelectorBar
          activePeriod={periodId}
          comparison={comparison}
          periodDisplay={data.periodDisplay}
          customPeriodAvailable={features.customPeriod}
          rangeFromKey={validCustomRange?.fromKey ?? data.range.fromKey}
          rangeToKey={validCustomRange?.toKey ?? data.range.toKey}
        />

        <FeatureGate available={features.dashboard}>
          <AnalyticsKpiCards kpi={data.kpi} comparison={comparison} />
        </FeatureGate>

        <FeatureGate available={features.revenue}>
          <RevenueSection data={data.revenue} comparison={comparison} />
        </FeatureGate>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr,1fr]">
          <FeatureGate available={features.bookingInsights}>
            <HeatmapSection data={data.heatmap} />
          </FeatureGate>
          <FeatureGate available={features.revenue}>
            <TopServicesSection services={data.topServices} periodLabel={periodLabel} />
          </FeatureGate>
        </div>

        <FeatureGate available={features.revenue}>
          <FunnelSection steps={data.funnel} periodLabel={periodLabel} />
        </FeatureGate>

        {data.insights.length > 0 ? (
          <FeatureGate available={features.bookingInsights}>
            <InsightsSection insights={data.insights} periodLabel={periodLabel} />
          </FeatureGate>
        ) : null}
      </div>
    </>
  );
}

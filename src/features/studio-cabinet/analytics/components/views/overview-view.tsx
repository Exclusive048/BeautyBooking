import { FeatureGate } from "@/features/master/components/analytics/feature-gate";
import { UI_TEXT } from "@/lib/ui/text";
import { HoursHeatmap } from "../charts/hours-heatmap";
import { RevenueLineChart } from "../charts/revenue-line-chart";
import { SourcesDonut } from "../charts/sources-donut";
import type { StudioAnalyticsViewData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.overview;

type Props = {
  data: StudioAnalyticsViewData;
};

export function OverviewView({ data }: Props) {
  const overview = data.overview;
  if (!overview) return null;

  return (
    <div className="space-y-4">
      <FeatureGate available={data.features.revenue}>
        <section className="rounded-2xl border border-border-subtle bg-bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-text-main">
              {T.revenueChartTitle}
            </h2>
            <span className="text-[11px] text-text-sec">
              {data.compare
                ? T.revenueCompare
                : T.revenueNoCompare}
            </span>
          </div>
          {overview.revenue ? (
            <RevenueLineChart data={overview.revenue} compare={data.compare} />
          ) : (
            <p className="text-sm text-text-sec">{T.noData}</p>
          )}
        </section>
      </FeatureGate>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-subtle bg-bg-card p-4">
          <header className="mb-3">
            <h2 className="font-display text-base font-semibold text-text-main">
              {T.sourcesTitle}
            </h2>
            <p className="text-[11px] text-text-sec">{T.sourcesDesc}</p>
          </header>
          <SourcesDonut sources={overview.sources} />
        </section>

        <FeatureGate available={data.features.bookingInsights}>
          <section className="rounded-2xl border border-border-subtle bg-bg-card p-4">
            <header className="mb-3">
              <h2 className="font-display text-base font-semibold text-text-main">
                {T.hoursTitle}
              </h2>
              <p className="text-[11px] text-text-sec">{T.hoursDesc}</p>
            </header>
            {overview.heatmap ? (
              <HoursHeatmap data={overview.heatmap} />
            ) : (
              <p className="text-sm text-text-sec">{T.noData}</p>
            )}
          </section>
        </FeatureGate>
      </div>
    </div>
  );
}

import { StudioAttentionPanel } from "./studio-attention-panel";
import { StudioKpiRow } from "./studio-kpi-row";
import { StudioPopularServices } from "./studio-popular-services";
import { StudioRevenueChart } from "./studio-revenue-chart";
import { StudioTodayBanner } from "./studio-today-banner";
import { StudioTopMasters } from "./studio-top-masters";
import { StudioTopOccupancy } from "./studio-top-occupancy";
import type { StudioDashboardData } from "../server/types";

type Props = {
  data: StudioDashboardData;
  studioName: string;
};

/**
 * Server-component orchestrator for `/cabinet/studio`. Receives the
 * pre-fetched dashboard payload from the page route and lays out
 * sections per the reference: today banner → KPI row → top masters
 * + attention (2-up) → occupancy + popular services (2-up) →
 * revenue chart full width.
 */
export function StudioDashboardPage({ data, studioName }: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <StudioTodayBanner data={data.todayBanner} studioName={studioName} />

      <StudioKpiRow kpis={data.kpis} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
        <StudioTopMasters masters={data.topMasters} />
        <StudioAttentionPanel
          items={data.attentionItems}
          total={data.attentionTotal}
          urgent={data.attentionUrgent}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <StudioTopOccupancy rows={data.topOccupancyToday} />
        <StudioPopularServices services={data.popularServices} />
      </div>

      <StudioRevenueChart initialData={data.revenueChart} initialPeriod="30d" />
    </div>
  );
}

import * as UI_TEXT from "@/lib/ui/text";
import type { StudioAnalyticsViewData } from "../lib/types";
import { AnalyticsControls } from "./analytics-controls";
import { AnalyticsKpiBar } from "./analytics-kpi-bar";
import { ClientsView } from "./views/clients-view";
import { MastersView } from "./views/masters-view";
import { OverviewView } from "./views/overview-view";
import { ServicesView } from "./views/services-view";

const T = UI_TEXT.studioCabinet.analyticsV2;

type Props = {
  data: StudioAnalyticsViewData;
};

/**
 * Server orchestrator for `/cabinet/studio/analytics`. Header → period
 * + view + compare controls → sticky KPI bar → active view body.
 *
 * Per-view body switching keeps payload small — only the active tab's
 * data is fetched server-side (see `loadStudioAnalyticsView` dispatch).
 */
export function StudioAnalyticsPage({ data }: Props) {
  return (
    <div className="space-y-3 lg:space-y-6">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {T.header.title}
        </h1>
      </header>

      <AnalyticsControls period={data.period} view={data.view} compare={data.compare} />

      <AnalyticsKpiBar kpi={data.kpi} compare={data.compare} />

      {data.view === "overview" ? <OverviewView data={data} /> : null}
      {data.view === "masters" ? <MastersView data={data} /> : null}
      {data.view === "services" ? <ServicesView data={data} /> : null}
      {data.view === "clients" ? <ClientsView data={data} /> : null}
    </div>
  );
}

import type { StudioScheduleView } from "../lib/view-state";
import type { StudioScheduleData } from "../server/types";
import { DayGrid } from "./day-view/day-grid";
import { ScheduleHeader } from "./schedule-header";
import { ScheduleKpiRow } from "./schedule-kpi-row";
import { ScheduleLegend } from "./schedule-legend";
import { WeekGrid } from "./week-view/week-grid";

type Props = {
  studioId: string;
  view: StudioScheduleView;
  data: StudioScheduleData;
};

/**
 * Server orchestrator for `/cabinet/studio/calendar`. Receives the
 * pre-fetched schedule payload and lays out: header → KPI row →
 * legend → day or week grid (driven by `?view`).
 */
export function StudioSchedulePage({ studioId, view, data }: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <ScheduleHeader
        studioId={studioId}
        view={view}
        dateKey={data.dateKey}
        kpis={data.kpis}
        masters={data.day.columns}
        services={data.services}
      />
      <ScheduleKpiRow kpis={data.kpis} />
      <ScheduleLegend />
      {view === "week" && data.week ? (
        <WeekGrid week={data.week} />
      ) : (
        <DayGrid
          studioId={studioId}
          day={data.day}
          services={data.services}
        />
      )}
    </div>
  );
}

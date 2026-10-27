import { ChartsRow } from "@/features/admin-cabinet/dashboard/components/charts-row";
import { EventsFeed } from "@/features/admin-cabinet/dashboard/components/events-feed";
import { KpiRow } from "@/features/admin-cabinet/dashboard/components/kpi-row";
import { SystemHealth } from "@/features/admin-cabinet/dashboard/components/system-health";
import type {
  AdminCharts,
  AdminEventsResponse,
  AdminHealth,
  AdminKpis,
} from "@/features/admin-cabinet/dashboard/types";

type Props = {
  initialKpis: AdminKpis;
  initialCharts: AdminCharts;
  initialEvents: AdminEventsResponse;
  initialHealth: AdminHealth;
};

/** Server-render orchestrator for `/admin`. Pre-populates every section
 * so the page paints with real numbers without an additional client
 * round-trip; the live sections (`<EventsFeed>`, `<SystemHealth>`) then
 * upgrade themselves with polling once mounted. */
export function AdminDashboard({
  initialKpis,
  initialCharts,
  initialEvents,
  initialHealth,
}: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <KpiRow data={initialKpis} />
      <ChartsRow data={initialCharts} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr] lg:gap-4">
        <EventsFeed initial={initialEvents.items} />
        <SystemHealth initial={initialHealth} />
      </div>
    </div>
  );
}

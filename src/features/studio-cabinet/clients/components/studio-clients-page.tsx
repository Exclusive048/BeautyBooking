import type { StudioClientsData, StudioClientSegmentKey } from "../lib/types";
import { ClientsFilters } from "./clients-filters";
import { ClientsHeader } from "./clients-header";
import { ClientsKpiRow } from "./clients-kpi-row";
import { ClientsPagination } from "./clients-pagination";
import { ClientsTable } from "./clients-table";
import { SegmentsSidebar } from "./segments-sidebar";

type Props = {
  data: StudioClientsData;
  segment: StudioClientSegmentKey;
  search: string;
  masterId: string;
};

/**
 * Server orchestrator for `/cabinet/studio/clients`. Receives the
 * pre-fetched payload from the route and lays out: header → KPI row →
 * 2-column (segments sidebar + filters + table + pagination).
 */
export function StudioClientsPage({ data, segment, search, masterId }: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <ClientsHeader totalCount={data.totalCount} filteredCount={data.filteredCount} />
      <ClientsKpiRow kpis={data.kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <SegmentsSidebar selected={segment} counts={data.segmentCounts} />
        <div className="space-y-3 min-w-0">
          <ClientsFilters search={search} masterId={masterId} masters={data.masterOptions} />
          <ClientsTable rows={data.items} />
          <ClientsPagination nextCursor={data.nextCursor} />
        </div>
      </div>
    </div>
  );
}

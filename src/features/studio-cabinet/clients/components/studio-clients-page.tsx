import type {
  StudioCabinetServiceOption,
  StudioCabinetShellExtras,
} from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import type { StudioClientsData, StudioClientSegmentKey } from "../lib/types";
import { ClientsFilters } from "./clients-filters";
import { ClientsHeader } from "./clients-header";
import { ClientsKpiRow } from "./clients-kpi-row";
import { ClientsPagination } from "./clients-pagination";
import { ClientsTable } from "./clients-table";
import { SegmentsSidebar } from "./segments-sidebar";

type Props = {
  studioId: string;
  data: StudioClientsData;
  segment: StudioClientSegmentKey;
  search: string;
  masterId: string;
  /**
   * STUDIO-CLIENT-WRITE-DIALOG-A: drives the per-row «Записать»
   * dialog (`ClientBookButton` → `CreateBookingDialog`). Threaded
   * from the route via the shared `loadStudioCabinetShellExtras`
   * helper (single source of truth for the master-services join).
   */
  scheduleMasters: StudioCabinetShellExtras["scheduleMasters"];
  services: StudioCabinetServiceOption[];
};

/**
 * Server orchestrator for `/cabinet/studio/clients`. Receives the
 * pre-fetched payload from the route and lays out: header → KPI row →
 * 2-column (segments sidebar + filters + table + pagination).
 */
export function StudioClientsPage({
  studioId,
  data,
  segment,
  search,
  masterId,
  scheduleMasters,
  services,
}: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <ClientsHeader totalCount={data.totalCount} filteredCount={data.filteredCount} />
      <ClientsKpiRow kpis={data.kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <SegmentsSidebar selected={segment} counts={data.segmentCounts} />
        <div className="space-y-3 min-w-0">
          <ClientsFilters search={search} masterId={masterId} masters={data.masterOptions} />
          <ClientsTable
            rows={data.items}
            studioId={studioId}
            scheduleMasters={scheduleMasters}
            services={services}
          />
          <ClientsPagination nextCursor={data.nextCursor} />
        </div>
      </div>
    </div>
  );
}

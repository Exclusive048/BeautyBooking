import type {
  StudioCabinetServiceOption,
  StudioCabinetShellExtras,
} from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import { CRM_CLIENTS_WINDOW_MONTHS } from "@/lib/crm/clients-window";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioClientsData, StudioClientSegmentKey } from "../lib/types";
import { ClientsFilters } from "./clients-filters";
import { ClientsHeader } from "./clients-header";
import { ClientsPagination } from "./clients-pagination";
import { ClientsTable } from "./clients-table";
import { SegmentsSidebar } from "./segments-sidebar";

// PERF-06: подпись окна — shared-ключ обоих кабинетов (прецедент UI-33).
const WINDOW_NOTE = UI_TEXT.cabinetMaster.clients.windowNote(CRM_CLIENTS_WINDOW_MONTHS);

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
 * pre-fetched payload from the route and lays out: header → 2-column
 * (segments sidebar + filters + table + pagination). Плиток с показателями
 * базы нет: выручка и сегменты клиентов — в аналитике.
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
    <div className="space-y-3 lg:space-y-6">
      <ClientsHeader />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr] lg:gap-4">
        <SegmentsSidebar selected={segment} counts={data.segmentCounts} />
        <div className="space-y-3 min-w-0">
          <ClientsFilters search={search} masterId={masterId} masters={data.masterOptions} />
          {/* PERF-06 / решение 31.1: список считается за окно — подпись видна всегда. */}
          <p className="text-xs text-text-sec">{WINDOW_NOTE}</p>
          <ClientsTable
            rows={data.items}
            studioId={studioId}
            scheduleMasters={scheduleMasters}
            services={services}
            timezone={data.timezone}
            isFiltered={
              Boolean(search) ||
              (Boolean(masterId) && masterId !== "all") ||
              (Boolean(segment) && segment !== "all")
            }
          />
          <ClientsPagination nextCursor={data.nextCursor} />
        </div>
      </div>
    </div>
  );
}

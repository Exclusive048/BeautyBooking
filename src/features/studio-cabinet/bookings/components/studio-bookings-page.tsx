import type { BookingStatus } from "@prisma/client";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import type { BookingsTimeRange } from "../lib/time-range-filter";
import type {
  MasterOption,
  StudioBookingsKpis,
  StudioBookingsListData,
} from "../server/types";
import { BookingsFilters } from "./bookings-filters";
import { BookingsHeader } from "./bookings-header";
import { BookingsKpiRow } from "./bookings-kpi-row";
import { BookingsPagination } from "./bookings-pagination";
import { BookingsTable } from "./bookings-table";

type Props = {
  studioId: string;
  range: BookingsTimeRange;
  status: BookingStatus | "all";
  masterId: string | "all";
  search: string;
  list: StudioBookingsListData;
  kpis: StudioBookingsKpis;
  masterOptions: MasterOption[];
  scheduleMasters: ScheduleMasterColumn[];
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
};

export function StudioBookingsPage({
  studioId,
  range,
  status,
  masterId,
  search,
  list,
  kpis,
  masterOptions,
  scheduleMasters,
  services,
}: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <BookingsHeader
        studioId={studioId}
        visibleCount={list.items.length}
        masters={scheduleMasters}
        services={services}
      />
      <BookingsKpiRow kpis={kpis} />
      <BookingsFilters
        range={range}
        status={status}
        masterId={masterId}
        search={search}
        counts={list.rangeCounts}
        masters={masterOptions}
      />
      <BookingsTable
        studioId={studioId}
        rows={list.items}
        masters={scheduleMasters}
      />
      <BookingsPagination nextCursor={list.nextCursor} />
    </div>
  );
}

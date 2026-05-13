import { CitiesFilters } from "@/features/admin-cabinet/cities/components/cities-filters";
import { CitiesTable } from "@/features/admin-cabinet/cities/components/cities-table";
import { ProvidersWithoutCityCard } from "@/features/admin-cabinet/cities/components/providers-without-city-card";
import type {
  AdminCitiesCounts,
  AdminCityRow,
  AdminCityStatusFilter,
  AdminDuplicateGroup,
} from "@/features/admin-cabinet/cities/types";

type Props = {
  rows: AdminCityRow[];
  duplicateGroups: AdminDuplicateGroup[];
  counts: AdminCitiesCounts;
  providersWithoutCityCount: number;
  filters: {
    status: AdminCityStatusFilter;
    search: string;
    selectedId: string | null;
  };
};

/**
 * Server orchestrator for `/admin/cities`. Slots together the
 * "Providers without city" info card, the filter bar, and the
 * table+detail-panel grid. URL state lives in CitiesFilters /
 * CitiesTable; this wrapper just hands them initial data.
 */
export function AdminCities({
  rows,
  duplicateGroups,
  counts,
  providersWithoutCityCount,
  filters,
}: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <ProvidersWithoutCityCard count={providersWithoutCityCount} />
      <CitiesFilters
        status={filters.status}
        search={filters.search}
        counts={counts}
      />
      <CitiesTable
        rows={rows}
        duplicateGroups={duplicateGroups}
        counts={counts}
        selectedId={filters.selectedId}
      />
    </div>
  );
}

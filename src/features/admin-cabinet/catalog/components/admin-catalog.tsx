import { CatalogFilters } from "@/features/admin-cabinet/catalog/components/catalog-filters";
import { CatalogTable } from "@/features/admin-cabinet/catalog/components/catalog-table";
import type {
  AdminCategoryCounts,
  AdminCategoryParentOption,
  AdminCategoryRow,
  AdminCategoryStatusFilter,
} from "@/features/admin-cabinet/catalog/types";

type Props = {
  rows: AdminCategoryRow[];
  parentOptions: AdminCategoryParentOption[];
  counts: AdminCategoryCounts;
  filters: {
    status: AdminCategoryStatusFilter;
    parent: string | "all" | "root";
    search: string;
  };
};

/**
 * Server-rendered orchestrator for `/admin/catalog`. The filter row
 * lives at the top (it owns URL state), the table sits below and
 * owns dialog / optimistic-update state. Both are client components
 * because they need pathname / router access; this wrapper itself
 * just slots them together so the page component stays minimal.
 */
export function AdminCatalog({ rows, parentOptions, counts, filters }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <CatalogFilters
        status={filters.status}
        parent={filters.parent}
        search={filters.search}
        counts={counts}
        parentOptions={parentOptions}
      />
      <CatalogTable
        initialRows={rows}
        parentOptions={parentOptions}
        counts={counts}
      />
    </div>
  );
}

import { ReviewsFilters } from "@/features/admin-cabinet/reviews/components/reviews-filters";
import { ReviewsHeader } from "@/features/admin-cabinet/reviews/components/reviews-header";
import { ReviewsKpiRow } from "@/features/admin-cabinet/reviews/components/reviews-kpi-row";
import { ReviewsList } from "@/features/admin-cabinet/reviews/components/reviews-list";
import type {
  AdminReviewRow,
  AdminReviewTab,
  AdminReviewsCounts,
  AdminReviewsKpis,
} from "@/features/admin-cabinet/reviews/types";

type Props = {
  kpis: AdminReviewsKpis;
  counts: AdminReviewsCounts;
  rows: AdminReviewRow[];
  nextCursor: string | null;
  filters: {
    tab: AdminReviewTab;
    search: string;
  };
};

/** Server orchestrator for `/admin/reviews`. Layout: caption →
 * 4-KPI row → tabs + search → cards list. Each section is
 * independently rendered; client interactivity lives only inside
 * the filter bar and the list (with its dialogs). */
export function AdminReviews({
  kpis,
  counts,
  rows,
  nextCursor,
  filters,
}: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <ReviewsHeader pendingReports={kpis.pendingReports.count} />
      <ReviewsKpiRow data={kpis} />
      <ReviewsFilters
        tab={filters.tab}
        search={filters.search}
        counts={counts}
      />
      <ReviewsList rows={rows} nextCursor={nextCursor} tab={filters.tab} />
    </div>
  );
}

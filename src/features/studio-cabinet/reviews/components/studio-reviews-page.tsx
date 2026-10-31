import type { StudioReviewFilter, StudioReviewsListData } from "../lib/types";
import { ReviewsFilters } from "./reviews-filters";
import { ReviewsHeader } from "./reviews-header";
import { ReviewsList } from "./reviews-list";
import { ReviewsPagination } from "./reviews-pagination";

type Props = {
  data: StudioReviewsListData;
  filter: StudioReviewFilter;
  masterId: string;
};

/**
 * Server orchestrator for `/cabinet/studio/reviews`. Lays out header →
 * filters → list → pagination. Плиток с оценкой, распределением и топом
 * услуг нет: средняя оценка — на главной кабинета, по мастерам — в аналитике.
 */
export function StudioReviewsPage({ data, filter, masterId }: Props) {
  return (
    <div className="space-y-3 lg:space-y-6">
      <ReviewsHeader />
      <ReviewsFilters
        filter={filter}
        masterId={masterId}
        masters={data.masterOptions}
        counts={data.filterCounts}
      />
      <ReviewsList reviews={data.items} />
      <ReviewsPagination nextCursor={data.nextCursor} />
    </div>
  );
}

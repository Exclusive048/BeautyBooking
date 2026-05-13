import { AdminReviews } from "@/features/admin-cabinet/reviews/components/admin-reviews";
import { getAdminReviewsKpis } from "@/features/admin-cabinet/reviews/server/kpis.service";
import {
  getReviewTabCounts,
  listAdminReviews,
} from "@/features/admin-cabinet/reviews/server/reviews.service";
import type { AdminReviewTab } from "@/features/admin-cabinet/reviews/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  tab?: string;
  q?: string;
  cursor?: string;
}>;

function parseTab(value: string | undefined): AdminReviewTab {
  if (value === "flagged" || value === "low" || value === "all") return value;
  return "flagged";
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const search = (params.q ?? "").trim();
  const cursor = params.cursor?.trim() || null;

  const [kpis, counts, list] = await Promise.all([
    getAdminReviewsKpis(),
    getReviewTabCounts(),
    listAdminReviews({ tab, search, cursor }),
  ]);

  return (
    <AdminReviews
      kpis={kpis}
      counts={counts}
      rows={list.items}
      nextCursor={list.nextCursor}
      filters={{ tab, search }}
    />
  );
}

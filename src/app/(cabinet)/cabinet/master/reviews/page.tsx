import { MasterReviewsPage } from "@/features/master/components/reviews/master-reviews-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/reviews` — reviews surface for masters (28a). Reads
 * `?filter=` for chip selection; everything else is server-rendered with
 * a small client island per card for the reply form + report modal.
 */
export default async function MasterReviewsRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterReviewsPage searchParams={searchParams} />;
}

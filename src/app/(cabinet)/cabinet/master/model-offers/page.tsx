import { MasterModelOffersPage } from "@/features/master/components/model-offers/master-model-offers-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/model-offers` — read-only model offers surface for
 * masters (29a). Reads `?filterOffer=` for the pending applications
 * filter; everything else is server-rendered.
 */
export default async function MasterModelOffersRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterModelOffersPage searchParams={searchParams} />;
}

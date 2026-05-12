import { MasterPortfolioPage } from "@/features/master/components/portfolio/master-portfolio-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/portfolio` — full portfolio management surface (31b).
 * Reads `?filter=` (all/public/hidden) and `?cat=` (global category id);
 * everything else server-rendered.
 */
export default async function MasterPortfolioRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterPortfolioPage searchParams={searchParams} />;
}

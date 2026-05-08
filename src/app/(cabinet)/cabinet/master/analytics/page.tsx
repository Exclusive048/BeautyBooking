import { MasterAnalyticsPage } from "@/features/master/components/analytics/master-analytics-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/analytics` — redesigned (30a). Reads `?period=` and
 * `?compare=` for state; everything else is server-rendered.
 *
 * The legacy `<AnalyticsPage scope="MASTER" />` component still serves
 * the studio cabinet (`scope="STUDIO"`) — it will get its own redesign
 * later. We don't touch the shared `features/analytics` domain layer.
 */
export default async function MasterAnalyticsRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterAnalyticsPage searchParams={searchParams} />;
}

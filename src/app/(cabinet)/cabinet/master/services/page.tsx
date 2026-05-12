import { MasterServicesPage } from "@/features/master/components/services/master-services-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/services` — full services + bundles management (31c).
 * Reads `?filter=` (all/services/bundles/disabled); everything else is
 * server-rendered.
 */
export default async function MasterServicesRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterServicesPage searchParams={searchParams} />;
}

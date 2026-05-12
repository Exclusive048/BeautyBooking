import { MasterClientsPage } from "@/features/master/components/clients/master-clients-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/clients` — CRM landing for the master cabinet
 * (27a read-only). Mutation flows (add client, edit notes, custom tags)
 * land in 27b on top of this scaffolding.
 */
export default async function MasterClientsRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterClientsPage searchParams={searchParams} />;
}

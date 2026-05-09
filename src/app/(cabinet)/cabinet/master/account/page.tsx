import { MasterAccountPage } from "@/features/master/components/account/master-account-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/account` — личные настройки master (31-final).
 * Reads `?tab=notifications|security|account`; default — notifications.
 */
export default async function MasterAccountRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterAccountPage searchParams={searchParams} />;
}

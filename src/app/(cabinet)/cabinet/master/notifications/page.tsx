import { MasterNotificationsPage } from "@/features/master/components/notifications/master-notifications-page";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/cabinet/master/notifications` — full redesign (26-NOTIF-A2). Backend
 * split, sidebar/navbar counters and route foundation come from
 * 26-NOTIF-A1; this commit replaces the placeholder list with the
 * production-grade page (KPI cards, 9 tabs, day-grouped feed, per-type
 * action buttons).
 */
export default async function MasterNotificationsRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return <MasterNotificationsPage searchParams={searchParams} />;
}

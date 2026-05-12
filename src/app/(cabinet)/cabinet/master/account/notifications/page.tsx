import { NotificationsTab } from "@/features/master/components/account/tabs/notifications-tab";

/**
 * `/cabinet/master/account/notifications` (fix-04a sub-page).
 *
 * The tab content was previously rendered inside the orchestrator
 * `<MasterAccountPage>` switch — now it's a dedicated route under
 * the shared `account/layout.tsx`.
 */
export default function NotificationsRoute() {
  return <NotificationsTab />;
}

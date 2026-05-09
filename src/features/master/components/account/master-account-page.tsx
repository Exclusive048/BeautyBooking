import { redirect } from "next/navigation";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterAccountView } from "@/lib/master/account-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { AccountTabs, type AccountTabId } from "./account-tabs";
import { AccountTab } from "./tabs/account-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
import { SecurityTab } from "./tabs/security-tab";

const T = UI_TEXT.cabinetMaster;

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SearchParams>;
};

const VALID_TABS: ReadonlySet<AccountTabId> = new Set(["notifications", "security", "account"]);

function readString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseTab(value: string | null): AccountTabId {
  if (value && VALID_TABS.has(value as AccountTabId)) {
    return value as AccountTabId;
  }
  return "notifications";
}

/**
 * Server orchestrator for `/cabinet/master/account` (31-final).
 *
 * URL state: `?tab=notifications|security|account`. Default —
 * notifications. Each tab is rendered as a separate sub-component;
 * only the active one is in the tree, so cards never paint hidden.
 */
export async function MasterAccountPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = (await searchParams) ?? {};
  const tab = parseTab(readString(params.tab));

  const data = await getMasterAccountView({ userId: user.id });
  if (!data) redirect("/403");

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.account.breadcrumb },
        ]}
        title={T.account.title}
        subtitle={T.account.subtitle}
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <AccountTabs active={tab} />

        <div className="max-w-3xl">
          {tab === "notifications" ? <NotificationsTab /> : null}
          {tab === "security" ? (
            <SecurityTab identity={data.identity} sessions={data.sessions} />
          ) : null}
          {tab === "account" ? <AccountTab data={data} /> : null}
        </div>
      </div>
    </>
  );
}

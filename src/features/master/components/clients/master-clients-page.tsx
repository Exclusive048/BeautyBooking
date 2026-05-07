import { redirect } from "next/navigation";
import { ProviderType } from "@prisma/client";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMasterClientsView,
  parseSearch,
  parseSort,
  parseTab,
} from "@/lib/master/clients-view.service";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";
import { ClientsKpiCards } from "./clients-kpi-cards";
import { ClientsPaneClient } from "./clients-pane-client";
import { ClientsSearchInput } from "./search-input";
import { ClientsSortSelect } from "./sort-select";
import { ClientsTabs } from "./clients-tabs";

const T = UI_TEXT.cabinetMaster;

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SearchParams>;
};

function readString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Server orchestrator for `/cabinet/master/clients`. Reads URL state
 * (`?tab/sort/q`), runs the view aggregator, and renders header, KPIs,
 * tabs, toolbar — all server-rendered. The list+detail panes are
 * delegated to `<ClientsPaneClient>`, which holds the active selection
 * in component state (no `?id=` in the URL — see 27a-FIX-URL).
 *
 * Filter / sort / search state remain URL-driven because they are not
 * sensitive and are useful to share or bookmark.
 */
export async function MasterClientsPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.MASTER },
    select: { id: true, timezone: true },
  });
  if (!provider) redirect("/403");

  const params = (await searchParams) ?? {};
  const tab = parseTab(readString(params.tab));
  const sort = parseSort(readString(params.sort));
  const search = parseSearch(readString(params.q));

  const data = await getMasterClientsView({
    providerId: provider.id,
    timezone: provider.timezone,
    activeTab: tab,
    sort,
    search,
  });

  const isFiltering = tab !== "all" || Boolean(search);

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.clients.breadcrumb },
        ]}
        title={T.clients.title}
        subtitle={T.clients.subtitle}
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <ClientsKpiCards stats={data.kpi} />

        <div className="space-y-4">
          <ClientsTabs
            activeTab={data.activeTab}
            tabCounts={data.tabCounts}
            sort={data.sort}
            search={data.search}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <ClientsSearchInput defaultValue={data.search} />
            </div>
            <ClientsSortSelect value={data.sort} />
          </div>
        </div>

        <ClientsPaneClient initialClients={data.clients} isFiltering={isFiltering} />
      </div>
    </>
  );
}

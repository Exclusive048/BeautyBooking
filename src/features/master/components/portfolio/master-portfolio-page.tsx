import { redirect } from "next/navigation";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMasterPortfolioView,
  parsePortfolioFilter,
} from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { AddButton } from "./add-button";
import { PortfolioEmptyState } from "./portfolio-empty-state";
import { PortfolioFilterChips } from "./portfolio-filter-chips";
import { PortfolioGrid } from "./portfolio-grid";
import { PortfolioKpiStrip } from "./portfolio-kpi-strip";

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
 * Server orchestrator for `/cabinet/master/portfolio` (31b).
 *
 * URL state:
 *   `?filter=` — all (default) / public / hidden
 *   `?cat=`    — global category id (or absent)
 *
 * Filtering is server-side; the client only needs to handle the
 * mutation modals + reorder buttons + small bits of menu state.
 */
export async function MasterPortfolioPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = (await searchParams) ?? {};
  const filter = parsePortfolioFilter(readString(params.filter));
  const categoryId = readString(params.cat);

  const view = await getMasterPortfolioView({ userId: user.id, filter, categoryId });
  if (!view) redirect("/403");

  const isFullyEmpty = view.kpi.totalCount === 0;

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.profile.breadcrumb, href: "/cabinet/master/profile" },
          { label: T.portfolioPage.breadcrumb },
        ]}
        title={T.portfolioPage.title}
        subtitle={T.portfolioPage.subtitle}
        actions={
          isFullyEmpty ? null : <AddButton categories={view.categoriesAll} />
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        {isFullyEmpty ? (
          <PortfolioEmptyState categories={view.categoriesAll} />
        ) : (
          <>
            <PortfolioKpiStrip kpi={view.kpi} />
            <PortfolioFilterChips
              filterCounts={view.filterCounts}
              activeFilter={view.activeFilter}
              categories={view.categoriesUsed}
              activeCategoryId={view.activeCategoryId}
            />
            <PortfolioGrid
              items={view.items}
              categories={view.categoriesAll}
              services={view.services}
              masterTags={view.masterTags}
            />
          </>
        )}
      </div>
    </>
  );
}

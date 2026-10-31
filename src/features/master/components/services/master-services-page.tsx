import { redirect } from "next/navigation";
import { SubscriptionScope } from "@prisma/client";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import {
  getMasterServicesView,
  parseServicesFilter,
} from "@/lib/master/services-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { AddBundleButton } from "./add-bundle-button";
import { AddServiceButton } from "./add-service-button";
import { ServicesCategorizedList } from "./services-categorized-list";
import { ServicesEmptyState } from "./services-empty-state";
import { ServicesFilterChips } from "./services-filter-chips";

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
 * Server orchestrator for `/cabinet/master/services` (31c).
 *
 * URL state: `?filter=` (all/services/bundles/disabled). Online-payment
 * toggle is plan-gated — `onlinePaymentsAvailable` flows down to both
 * the create button and the edit modal so the toggle is locked for FREE
 * masters.
 */
export async function MasterServicesPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = (await searchParams) ?? {};
  const filter = parseServicesFilter(readString(params.filter));

  const [view, plan] = await Promise.all([
    getMasterServicesView({ userId: user.id, filter }),
    getCurrentPlan(user.id, SubscriptionScope.MASTER),
  ]);
  if (!view) redirect("/403");

  const onlinePaymentsAvailable =
    Boolean(plan.features.onlinePayments) && Boolean(plan.system.onlinePaymentsEnabled);
  const isFullyEmpty = view.filterCounts.all === 0;

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.profile.breadcrumb, href: "/cabinet/master/profile" },
          { label: T.servicesPage.breadcrumb },
        ]}
        title={T.servicesPage.title}
        actions={
          isFullyEmpty ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <AddBundleButton allServices={view.allServicesFlat} />
              <AddServiceButton
                categories={view.availableCategories}
                onlinePaymentsAvailable={onlinePaymentsAvailable}
              />
            </div>
          )
        }
      />

      <div className="space-y-4 px-4 pb-6 pt-3 md:px-6 md:pt-4 lg:px-8">
        {isFullyEmpty ? (
          <ServicesEmptyState
            categories={view.availableCategories}
            onlinePaymentsAvailable={onlinePaymentsAvailable}
          />
        ) : (
          <>
            <ServicesFilterChips
              filterCounts={view.filterCounts}
              activeFilter={view.activeFilter}
            />
            <ServicesCategorizedList
              categorizedServices={view.categorizedServices}
              bundles={view.bundles}
              allServices={view.allServicesFlat}
              categories={view.availableCategories}
              onlinePaymentsAvailable={onlinePaymentsAvailable}
            />
          </>
        )}
      </div>
    </>
  );
}

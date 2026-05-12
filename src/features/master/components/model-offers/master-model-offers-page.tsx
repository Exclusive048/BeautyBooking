import { redirect } from "next/navigation";
import { ProviderType } from "@prisma/client";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterModelOffersView } from "@/lib/master/model-offers-view.service";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";
import { ActiveOffersSection } from "./active-offers-section";
import { ArchiveSection } from "./archive-section";
import { OffersKpiCards } from "./offers-kpi-cards";
import { PendingApplicationsSection } from "./pending-applications-section";

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
 * Server orchestrator for `/cabinet/master/model-offers` (29a, read-only).
 *
 * Layout:
 *   ┌────────────────────────────────────┐
 *   │  Page header                       │
 *   │  KPI cards (4)                     │
 *   │  Active offers                     │
 *   │  Pending applications              │
 *   │  Archive                           │
 *   └────────────────────────────────────┘
 *
 * `?filterOffer=<id>` narrows the pending applications section to a
 * single offer (anchored as `#applications`). Mutations (create/edit/
 * approve/reject) stay on the existing API routes — they're surfaced as
 * disabled "Доступно скоро" actions in 29a; 29b will wire them up.
 */
export async function MasterModelOffersPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.MASTER },
    select: { id: true },
  });
  if (!provider) redirect("/403");

  const params = (await searchParams) ?? {};
  const filterOfferId = readString(params.filterOffer);
  const now = new Date();

  const data = await getMasterModelOffersView({
    masterProviderId: provider.id,
    filterOfferId,
    now,
  });

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.modelOffers.breadcrumb },
        ]}
        title={T.modelOffers.title}
        subtitle={T.modelOffers.subtitle}
      />

      <div className="space-y-8 px-4 py-6 md:px-6 lg:px-8">
        <OffersKpiCards kpi={data.kpi} />

        <ActiveOffersSection
          offers={data.activeOffers}
          services={data.availableServices}
          now={now}
        />

        <PendingApplicationsSection
          applications={data.pendingApplications}
          filterOptions={data.filterOptions}
          activeFilterOfferId={data.activeFilterOfferId}
          totalBeforeFilter={data.totalPendingBeforeFilter}
        />

        <ArchiveSection offers={data.archivedOffers} now={now} />
      </div>
    </>
  );
}

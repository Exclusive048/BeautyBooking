import { redirect } from "next/navigation";
import { ProviderType } from "@prisma/client";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMasterReviewsView,
  parseFilter,
} from "@/lib/master/reviews-view.service";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";
import { ReviewsFilterChips } from "./reviews-filter-chips";
import { ReviewsDistribution } from "./reviews-distribution";
import { ReviewsFeed } from "./reviews-feed";
import { ReviewsHeroCard } from "./reviews-hero-card";
import { ReviewsKpiTiles } from "./reviews-kpi-tiles";

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
 * Server orchestrator for `/cabinet/master/reviews` (28a).
 *
 * Layout:
 *   ┌────────────────────────────────┐
 *   │ Hero (rating)  │ Distribution  │
 *   │                │ KPI tiles     │
 *   ├────────────────────────────────┤
 *   │ Filter chips                   │
 *   │ Feed                           │
 *   └────────────────────────────────┘
 *
 * Service titles are fetched in a single batched query so the cards can
 * print "Маникюр + гель-лак" next to each review without inflating the
 * underlying `ReviewDto`. Master display name (used as the reply author)
 * comes from the same provider lookup that resolves the `masterProviderId`.
 */
export async function MasterReviewsPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.MASTER },
    select: { id: true, name: true },
  });
  if (!provider) redirect("/403");

  const params = (await searchParams) ?? {};
  const filter = parseFilter(readString(params.filter));

  const data = await getMasterReviewsView({
    masterProviderId: provider.id,
    currentUserId: user.id,
    currentUserRoles: user.roles,
    filter,
  });

  const bookingIds = Array.from(
    new Set(data.reviews.map((review) => review.bookingId).filter((id): id is string => Boolean(id)))
  );
  const serviceByBookingId = new Map<string, string>();
  if (bookingIds.length > 0) {
    const bookings = await prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      select: {
        id: true,
        service: { select: { name: true, title: true } },
      },
    });
    for (const row of bookings) {
      const title = row.service.title?.trim() || row.service.name;
      if (title) serviceByBookingId.set(row.id, title);
    }
  }

  const masterName =
    user.displayName?.trim() ||
    user.firstName?.trim() ||
    provider.name ||
    UI_TEXT.cabinetMaster.reviews.card.ownerName;
  const masterSeed = `master:${provider.id}`;

  const isFiltered = filter !== "all";
  const now = new Date();

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.reviews.breadcrumb },
        ]}
        title={T.reviews.title}
        subtitle={T.reviews.subtitle}
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <ReviewsHeroCard stats={data.stats} />
          </div>
          <div className="space-y-4 lg:col-span-8">
            <ReviewsDistribution
              distribution={data.stats.distribution}
              totalCount={data.stats.totalCount}
            />
            <ReviewsKpiTiles
              stats={data.stats}
              responseTimeLabel={data.avgResponseLabel}
            />
          </div>
        </div>

        <ReviewsFilterChips
          filterCounts={data.filterCounts}
          activeFilter={data.activeFilter}
        />

        <ReviewsFeed
          reviews={data.reviews}
          serviceByBookingId={serviceByBookingId}
          masterName={masterName}
          masterSeed={masterSeed}
          isFiltered={isFiltered}
          now={now}
        />
      </div>
    </>
  );
}

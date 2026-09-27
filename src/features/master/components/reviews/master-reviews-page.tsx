import { redirect } from "next/navigation";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { FocusHighlighter } from "@/components/cabinet/focus-highlighter";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMasterReviewsView,
  parseFilter,
} from "@/lib/master/reviews-view.service";
import { prisma } from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/public-id";
import { UI_TEXT } from "@/lib/ui/text";
import { ReviewsFilterChips } from "./reviews-filter-chips";
import { ReviewsDistribution } from "./reviews-distribution";
import { ReviewsFeed } from "./reviews-feed";
import { ReviewsHeroCard } from "./reviews-hero-card";
import { ReviewsKpiTiles } from "./reviews-kpi-tiles";
import { personalMasterProviderWhere, getMasterWorkProfiles } from "@/lib/master/access";

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
    where: personalMasterProviderWhere(user.id),
    select: { id: true, name: true },
  });
  if (!provider) redirect("/403");

  const params = (await searchParams) ?? {};
  const filter = parseFilter(readString(params.filter));

  // BOOKING-FLOW-AUDIT-RESIDUALS: карточки отзывов несут публичный токен
  // (`ReviewDto.id` = `encodePublicId`, rule 12), а уведомления «новый отзыв» /
  // «ответ на отзыв» ведут сюда с сырым id — подсветка не находила карточку.
  // Сырой id переписывается в токен здесь, поэтому работают и уже отправленные
  // уведомления.
  const focus = readString(params.focus);
  if (focus && decodePublicId(focus) === focus) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = readString(value);
      if (single !== null && key !== "focus") next.set(key, single);
    }
    next.set("focus", encodePublicId(focus));
    redirect(`/cabinet/master/reviews?${next.toString()}`);
  }

  const data = await getMasterReviewsView({
    masterProviderId: provider.id,
    // STUDIO-MASTER-PROFILES (этап 4): отзывы личного профиля и профилей в студиях.
    workProfileIds: (await getMasterWorkProfiles(user.id)).allIds,
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
      <FocusHighlighter />

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

import { redirect } from "next/navigation";
import { AnnouncementsSection } from "@/features/master/components/dashboard/announcements-section";
import { AttentionSection } from "@/features/master/components/dashboard/attention-section";
import { GreetingHero } from "@/features/master/components/dashboard/greeting-hero";
import { KpiCardsGrid } from "@/features/master/components/dashboard/kpi-cards-grid";
import { QuickActionsSection } from "@/features/master/components/dashboard/quick-actions-section";
import { UpcomingBookingsSection } from "@/features/master/components/dashboard/upcoming-bookings-section";
import { NewBookingButton } from "@/features/master/components/manual-booking/new-booking-button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { NotificationButton } from "@/features/master/components/notification-button";
import { getSessionUser, getSessionUserId } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterDashboardData } from "@/lib/master/dashboard.service";
import { getUnreadBadgeCount } from "@/lib/notifications/badge";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * Master cabinet dashboard — `/cabinet/master/dashboard`.
 *
 * Rewritten in 23b as a thin server-component orchestrator. All data
 * (today's bookings, KPIs, attention items, services for the manual
 * modal) comes from `getMasterDashboardData` which fans out into a single
 * `Promise.all`. Two client islands handle interactive bits:
 *   - `<ManualBookingModal>` — listens to `?manual=1` to open
 *   - `<BookingActionButtons>` — confirm/decline pending bookings inline
 *
 * The pre-23b version was a 1488-line client component with a free-slots
 * carousel, story-card generator, date browser, and inline chat — all
 * removed in favour of the reference design. Free-slots logic now lives
 * inside the dashboard service as a "first big gap" hint surfaced through
 * the attention panel; the rest moved to dedicated pages or got dropped.
 */
export async function MasterDashboardPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const masterId = await getCurrentMasterProviderId(userId);
  // `getUnreadBadgeCount` is wrapped in `React.cache` and was already called
  // by the layout — re-using it here costs nothing and lets the page header
  // surface the same number the sidebar shows.
  const [data, unreadBadge] = await Promise.all([
    getMasterDashboardData({ masterId }),
    getUnreadBadgeCount({ userId, phone: sessionUser.phone ?? null, context: "master" }),
  ]);

  const firstName =
    sessionUser.firstName?.trim() ||
    sessionUser.displayName?.trim()?.split(/\s+/)[0] ||
    data.master.name.split(/\s+/)[0] ||
    "мастер";

  const now = new Date();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const adviceContext = {
    bookingsCount: data.todayBookings.length,
    hasPendingBookings: data.pendingBookings.length > 0,
    hasFreeSlotInNextHour: Boolean(
      data.freeSlot &&
        data.freeSlot.startAtUtc.getTime() - now.getTime() <= 60 * 60_000,
    ),
    isWeekend,
  };

  const next = data.upcomingBookings.find((b) => b.startAtUtc > now) ?? null;
  const nextBooking = next
    ? {
        startAtUtc: next.startAtUtc,
        clientName: next.clientName,
        serviceTitle: next.serviceTitle,
        clientAvatarUrl: null,
      }
    : null;

  const publicProfileUrl = data.master.publicUsername
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/u/${data.master.publicUsername}` || `/u/${data.master.publicUsername}`
    : null;

  const HEADER = UI_TEXT.cabinetMaster.pageHeader;
  const HOME_TITLE = UI_TEXT.cabinetMaster.pageTitles.home;

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: HEADER.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: HOME_TITLE.title },
        ]}
        title={HOME_TITLE.title}
        subtitle={HOME_TITLE.subtitle}
        actions={
          <>
            <NotificationButton count={unreadBadge.count} />
            <NewBookingButton label={HEADER.newBookingCta} className="rounded-xl" />
          </>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <GreetingHero
          firstName={firstName}
          now={now}
          context={adviceContext}
          nextBooking={nextBooking}
        />

        <KpiCardsGrid
          todayRevenue={data.kpis.todayRevenue}
          todayBookingsCount={data.kpis.todayBookingsCount}
          todayCapacityHours={data.kpis.todayCapacityHours}
          weekRevenue={data.kpis.weekRevenue}
          newClientsCount={data.kpis.newClientsCount}
          returningClientsCount={data.kpis.returningClientsCount}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
          <UpcomingBookingsSection
            upcoming={data.upcomingBookings}
            totalTodayCount={data.todayBookings.length}
            providerId={data.master.id}
          />
          <AttentionSection
            pendingBookings={data.pendingBookings}
            unansweredReviews={data.unansweredReviews}
            freeSlot={data.freeSlot}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <QuickActionsSection publicProfileUrl={publicProfileUrl} />
          <AnnouncementsSection />
        </div>
      </div>

    </>
  );
}

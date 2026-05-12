import { ProviderType, SubscriptionScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { ManualBookingProvider } from "@/features/master/components/manual-booking/manual-booking-provider";
import { MasterSidebar } from "@/features/master/components/master-sidebar";
import { MasterBottomNav } from "@/features/master/components/master-bottom-nav";
import { TrialEndingBanner } from "@/features/cabinet/components/trial-ending-banner";
import { getSessionUser, getSessionUserId } from "@/lib/auth/session";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { getPendingBookingsCountForMaster } from "@/lib/bookings/counts";
import { getMasterManualBookingData } from "@/lib/master/manual-booking-data.service";
import { getUnreadBadgeCount } from "@/lib/notifications/badge";
import { getUnansweredReviewsCountForMaster } from "@/lib/reviews/counts";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";

export default async function MasterCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const [sessionUser, master] = await Promise.all([
    getSessionUser(),
    prisma.provider.findFirst({
      where: { ownerUserId: userId, type: ProviderType.MASTER },
      select: {
        id: true,
        avatarUrl: true,
        name: true,
        publicUsername: true,
        masterProfile: { select: { id: true } },
      },
    }),
  ]);
  if (!master || !master.masterProfile) redirect("/403");

  // Resolve every counter and trial state in one round-trip. React.cache on
  // each helper means downstream RSCs can call them again for free during
  // this render.
  const [
    subscription,
    pendingBookings,
    unreadBadge,
    unansweredReviews,
    manualBookingData,
  ] = await Promise.all([
    getCurrentSubscriptionRow(userId, SubscriptionScope.MASTER),
    getPendingBookingsCountForMaster(master.id),
    getUnreadBadgeCount({ userId, phone: sessionUser?.phone ?? null, context: "master" }),
    getUnansweredReviewsCountForMaster(master.id),
    getMasterManualBookingData(userId),
  ]);

  const trialActive = isActiveTrial(subscription);
  const daysLeft = trialActive ? trialDaysLeft(subscription.trialEndsAt) : 0;
  const showBanner = trialActive && daysLeft > 0 && daysLeft <= 3;

  const userName =
    sessionUser?.displayName?.trim() ||
    sessionUser?.firstName?.trim() ||
    master.name ||
    UI_TEXT.brand.name;

  return (
    <ManualBookingProvider data={manualBookingData}>
      {showBanner ? <TrialEndingBanner daysLeft={daysLeft} /> : null}
      {/* Full-width cabinet shell. Layout owns three concerns only:
            1. Desktop sidebar column
            2. Main content slot (no padding, no max-width — pages decide)
            3. Mobile bottom-nav (with pb-24 padding here so layout-level)
          The per-page header lives inside each page as `<MasterPageHeader>`,
          giving every screen control over its own breadcrumb / title /
          actions instead of a one-size-fits-all topbar. */}
      <div className="flex min-h-screen bg-bg-page">
        <div className="hidden border-r border-border-subtle lg:block lg:shrink-0">
          <div className="sticky top-0 h-screen overflow-y-auto">
            <MasterSidebar
              counts={{
                pendingBookings,
                unreadNotifications: unreadBadge.count,
                unansweredReviews,
              }}
              user={{
                name: userName,
                avatarUrl: master.avatarUrl,
              }}
              trial={{
                isTrial: trialActive,
                daysLeft,
              }}
              planTier={subscription?.planTier ?? "FREE"}
              publicUsername={master.publicUsername}
            />
          </div>
        </div>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>

        <MasterBottomNav pendingBookingsCount={pendingBookings} />
      </div>
    </ManualBookingProvider>
  );
}

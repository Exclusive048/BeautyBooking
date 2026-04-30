import { ProviderType, SubscriptionScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { MasterCabinetTopbar } from "@/features/master/components/master-cabinet-topbar";
import { MasterSidebar } from "@/features/master/components/master-sidebar";
import { MasterBottomNav } from "@/features/master/components/master-bottom-nav";
import { TrialEndingBanner } from "@/features/cabinet/components/trial-ending-banner";
import { TrialStatusBadge } from "@/features/cabinet/components/trial-status-badge";
import { getSessionUserId } from "@/lib/auth/session";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";

export default async function MasterCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const master = await prisma.provider.findFirst({
    where: { ownerUserId: userId, type: ProviderType.MASTER },
    select: {
      ratingAvg: true,
      rating: true,
      studioId: true,
      masterProfile: { select: { id: true } },
      studio: { select: { name: true } },
      publicUsername: true,
    },
  });
  if (!master || !master.masterProfile) redirect("/403");

  const rating = master.ratingAvg > 0 ? master.ratingAvg : master.rating;
  const ratingLabel =
    rating > 0
      ? `${UI_TEXT.master.sidebar.ratingLabel} ${rating.toFixed(1)}`
      : UI_TEXT.master.sidebar.noRating;
  const studioName = master.studio?.name ?? null;

  // Trial status — read once at layout level; React.cache shares the row with
  // anything else on this RSC render that needs it.
  const subscription = await getCurrentSubscriptionRow(userId, SubscriptionScope.MASTER);
  const trialActive = isActiveTrial(subscription);
  const daysLeft = trialActive ? trialDaysLeft(subscription.trialEndsAt) : 0;
  const showBanner = trialActive && daysLeft > 0 && daysLeft <= 3;

  return (
    <>
      {showBanner ? <TrialEndingBanner daysLeft={daysLeft} /> : null}
      <div className="flex min-h-screen bg-bg-base">
      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:shrink-0 border-r border-border-subtle">
        {/* h-screen on sticky so sidebar fills viewport height;
            the aside inside uses h-full to pin "Моя страница" to the bottom. */}
        <div className="sticky top-0 h-screen overflow-y-auto">
          <MasterSidebar
            ratingLabel={ratingLabel}
            publicUsername={master.publicUsername}
          />
        </div>
      </div>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — visible only on mobile/tablet (lg:hidden) */}
        <div className="lg:hidden">
          <MasterCabinetTopbar
            ratingLabel={ratingLabel}
            studioName={studioName}
            isStudioMember={Boolean(master.studioId)}
          />
        </div>

        <main className="min-w-0 flex-1 p-4 pb-24 md:p-6 lg:p-8 lg:pb-8">
          <div className="mx-auto w-full max-w-6xl">
            {trialActive && daysLeft > 0 ? (
              <div className="mb-4 flex justify-end">
                <TrialStatusBadge trialEndsAt={subscription.trialEndsAt.toISOString()} />
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MasterBottomNav />
    </div>
    </>
  );
}

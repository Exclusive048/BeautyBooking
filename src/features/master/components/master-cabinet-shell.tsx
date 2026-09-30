import { SubscriptionScope } from "@prisma/client";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SetupGuideHint } from "@/features/cabinet/setup-guide/setup-guide-hint";
import { ManualBookingProvider } from "@/features/master/components/manual-booking/manual-booking-provider";
import { MasterSidebar } from "@/features/master/components/master-sidebar";
import { MasterBottomNav } from "@/features/master/components/master-bottom-nav";
import { TrialEndingBanner } from "@/features/cabinet/components/trial-ending-banner";
import { getSessionUser } from "@/lib/auth/session";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { getPendingBookingsCountForMaster } from "@/lib/bookings/counts";
import { getMasterManualBookingData } from "@/lib/master/manual-booking-data.service";
import { getUnreadBadgeCount } from "@/lib/notifications/badge";
import { getUnansweredReviewsCountForMaster } from "@/lib/reviews/counts";
import { countUnreadChatMessages } from "@/lib/chat/conversation-aggregator";
import { prisma } from "@/lib/prisma";
import * as UI_TEXT from "@/lib/ui/text";
import { personalMasterProviderWhere, getMasterWorkProfiles } from "@/lib/master/access";

/**
 * The master cabinet shell — sidebar (desktop) + full-width main slot +
 * mobile bottom-nav + trial banner + manual-booking context.
 *
 * FIX-VISUAL-POLISH G7: extracted verbatim from
 * `(cabinet)/cabinet/master/layout.tsx` so a page that does NOT sit under
 * that layout — notably the shared `/cabinet/billing` (master scope) — can
 * render inside the same shell (with the sidebar) instead of bare. Single
 * source of truth: the layout now delegates here too.
 *
 * Every counter/trial helper is `React.cache`d, so calling this from a
 * route outside the master layout costs the same as the layout did.
 */
export async function MasterCabinetShell({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [sessionUser, master] = await Promise.all([
    getSessionUser(),
    prisma.provider.findFirst({
      where: personalMasterProviderWhere(userId),
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
  // STUDIO-MASTER-PROFILES (этап 4): бейдж «Записи» — по всем профилям мастера.
  const workProfiles = await getMasterWorkProfiles(userId);

  const [
    subscription,
    pendingBookings,
    unreadBadge,
    unansweredReviews,
    manualBookingData,
    unreadMessages,
  ] = await Promise.all([
    getCurrentSubscriptionRow(userId, SubscriptionScope.MASTER),
    getPendingBookingsCountForMaster(workProfiles.allIds),
    getUnreadBadgeCount({ userId, phone: sessionUser?.phone ?? null, context: "master" }),
    getUnansweredReviewsCountForMaster(master.id),
    getMasterManualBookingData(userId),
    countUnreadChatMessages({ userId, perspective: "MASTER" }),
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
      <div className="flex min-h-screen bg-bg-page">
        <div className="hidden border-r border-border-subtle lg:block lg:shrink-0">
          <div className="sticky top-[var(--topbar-h)] h-[calc(100dvh-var(--topbar-h))] overflow-y-auto">
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

        {/* PWA-FIX-06 — зазор под фиксированной нижней навигацией считается от её
            реальной высоты (48px строка, `BottomTabBar`) плюс safe-area, а не
            круглым `pb-24` (96px). Спейсер в потоке здесь не работает: шелл —
            `display:flex` в РЯД, и спейсер стал бы нулевым по ширине
            флекс-элементом рядом с `<main>`, ничего не добавляя снизу. То есть
            единственный работающий зазор — этот. */}
        <main
          data-testid="page-main"
          className="guide-space min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
        >
          {children}
        </main>

        {/* SETUP-GUIDE-01: подсказка шага «Первых шагов» (`?guide=`). */}
        <Suspense fallback={null}>
          <SetupGuideHint scope="master" />
        </Suspense>

        <MasterBottomNav
          pendingBookingsCount={pendingBookings}
          attention={{
            notifications: unreadBadge.count,
            messages: unreadMessages,
            reviews: unansweredReviews,
          }}
        />
      </div>
    </ManualBookingProvider>
  );
}

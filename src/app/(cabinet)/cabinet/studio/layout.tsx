import { SubscriptionScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { StudioSidebar } from "@/features/studio-cabinet/components/studio-sidebar";
import { StudioBottomNav } from "@/features/studio-cabinet/components/studio-bottom-nav";
import { getStudioSidebarCounts } from "@/features/studio-cabinet/server/sidebar-counts.service";
import { getStudioShellInfo } from "@/features/studio-cabinet/server/studio-info.service";
import { TrialEndingBanner } from "@/features/cabinet/components/trial-ending-banner";
import { TrialStatusBadge } from "@/features/cabinet/components/trial-status-badge";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { UI_TEXT } from "@/lib/ui/text";

export default async function StudioCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasAccess = await hasStudioAdminAccess(user.id);
  if (!hasAccess) redirect("/403");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const [studioInfo, sidebarCounts, subscription] = await Promise.all([
    getStudioShellInfo(studioId),
    getStudioSidebarCounts({
      studioId,
      userId: user.id,
      phone: user.phone ?? null,
    }),
    getCurrentSubscriptionRow(user.id, SubscriptionScope.STUDIO),
  ]);

  const trialActive = isActiveTrial(subscription);
  const daysLeft = trialActive ? trialDaysLeft(subscription.trialEndsAt) : 0;
  const showBanner = trialActive && daysLeft > 0 && daysLeft <= 3;

  const userName =
    user.displayName?.trim() ||
    user.firstName?.trim() ||
    studioInfo?.name ||
    UI_TEXT.studioCabinet.layout.studioFallbackName;

  const studioForShell = {
    name: studioInfo?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName,
    publicHref: studioInfo?.publicHref ?? null,
  };

  return (
    <>
      {showBanner ? <TrialEndingBanner daysLeft={daysLeft} /> : null}
      {/* STUDIO-POLISH-A: mirror master cabinet layout — sidebar column +
          full-width main with padding. The intermediate centered max-w-6xl
          wrapper was removed so studio content fills the available width
          (matching `/cabinet/master/*` ergonomics on wide displays). The
          per-cabinet topbar was also removed: theme toggle lives in the
          global public header, public-studio link lives in the sidebar —
          a sticky studio chrome row was duplicate noise. */}
      <div className="flex min-h-screen bg-bg-page">
        {/* Desktop sidebar */}
        <div className="hidden border-r border-border-subtle lg:block lg:shrink-0">
          {/* FIX-BATCH-A: park below the now-sticky global navbar (see master layout). */}
          <div className="sticky top-[var(--topbar-h)] h-[calc(100dvh-var(--topbar-h))] overflow-y-auto">
            <StudioSidebar
              counts={sidebarCounts}
              user={{
                name: userName,
                avatarUrl: studioInfo?.avatarUrl ?? null,
              }}
              studio={{
                name: studioForShell.name,
                publicHref: studioForShell.publicHref,
              }}
            />
          </div>
        </div>

        {/* Main content column — full width, padding only */}
        <main className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-6 lg:px-8 lg:pb-8">
          {trialActive && daysLeft > 0 ? (
            <div className="mb-4 flex justify-end">
              <TrialStatusBadge trialEndsAt={subscription.trialEndsAt.toISOString()} />
            </div>
          ) : null}
          {children}
        </main>

        {/* Mobile bottom nav */}
        <StudioBottomNav counts={sidebarCounts} />
      </div>
    </>
  );
}

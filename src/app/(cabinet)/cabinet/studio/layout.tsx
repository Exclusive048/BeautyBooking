import { SubscriptionScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { StudioNavbar } from "@/features/studio-cabinet/components/studio-navbar";
import { StudioSidebar } from "@/features/studio-cabinet/components/studio-sidebar";
import { StudioBottomNav } from "@/features/studio-cabinet/components/studio-bottom-nav";
import { TrialEndingBanner } from "@/features/cabinet/components/trial-ending-banner";
import { TrialStatusBadge } from "@/features/cabinet/components/trial-status-badge";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { providerPublicUrl } from "@/lib/public-urls";
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

  const providerRes = await serverApiFetch<{
    provider: { id: string; name: string; publicUsername: string | null } | null;
  }>(`/api/providers/me?studioId=${encodeURIComponent(studioId)}`);

  const provider = providerRes.ok ? providerRes.data.provider : null;
  const studioName = provider?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;
  const publicHref = provider?.publicUsername
    ? providerPublicUrl({ id: provider.id, publicUsername: provider.publicUsername }, "studio-cabinet") ?? "/cabinet/studio/settings"
    : "/cabinet/studio/settings";
  const publicHint = provider?.publicUsername
    ? null
    : UI_TEXT.studioCabinet.layout.publicUsernameHint;

  // Trial status — read once at layout level; React.cache shares the row.
  const subscription = await getCurrentSubscriptionRow(user.id, SubscriptionScope.STUDIO);
  const trialActive = isActiveTrial(subscription);
  const daysLeft = trialActive ? trialDaysLeft(subscription.trialEndsAt) : 0;
  const showBanner = trialActive && daysLeft > 0 && daysLeft <= 3;

  return (
    <>
      {showBanner ? <TrialEndingBanner daysLeft={daysLeft} /> : null}
      <div className="flex min-h-screen bg-bg-base">
      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:shrink-0 border-r border-border-subtle">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <StudioSidebar studioName={studioName} publicHref={publicHref} publicHint={publicHint} />
        </div>
      </div>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar */}
        <div className="lg:hidden">
          <StudioNavbar studioName={studioName} publicHref={publicHref} publicHint={publicHint} />
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
      <StudioBottomNav />
    </div>
    </>
  );
}

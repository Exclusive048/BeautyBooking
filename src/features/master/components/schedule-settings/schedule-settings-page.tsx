import Link from "next/link";
import { redirect } from "next/navigation";
import { SubscriptionScope } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import { UI_TEXT } from "@/lib/ui/text";
import { SaveStatusIndicator } from "./save-status-indicator";
import { SaveStatusProvider } from "./save-status-provider";
import { ScheduleSettingsBody } from "./schedule-settings-body";

const T = UI_TEXT.cabinetMaster;
const S = UI_TEXT.cabinetMaster.scheduleSettings;

/**
 * Server orchestrator for `/cabinet/master/schedule/settings`. Wraps
 * <SaveStatusProvider> around both the page header (so the actions slot
 * can show the auto-save chip) and the form body, then hands off to the
 * client tabs. The legacy <MasterScheduleEditor> is no longer mounted
 * here — it lives at the studio cabinet until that flow is rebuilt.
 */
export async function ScheduleSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const providerId = await getCurrentMasterProviderId(user.id);
  const [snapshot, provider, plan] = await Promise.all([
    buildScheduleSnapshot(providerId),
    prisma.provider.findUnique({
      where: { id: providerId },
      select: { publicUsername: true },
    }),
    getCurrentPlan(user.id, SubscriptionScope.MASTER),
  ]);

  const previewHref = provider?.publicUsername ? `/u/${provider.publicUsername}` : null;
  const hotSlotsAllowed = Boolean(plan.features.hotSlots);

  return (
    <SaveStatusProvider>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.schedule.breadcrumb, href: "/cabinet/master/schedule" },
          { label: S.breadcrumb },
        ]}
        title={S.title}
        subtitle={S.subtitle}
        actions={
          <>
            <SaveStatusIndicator />
            {previewHref ? (
              <Button asChild variant="secondary" size="md" className="rounded-xl">
                <Link href={previewHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                  {S.previewCta}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="px-4 py-6 md:px-6 lg:px-8">
        <ScheduleSettingsBody initialSnapshot={snapshot} hotSlotsAllowed={hotSlotsAllowed} />
      </div>
    </SaveStatusProvider>
  );
}

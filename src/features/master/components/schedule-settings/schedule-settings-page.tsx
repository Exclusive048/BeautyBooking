import Link from "next/link";
import { redirect } from "next/navigation";
import { SubscriptionScope } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import * as UI_TEXT from "@/lib/ui/text";
import { SaveStatusIndicator } from "./save-status-indicator";
import { SaveStatusProvider } from "./save-status-provider";
import { ScheduleSettingsBody } from "./schedule-settings-body";
import { ScheduleEndpointProvider } from "./schedule-endpoint-context";
import { ScheduleProfileSwitch } from "./schedule-profile-switch";

const T = UI_TEXT.cabinetMaster;
const S = UI_TEXT.cabinetMaster.scheduleSettings;

/**
 * Server orchestrator for `/cabinet/master/schedule/settings`. Wraps
 * <SaveStatusProvider> around both the page header (so the actions slot
 * can show the auto-save chip) and the form body, then hands off to the
 * client tabs. The legacy <MasterScheduleEditor> is no longer mounted
 * here — it lives at the studio cabinet until that flow is rebuilt.
 */
export async function ScheduleSettingsPage({ profile = null }: { profile?: string | null } = {}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // STUDIO-MASTER-PROFILES (этап 4): у мастера, работающего и лично, и в
  // студии, два расписания. Личное правится сразу; расписание профиля в студии
  // — через заявку студии (тот же поток, что был у мастера студии).
  const workProfiles = await getMasterWorkProfiles(user.id);
  const activeStudioProfile = profile
    ? workProfiles.studioProfiles.find((item) => item.id === profile) ?? null
    : null;
  const providerId = activeStudioProfile?.id ?? workProfiles.personalId;
  const studioNames = workProfiles.studioProfiles.length
    ? await prisma.provider.findMany({
        where: { id: { in: workProfiles.studioProfiles.map((item) => item.studioProviderId) } },
        select: { id: true, name: true },
      })
    : [];
  const profileSwitchItems = workProfiles.studioProfiles.map((item) => ({
    id: item.id,
    studioName: studioNames.find((studio) => studio.id === item.studioProviderId)?.name ?? "",
  }));
  const [snapshot, provider, plan] = await Promise.all([
    buildScheduleSnapshot(providerId),
    prisma.provider.findUnique({
      where: { id: providerId },
      select: { publicUsername: true, studioId: true },
    }),
    getCurrentPlan(user.id, SubscriptionScope.MASTER),
  ]);

  const previewHref = provider?.publicUsername ? `/u/${provider.publicUsername}` : null;
  // Горящие окошки — личные (по своим услугам); у расписания в студии их нет.
  const hotSlotsAllowed = !activeStudioProfile && Boolean(plan.features.hotSlots);

  // QA-114 (FIX-06): a studio master's schedule edits route to a
  // ScheduleChangeRequest awaiting studio approval — surface that in the editor.
  // `Provider.studioId` references the studio's *provider* row (name lives there).
  let studioApproval: { studioName: string; pending: boolean } | null = null;
  if (provider?.studioId) {
    const [studioProvider, pendingRequest] = await Promise.all([
      prisma.provider.findUnique({
        where: { id: provider.studioId },
        select: { name: true },
      }),
      prisma.scheduleChangeRequest.findFirst({
        where: { providerId, status: "PENDING" },
        select: { id: true },
      }),
    ]);
    studioApproval = {
      studioName: studioProvider?.name ?? "",
      pending: Boolean(pendingRequest),
    };
  }

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

      <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
        {profileSwitchItems.length > 0 ? (
          <ScheduleProfileSwitch
            studioProfiles={profileSwitchItems}
            activeStudioProfileId={activeStudioProfile?.id ?? null}
          />
        ) : null}
        <ScheduleEndpointProvider studioProfileId={activeStudioProfile?.id ?? null}>
          <ScheduleSettingsBody
            key={providerId}
            initialSnapshot={snapshot}
            hotSlotsAllowed={hotSlotsAllowed}
            studioApproval={studioApproval}
          />
        </ScheduleEndpointProvider>
      </div>
    </SaveStatusProvider>
  );
}

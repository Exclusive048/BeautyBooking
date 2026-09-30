import { StudioRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { StudioDashboardPage } from "@/features/studio-cabinet/dashboard/components/studio-dashboard-page";
import { loadStudioDashboardData } from "@/features/studio-cabinet/dashboard/server/dashboard-data.service";
import { getStudioShellInfo } from "@/features/studio-cabinet/server/studio-info.service";
import { getSessionUser } from "@/lib/auth/session";
import { loadStudioSetupGuide } from "@/lib/onboarding/setup-guide";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import * as UI_TEXT from "@/lib/ui/text";

export const dynamic = "force-dynamic";

export default async function StudioCabinetIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let access: Awaited<ReturnType<typeof resolveCurrentStudioAccess>>;
  try {
    access = await resolveCurrentStudioAccess(user.id);
  } catch {
    redirect("/403");
  }
  const { studioId } = access;
  const administers = access.roles.includes(StudioRole.OWNER) || access.roles.includes(StudioRole.ADMIN);

  const [data, studioInfo, setupGuide] = await Promise.all([
    loadStudioDashboardData({ studioId }),
    getStudioShellInfo(studioId),
    // SETUP-GUIDE-01: «Первые шаги» — владельцу и администратору.
    administers ? loadStudioSetupGuide({ studioProviderId: access.providerId, studioId }) : Promise.resolve(null),
  ]);

  const studioName = studioInfo?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;

  return <StudioDashboardPage data={data} studioName={studioName} setupGuide={setupGuide} />;
}

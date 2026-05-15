import { redirect } from "next/navigation";
import { StudioDashboardPage } from "@/features/studio-cabinet/dashboard/components/studio-dashboard-page";
import { loadStudioDashboardData } from "@/features/studio-cabinet/dashboard/server/dashboard-data.service";
import { getStudioShellInfo } from "@/features/studio-cabinet/server/studio-info.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export const dynamic = "force-dynamic";

export default async function StudioCabinetIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const [data, studioInfo] = await Promise.all([
    loadStudioDashboardData({ studioId }),
    getStudioShellInfo(studioId),
  ]);

  const studioName = studioInfo?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;

  return <StudioDashboardPage data={data} studioName={studioName} />;
}

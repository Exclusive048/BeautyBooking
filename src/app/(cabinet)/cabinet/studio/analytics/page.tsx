import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { AnalyticsPage } from "@/features/analytics/ui/analytics-page";

export default async function StudioAnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    await resolveCurrentStudioAccess(user.id);
  } catch {
    redirect("/403");
  }

  return <AnalyticsPage scope="STUDIO" />;
}

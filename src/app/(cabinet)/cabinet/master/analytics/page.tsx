import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { AnalyticsPage } from "@/features/analytics/ui/analytics-page";

export default async function MasterAnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getCurrentMasterProviderId(user.id);

  return <AnalyticsPage scope="MASTER" />;
}

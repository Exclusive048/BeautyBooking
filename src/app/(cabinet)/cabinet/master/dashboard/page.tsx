import { redirect } from "next/navigation";
import { MasterDashboardPage } from "@/features/master/components/master-dashboard-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { UI_TEXT } from "@/lib/ui/text";

export default async function MasterDashboardRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await getCurrentMasterProviderId(user.id);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{UI_TEXT.master.dashboard.labels.dayTitle}</h2>
        <p className="text-sm text-neutral-600">{UI_TEXT.master.dashboard.labels.daySubtitle}</p>
      </header>
      <MasterDashboardPage />
    </section>
  );
}

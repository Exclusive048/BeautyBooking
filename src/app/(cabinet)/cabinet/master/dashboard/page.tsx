import { MasterDashboardPage } from "@/features/master/components/master-dashboard-page";
import { UI_TEXT } from "@/lib/ui/text";

export default function MasterDashboardRoute() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.master.dashboard.labels.dayTitle}</h2>
        <p className="text-sm text-text-sec">{UI_TEXT.master.dashboard.labels.daySubtitle}</p>
      </header>
      <MasterDashboardPage />
    </section>
  );
}

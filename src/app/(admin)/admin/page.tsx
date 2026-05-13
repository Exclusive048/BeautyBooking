import { AdminDashboard } from "@/features/admin-cabinet/dashboard/components/admin-dashboard";
import { getAdminCharts } from "@/features/admin-cabinet/dashboard/server/charts.service";
import { getAdminEvents } from "@/features/admin-cabinet/dashboard/server/events.service";
import { getAdminHealth } from "@/features/admin-cabinet/dashboard/server/health.service";
import { getAdminKpis } from "@/features/admin-cabinet/dashboard/server/kpis.service";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // Fetch all four datasets in parallel so TTFB is bounded by the
  // slowest aggregate, not their sum. Auth is enforced one level up in
  // `(admin)/layout.tsx`.
  const [initialKpis, initialCharts, initialEvents, initialHealth] =
    await Promise.all([
      getAdminKpis(),
      getAdminCharts(),
      getAdminEvents({ limit: 30 }),
      getAdminHealth(),
    ]);

  return (
    <AdminDashboard
      initialKpis={initialKpis}
      initialCharts={initialCharts}
      initialEvents={initialEvents}
      initialHealth={initialHealth}
    />
  );
}

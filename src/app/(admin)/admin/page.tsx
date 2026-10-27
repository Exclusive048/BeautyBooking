import { headers } from "next/headers";
import { AdminDashboard } from "@/features/admin-cabinet/dashboard/components/admin-dashboard";
import { ADMIN_DASHBOARD_EVENTS } from "@/features/admin-cabinet/dashboard/lib/event-categories";
import { getAdminCharts } from "@/features/admin-cabinet/dashboard/server/charts.service";
import { getAdminEvents } from "@/features/admin-cabinet/dashboard/server/events.service";
import { getAdminHealth } from "@/features/admin-cabinet/dashboard/server/health.service";
import { getAdminKpis } from "@/features/admin-cabinet/dashboard/server/kpis.service";
import { getSessionUser } from "@/lib/auth/session";
import { extractClientIp } from "@/lib/http/ip";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // Fetch all four datasets in parallel so TTFB is bounded by the
  // slowest aggregate, not their sum. Auth is enforced one level up in
  // `(admin)/layout.tsx`. ADMIN-EVENTS-02: события несут полные имена —
  // их чтение пишет след RKN-FIX-10 от имени смотрящего.
  const actor = await getSessionUser();
  const actorIp = extractClientIp({ headers: await headers() });
  const [initialKpis, initialCharts, initialEvents, initialHealth] =
    await Promise.all([
      getAdminKpis(),
      getAdminCharts(),
      getAdminEvents({ limit: ADMIN_DASHBOARD_EVENTS, actor: { userId: actor?.id ?? null, ip: actorIp } }),
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

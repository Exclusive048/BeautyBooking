import { Calendar, LineChart, Users, Wallet } from "lucide-react";
import { StatTileGrid } from "@/components/ui/stat-tile";
import { KpiCard } from "@/features/master/components/dashboard/kpi-card";
import { WorkContextRevenueSplit } from "@/features/master/components/work-context-revenue";
import type { RevenueSplit } from "@/lib/bookings/work-context";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

type Props = {
  todayRevenue: number;
  todayBookingsCount: number;
  todayCapacityHours: number;
  weekRevenue: number;
  newClientsCount: number;
  returningClientsCount: number;
  /**
   * STUDIO-MASTER-PROFILES (этап 3): выручка раздельно «личные / студия»
   * (`null` — мастер работает в одном контексте, подписи прежние).
   */
  revenueSplit?: { today: RevenueSplit; week: RevenueSplit } | null;
};

const T = UI_TEXT.cabinetMaster.dashboard.kpi;

/**
 * Four KPI tiles in a 2-up grid on mobile, 4-up on desktop. All values are
 * server-resolved snapshots — no trend deltas yet (sublabel carries context
 * as plain text per the 23b spec).
 */
export function KpiCardsGrid({
  todayRevenue,
  todayBookingsCount,
  todayCapacityHours,
  weekRevenue,
  newClientsCount,
  returningClientsCount,
  revenueSplit = null,
}: Props) {
  const todayBookingsValue = T.todayBookingsValueTemplate
    .replace("{count}", String(todayBookingsCount))
    .replace("{capacity}", String(Math.max(todayCapacityHours, 0)));
  const newClientsValue = T.newClientsValueTemplate.replace(
    "{count}",
    String(newClientsCount),
  );
  const returningSub = T.returningClientsTemplate.replace(
    "{count}",
    String(returningClientsCount),
  );

  return (
    <StatTileGrid columns={4}>
      <KpiCard
        icon={Wallet}
        label={T.todayRevenue}
        value={formatRub(todayRevenue)}
        sublabel={
          revenueSplit ? (
            <>
              <span className="sm:hidden">{T.todayRevenueSub}</span>
              <WorkContextRevenueSplit split={revenueSplit.today} />
            </>
          ) : (
            T.todayRevenueSub
          )
        }
      />
      <KpiCard
        icon={Calendar}
        label={T.todayBookings}
        value={todayBookingsValue}
        sublabel={T.todayBookingsSub}
      />
      <KpiCard
        icon={LineChart}
        label={T.weekRevenue}
        value={formatRub(weekRevenue)}
        sublabel={
          revenueSplit ? (
            <>
              <span className="sm:hidden">{T.weekRevenueSub}</span>
              <WorkContextRevenueSplit split={revenueSplit.week} />
            </>
          ) : (
            T.weekRevenueSub
          )
        }
      />
      <KpiCard
        icon={Users}
        label={T.newClients}
        value={newClientsValue}
        sublabel={returningSub}
      />
    </StatTileGrid>
  );
}

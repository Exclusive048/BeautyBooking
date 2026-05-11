import { Calendar, LineChart, Users, Wallet } from "lucide-react";
import { KpiCard } from "@/features/master/components/dashboard/kpi-card";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

type Props = {
  todayRevenue: number;
  todayBookingsCount: number;
  todayCapacityHours: number;
  weekRevenue: number;
  newClientsCount: number;
  returningClientsCount: number;
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <KpiCard
        icon={Wallet}
        label={T.todayRevenue}
        value={formatRub(todayRevenue)}
        sublabel={T.todayRevenueSub}
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
        sublabel={T.weekRevenueSub}
      />
      <KpiCard
        icon={Users}
        label={T.newClients}
        value={newClientsValue}
        sublabel={returningSub}
      />
    </div>
  );
}

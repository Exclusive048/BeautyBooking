import { Calendar, LineChart, Sparkles, Wallet } from "lucide-react";
import { KpiCard } from "@/features/master/components/dashboard/kpi-card";
import type { ScheduleKpi } from "@/lib/master/schedule.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.kpi;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

function pluralizeSlots(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return T.freeTodaySlotOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return T.freeTodaySlotFew;
  return T.freeTodaySlotMany;
}

type Props = {
  stats: ScheduleKpi;
};

/**
 * 4-card stats strip: bookings count, week revenue, load %, free slots
 * today. No trend deltas — same convention as the dashboard 23b row.
 */
export function ScheduleKpiCards({ stats }: Props) {
  const freeLabel =
    stats.freeSlotsToday === 0
      ? T.freeTodayNone
      : `${stats.freeSlotsToday} ${pluralizeSlots(stats.freeSlotsToday)}`;
  const freeSub = stats.firstFreeAfter
    ? T.freeTodayAfterTemplate.replace("{time}", stats.firstFreeAfter)
    : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <KpiCard
        icon={Calendar}
        label={T.weekBookings}
        value={String(stats.weekBookingsCount)}
      />
      <KpiCard
        icon={Wallet}
        label={T.weekRevenue}
        value={formatRub(stats.weekRevenue)}
      />
      <KpiCard
        icon={LineChart}
        label={T.load}
        value={`${stats.loadPct}%`}
        sublabel={T.loadHoursTemplate.replace("{hours}", String(stats.totalWorkingHours))}
      />
      <KpiCard
        icon={Sparkles}
        label={T.freeToday}
        value={freeLabel}
        sublabel={freeSub}
      />
    </div>
  );
}

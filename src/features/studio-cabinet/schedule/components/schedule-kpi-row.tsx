import { BarChart3, Calendar, Clock, Wallet, type LucideIcon } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleKpis } from "../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sublabel: string;
};

function Card({ icon: Icon, label, value, unit, sublabel }: Tile) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4 lg:p-5">
      <span
        aria-hidden
        className="mb-2 inline-grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-xs text-text-sec">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-xl tabular-nums text-text-main lg:text-2xl">
          {value}
        </span>
        {unit ? <span className="text-sm text-text-sec">{unit}</span> : null}
      </p>
      <p className="mt-0.5 text-[11px] text-text-sec">{sublabel}</p>
    </div>
  );
}

export function ScheduleKpiRow({ kpis }: { kpis: ScheduleKpis }) {
  const tiles: Tile[] = [
    {
      icon: Calendar,
      label: T.bookingsToday,
      value: kpis.bookingsCount.toLocaleString("ru-RU"),
      sublabel: T.bookingsConfirmedTemplate.replace(
        "{count}",
        String(kpis.bookingsConfirmedCount),
      ),
    },
    {
      icon: Wallet,
      label: T.revenue,
      value: UI_FMT.priceLabel(kpis.revenueKopeks),
      sublabel: T.revenueSubtitle,
    },
    {
      icon: BarChart3,
      label: T.occupancy,
      value: String(kpis.occupancyPercent),
      unit: "%",
      sublabel: T.occupancyContextTemplate.replace(
        "{masters}",
        String(kpis.mastersOnShift),
      ),
    },
    {
      icon: Clock,
      label: T.freeWindows,
      value: kpis.freeWindowsCount.toLocaleString("ru-RU"),
      sublabel: T.freeWindowsHint,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </div>
  );
}

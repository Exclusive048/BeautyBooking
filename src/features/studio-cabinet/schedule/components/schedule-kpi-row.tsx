import { BarChart3, Calendar, Clock, Wallet, type LucideIcon } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
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

// PWA-FIX-10 — локальная копия плитки заменена общим `<StatTile>`: иконка ушла
// в строку подписи вместо собственной строки с `mb-2`.
function Card({ icon, label, value, unit, sublabel }: Tile) {
  return <StatTile icon={icon} label={label} value={value} unit={unit} sublabel={sublabel} />;
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
    <StatTileGrid columns={4}>
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </StatTileGrid>
  );
}

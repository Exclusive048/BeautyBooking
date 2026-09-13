import { BarChart3, Calendar, Star, Wallet, type LucideIcon } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioMasterDetail } from "../server/types";

const T = UI_TEXT.studioCabinet.mastersV2.detail.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sublabel: string;
};

// PWA-FIX-10 - общий StatTile вместо локальной копии.
function Card({ icon, label, value, unit, sublabel }: Tile) {
  return <StatTile icon={icon} label={label} value={value} unit={unit} sublabel={sublabel} />;
}

export function MasterDetailKpis({ detail }: { detail: StudioMasterDetail }) {
  const occupancyHint =
    detail.metrics.occupancy30dPercent >= 70
      ? T.occupancyAboveNorm
      : detail.metrics.occupancy30dPercent >= 40
        ? T.occupancyOnNorm
        : T.occupancyBelowNorm;

  const tiles: Tile[] = [
    {
      icon: Wallet,
      label: T.revenue,
      value: UI_FMT.priceLabel(detail.metrics.revenue30dKopeks),
      sublabel: T.averageCheckTemplate.replace(
        "{amount}",
        UI_FMT.priceLabel(detail.averageCheckKopeks),
      ),
    },
    {
      icon: Calendar,
      label: T.bookings,
      value: detail.metrics.bookings30d.toLocaleString("ru-RU"),
      sublabel: T.bookingsSubtitle,
    },
    {
      icon: BarChart3,
      label: T.occupancy,
      value: String(detail.metrics.occupancy30dPercent),
      unit: "%",
      sublabel: occupancyHint,
    },
    {
      icon: Star,
      label: T.rating,
      value: detail.metrics.rating.toFixed(1),
      unit: "★",
      sublabel: T.reviewsTemplate.replace(
        "{count}",
        String(detail.metrics.reviewsCount),
      ),
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

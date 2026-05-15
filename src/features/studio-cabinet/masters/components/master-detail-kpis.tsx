import { BarChart3, Calendar, Star, Wallet, type LucideIcon } from "lucide-react";
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

function Card({ icon: Icon, label, value, unit, sublabel }: Tile) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <span
        aria-hidden
        className="mb-2 inline-grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-[11px] text-text-sec">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="font-display text-xl tabular-nums text-text-main">
          {value}
        </span>
        {unit ? <span className="text-xs text-text-sec">{unit}</span> : null}
      </p>
      <p className="mt-0.5 text-[10px] text-text-sec">{sublabel}</p>
    </div>
  );
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </div>
  );
}

import { BarChart3, Calendar, Star, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { DeltaTone } from "../lib/format-delta";
import type { StudioKpis } from "../server/types";

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

const T = UI_TEXT.studioCabinet.dashboardV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sublabel: string;
  delta: { text: string; tone: DeltaTone };
};

const DELTA_TONE: Record<DeltaTone, string> = {
  positive:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  negative: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  neutral: "bg-bg-input text-text-sec",
};

const DELTA_ARROW: Record<DeltaTone, string> = {
  positive: "↑",
  negative: "↓",
  neutral: "·",
};

function TileCard({ icon: Icon, label, value, unit, sublabel, delta }: Tile) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold",
            DELTA_TONE[delta.tone],
          )}
        >
          {/* FIX-VISUAL-POLISH I9: neutral (no-change) shows a clean "—"
              without the "·" arrow, so the pill never reads as a trailing
              "· 0.0" / "· 0%". Real up/down deltas keep their ↑/↓ arrow. */}
          {delta.tone === "neutral"
            ? delta.text
            : `${DELTA_ARROW[delta.tone]} ${delta.text}`}
        </span>
      </div>
      <div>
        <p className="text-xs text-text-sec">{label}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-2xl tabular-nums text-text-main lg:text-[26px]">
            {value}
          </span>
          {unit ? <span className="text-sm text-text-sec">{unit}</span> : null}
        </p>
        <p className="mt-1 text-[11px] text-text-sec">{sublabel}</p>
      </div>
    </div>
  );
}

export function StudioKpiRow({ kpis }: { kpis: StudioKpis }) {
  const tiles: Tile[] = [
    {
      icon: Wallet,
      label: T.revenue.label,
      value: formatRub(kpis.revenueKopeks.current),
      sublabel: T.revenue.subtitle,
      delta: kpis.revenueKopeks.delta,
    },
    {
      icon: Calendar,
      label: T.bookings.label,
      value: kpis.bookingsCount.current.toLocaleString("ru-RU"),
      sublabel: T.bookings.averageCheckTemplate.replace(
        "{amount}",
        formatRub(kpis.averageCheckKopeks),
      ),
      delta: kpis.bookingsCount.delta,
    },
    {
      icon: BarChart3,
      label: T.occupancy.label,
      value: String(kpis.occupancyPercent.current),
      unit: "%",
      sublabel: T.occupancy.subtitle.replace(
        "{count}",
        String(kpis.mastersOnShiftCount),
      ),
      delta: kpis.occupancyPercent.delta,
    },
    {
      icon: Star,
      label: T.rating.label,
      value: kpis.averageRating.current.toFixed(1),
      unit: "★",
      sublabel: T.rating.subtitle.replace("{count}", String(kpis.ratingCount)),
      delta: kpis.averageRating.delta,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {tiles.map((tile) => (
        <TileCard key={tile.label} {...tile} />
      ))}
    </div>
  );
}

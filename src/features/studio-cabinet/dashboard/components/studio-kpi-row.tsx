import { BarChart3, Calendar, Star, Wallet, type LucideIcon } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
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

// UI-26/27: статусная пилюля — токенами, тёмная тема внутри переменной.
const DELTA_TONE: Record<DeltaTone, string> = {
  positive: "bg-success-surface text-success-text",
  negative: "bg-danger-surface text-danger-text",
  neutral: "bg-bg-input text-text-sec",
};

const DELTA_ARROW: Record<DeltaTone, string> = {
  positive: "↑",
  negative: "↓",
  neutral: "·",
};

/**
 * PWA-FIX-10 — оболочка общая (`<StatTile>`), дельта-пилюля приезжает слотом
 * `badge` в строку подписи. Раньше пилюля и иконка занимали ОТДЕЛЬНУЮ строку
 * сверху (`flex justify-between` + `gap-3`), то есть на плитку уходило ~36px
 * вертикали под два элемента, каждый из которых помещается в строку подписи.
 */
function TileCard({ icon: Icon, label, value, unit, sublabel, delta }: Tile) {
  return (
    <StatTile
      icon={Icon}
      label={label}
      value={value}
      unit={unit}
      sublabel={sublabel}
      badge={
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold",
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
      }
    />
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
    <StatTileGrid columns={4}>
      {tiles.map((tile) => (
        <TileCard key={tile.label} {...tile} />
      ))}
    </StatTileGrid>
  );
}

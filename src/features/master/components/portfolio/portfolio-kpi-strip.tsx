import { EyeOff, ImageIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PortfolioKpi } from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.kpi;

type Props = {
  kpi: PortfolioKpi;
};

/** Three compact tiles — total / public / hidden. Mirrors the look of
 * the analytics KPI strip but slimmer, since this page already carries
 * a lot of cards below. */
export function PortfolioKpiStrip({ kpi }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile icon={ImageIcon} label={T.totalLabel} value={kpi.totalCount} accent="neutral" />
      <Tile
        icon={Sparkles}
        label={T.publicLabel}
        value={kpi.publicCount}
        accent={kpi.publicCount > 0 ? "primary" : "neutral"}
      />
      <Tile icon={EyeOff} label={T.hiddenLabel} value={kpi.hiddenCount} accent="neutral" />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ImageIcon;
  label: string;
  value: number;
  accent: "primary" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-card p-4",
        accent === "primary" && "border-primary/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-text-sec/60" aria-hidden />
      </div>
      <p
        className={cn(
          "mt-1.5 font-display text-lg",
          accent === "primary" && "text-primary",
          accent === "neutral" && "text-text-main"
        )}
      >
        {value}
      </p>
    </div>
  );
}

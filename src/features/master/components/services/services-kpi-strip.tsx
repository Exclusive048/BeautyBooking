import { Layers, Package, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ServicesKpi } from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.servicesPage.kpi;

type Props = {
  kpi: ServicesKpi;
};

export function ServicesKpiStrip({ kpi }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile icon={Layers} label={T.servicesLabel} value={kpi.servicesCount} />
      <Tile icon={Package} label={T.bundlesLabel} value={kpi.bundlesCount} />
      <Tile
        icon={EyeOff}
        label={T.disabledLabel}
        value={kpi.disabledCount}
        accent={kpi.disabledCount > 0 ? "amber" : "neutral"}
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  accent = "neutral",
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  accent?: "neutral" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-card p-4",
        accent === "amber" && "border-amber-200 dark:border-amber-900/40"
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
          accent === "amber" && "text-amber-700 dark:text-amber-300",
          accent === "neutral" && "text-text-main"
        )}
      >
        {value}
      </p>
    </div>
  );
}

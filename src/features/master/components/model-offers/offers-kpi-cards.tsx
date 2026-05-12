import { Archive, Inbox, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { OffersKpi } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.kpi;

type Props = {
  kpi: OffersKpi;
};

/**
 * Four KPI tiles at the top of the page — same shape as the
 * notifications/clients/reviews KPI strips so cabinets feel consistent.
 * Empty values render as bg-muted hints so the surface doesn't read as
 * "broken" before the master publishes anything.
 */
export function OffersKpiCards({ kpi }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={Sparkles}
        label={T.activeOffersLabel}
        value={kpi.activeOffersCount > 0 ? String(kpi.activeOffersCount) : T.activeOffersEmpty}
        accent={kpi.activeOffersCount > 0 ? "primary" : "neutral"}
      />
      <Tile
        icon={Inbox}
        label={T.pendingLabel}
        value={kpi.pendingApplicationsCount > 0 ? String(kpi.pendingApplicationsCount) : T.pendingEmpty}
        accent={kpi.pendingApplicationsCount > 0 ? "amber" : "neutral"}
      />
      <Tile
        icon={TrendingUp}
        label={T.conversionLabel}
        value={kpi.conversionRate !== null ? `${kpi.conversionRate}%` : T.conversionEmpty}
        accent="neutral"
      />
      <Tile
        icon={Archive}
        label={T.archivedLabel}
        value={kpi.archivedCount > 0 ? String(kpi.archivedCount) : T.archivedEmpty}
        accent="neutral"
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  accent: "primary" | "amber" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-card p-4",
        accent === "amber" && "border-amber-200 dark:border-amber-900/40",
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
          accent === "amber" && "text-amber-700 dark:text-amber-300",
          accent === "primary" && "text-primary",
          accent === "neutral" && "text-text-main"
        )}
      >
        {value}
      </p>
    </div>
  );
}

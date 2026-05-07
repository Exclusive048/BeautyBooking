import { Heart, Repeat, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ClientsKpi } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatRubles } from "./lib/format";

const T = UI_TEXT.cabinetMaster.clients.kpi;

type Props = {
  stats: ClientsKpi;
};

/**
 * Top-of-page KPI strip. Four uniform tiles — same layout as the
 * notifications page so cabinets feel like a coherent set. Subtext slot
 * shows the secondary metric (e.g. average LTV under the total).
 */
export function ClientsKpiCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        icon={Users}
        label={T.totalLabel}
        value={String(stats.totalCount)}
        subtext={
          stats.newThisMonthCount > 0
            ? T.totalSubtextTemplate.replace("{count}", String(stats.newThisMonthCount))
            : T.totalSubtextNone
        }
        accent={stats.newThisMonthCount > 0 ? "primary" : "neutral"}
      />
      <KpiTile
        icon={Wallet}
        label={T.ltvLabel}
        value={formatRubles(stats.totalLtv)}
        subtext={T.ltvSubtextTemplate.replace("{avg}", formatRubles(stats.avgLtv))}
        accent="neutral"
      />
      <KpiTile
        icon={Repeat}
        label={T.frequencyLabel}
        value={stats.avgFrequency.toFixed(1)}
        subtext={T.frequencySubtext}
        accent="neutral"
      />
      <KpiTile
        icon={Heart}
        label={T.retentionLabel}
        value={`${stats.retentionPct}%`}
        subtext={T.retentionSubtext}
        accent={stats.retentionPct >= 50 ? "success" : "neutral"}
      />
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  subtext,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  subtext: string;
  accent: "primary" | "success" | "neutral";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-card p-4",
        accent === "primary" && "border-primary/30",
        accent === "success" && "border-emerald-200 dark:border-emerald-900/40"
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
          accent === "success" && "text-emerald-700 dark:text-emerald-300",
          accent === "neutral" && "text-text-main"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-text-sec">{subtext}</p>
    </div>
  );
}

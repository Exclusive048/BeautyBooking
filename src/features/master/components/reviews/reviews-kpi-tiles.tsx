import { Camera, Clock, MailOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReviewStats } from "@/lib/master/reviews-stats";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.reviews.kpi;

type Props = {
  stats: ReviewStats;
  responseTimeLabel: string | null;
};

/**
 * Three KPI tiles next to the distribution chart. Layout mirrors the
 * notifications/clients KPI strips so cabinets feel consistent. The
 * "С фото" tile renders 0 / em-dash in 28a — review photos aren't on
 * the schema yet (backlog item).
 */
export function ReviewsKpiTiles({ stats, responseTimeLabel }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <KpiTile
        icon={MailOpen}
        label={T.unansweredLabel}
        value={
          stats.unansweredCount > 0
            ? String(stats.unansweredCount)
            : T.unansweredNone
        }
        accent={stats.unansweredCount > 0 ? "amber" : "neutral"}
      />
      <KpiTile
        icon={Clock}
        label={T.responseTimeLabel}
        value={responseTimeLabel ?? T.responseTimeNone}
        accent="neutral"
      />
      <KpiTile
        icon={Camera}
        label={T.photosLabel}
        value={stats.withPhotosCount > 0 ? String(stats.withPhotosCount) : T.photosNone}
        accent="neutral"
      />
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent: "amber" | "neutral";
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

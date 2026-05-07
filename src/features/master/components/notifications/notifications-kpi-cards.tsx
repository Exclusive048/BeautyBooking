import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MasterNotificationsKpi } from "@/lib/master/notifications.service";
import { UI_TEXT } from "@/lib/ui/text";
import { pluralizeRu } from "./lib/group-by-day";

const T = UI_TEXT.cabinetMaster.notifications.kpi;

type Props = {
  stats: MasterNotificationsKpi;
};

/**
 * Four-tile KPI strip at the top of the master notifications page.
 *
 * The first three tiles share a compact card layout (uppercase eyebrow +
 * large value); accent rose/amber kicks in when the count is non-zero.
 * The fourth tile is the push status — separate component because it
 * needs its own theme (success/warning) and a CTA when push is off.
 */
export function NotificationsKpiCards({ stats }: Props) {
  const todayWord = pluralizeRu(
    stats.todayCount,
    T.todayWordOne,
    T.todayWordFew,
    T.todayWordMany
  );
  const waitingWord = pluralizeRu(
    stats.waitingCount,
    T.waitingWordOne,
    T.waitingWordFew,
    T.waitingWordMany
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        label={T.unreadLabel}
        value={T.unreadValueTemplate
          .replace("{unread}", String(stats.unreadCount))
          .replace("{total}", String(stats.totalCount))}
        accent={stats.unreadCount > 0 ? "rose" : "neutral"}
      />
      <KpiTile
        label={T.todayLabel}
        value={T.todayValueTemplate
          .replace("{count}", String(stats.todayCount))
          .replace("{word}", todayWord)}
        accent="neutral"
      />
      <KpiTile
        label={T.waitingLabel}
        value={
          stats.waitingCount > 0
            ? T.waitingValueTemplate
                .replace("{count}", String(stats.waitingCount))
                .replace("{word}", waitingWord)
            : T.waitingNone
        }
        accent={stats.waitingCount > 0 ? "amber" : "neutral"}
      />
      <PushTile pushEnabled={stats.pushEnabled} />
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "rose" | "amber" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-bg-card p-4",
        accent === "rose" && "border-rose-200 dark:border-rose-900/40",
        accent === "amber" && "border-amber-200 dark:border-amber-900/40",
        accent === "neutral" && "border-border-subtle"
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-display text-lg",
          accent === "rose" && "text-rose-600 dark:text-rose-400",
          accent === "amber" && "text-amber-600 dark:text-amber-400",
          accent === "neutral" && "text-text-main"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PushTile({ pushEnabled }: { pushEnabled: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        pushEnabled
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10"
          : "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10"
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        <Bell className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
        {T.pushLabel}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            pushEnabled ? "bg-emerald-500" : "bg-amber-500"
          )}
        />
        <p
          className={cn(
            "font-display text-base",
            pushEnabled
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-700 dark:text-amber-300"
          )}
        >
          {pushEnabled ? T.pushOn : T.pushOff}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-text-sec">
        {pushEnabled ? (
          T.pushOnHint
        ) : (
          <Link
            href="/cabinet/master/account?tab=notifications"
            className="text-primary underline-offset-2 hover:underline"
          >
            {T.pushOffCta}
          </Link>
        )}
      </p>
    </div>
  );
}

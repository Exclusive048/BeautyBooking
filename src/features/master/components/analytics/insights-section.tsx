import { AlertTriangle, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Insight, InsightVariant } from "@/lib/master/analytics-insights";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.analytics.insights;

type Props = {
  insights: Insight[];
  periodLabel: string;
};

/**
 * Period-anchored insights. Renders nothing when the engine returned no
 * findings — the prompt explicitly forbids "пока пусто" placeholders
 * here (it discourages the master). The page-level guard already gates
 * this on `insights.length > 0`, but we keep a defensive null-return so
 * mis-orchestrations don't produce an empty card.
 */
export function InsightsSection({ insights, periodLabel }: Props) {
  if (insights.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="font-display text-base text-text-main">{T.heading}</h2>
        <span className="text-xs text-text-sec">
          {T.periodTemplate.replace("{period}", periodLabel)}
        </span>
      </header>

      <ul className="mt-4 space-y-3">
        {insights.map((insight) => (
          <li key={insight.id}>
            <InsightCard insight={insight} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const VARIANT_CARD: Record<InsightVariant, string> = {
  opportunity:
    "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20",
  positive:
    "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
  warning:
    "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20",
  recommendation:
    "border-slate-200 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-900/30",
};

const VARIANT_EYEBROW: Record<InsightVariant, string> = {
  opportunity: "text-rose-700 dark:text-rose-300",
  positive: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  recommendation: "text-slate-700 dark:text-slate-300",
};

const VARIANT_ICON: Record<InsightVariant, typeof AlertTriangle> = {
  opportunity: RefreshCw,
  positive: TrendingUp,
  warning: AlertTriangle,
  recommendation: Sparkles,
};

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = VARIANT_ICON[insight.variant];
  return (
    <article className={cn("rounded-xl border p-4", VARIANT_CARD[insight.variant])}>
      <div className="flex items-center gap-2">
        <Icon
          className={cn("h-4 w-4 shrink-0", VARIANT_EYEBROW[insight.variant])}
          aria-hidden
        />
        <p
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.18em]",
            VARIANT_EYEBROW[insight.variant]
          )}
        >
          {insight.title}
        </p>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-text-main">{insight.body}</p>
    </article>
  );
}

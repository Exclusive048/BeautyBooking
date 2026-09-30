import { AlertTriangle, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Insight, InsightVariant } from "@/lib/master/analytics-insights";
import * as UI_TEXT from "@/lib/ui/text";

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
        <Sparkles className="h-4 w-4 text-accent-text" aria-hidden />
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
    "border-primary/20 bg-primary/5",
  positive:
    "border-success-border bg-success-surface",
  warning:
    "border-warning-border bg-warning-surface",
  recommendation:
    "border-border bg-muted",
};

const VARIANT_EYEBROW: Record<InsightVariant, string> = {
  opportunity: "text-accent-text",
  positive: "text-success-text",
  warning: "text-warning-text",
  recommendation: "text-muted-foreground",
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

import { cn } from "@/lib/cn";
import type { FunnelStep } from "@/lib/master/analytics-funnel";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.analytics.funnel;

type Props = {
  steps: FunnelStep[] | null;
  periodLabel: string;
};

/**
 * Customer funnel section. Each row reads: stage label · drop-rate from
 * previous (color-coded) · count · % of total · proportional bar.
 *
 * The funnel is honest about narrowing: stage 4 is by definition a tiny
 * subset of stage 1 because "регулярный клиент" requires 5+ lifetime
 * visits. A new master will see "Стали постоянными — 0" and that's the
 * truth, not a bug.
 */
export function FunnelSection({ steps, periodLabel }: Props) {
  const hasData = steps && steps.length > 0 && steps[0]!.count > 0;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header>
        <h2 className="font-display text-base text-text-main">{T.heading}</h2>
        <p className="mt-0.5 text-xs text-text-sec">
          {T.subtitleTemplate.replace("{period}", periodLabel)}
        </p>
      </header>

      {hasData ? (
        <ol className="mt-5 space-y-4">
          {steps!.map((step) => (
            <FunnelStepRow key={step.id} step={step} maxCount={steps![0]!.count} />
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-8 text-center">
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyBody}</p>
        </div>
      )}
    </section>
  );
}

function FunnelStepRow({ step, maxCount }: { step: FunnelStep; maxCount: number }) {
  const widthPct = maxCount > 0 ? Math.max(2, Math.round((step.count / maxCount) * 100)) : 0;
  const stageLabel = T.stages[step.id];
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-sm text-text-main">{stageLabel}</span>
          {step.pctFromPrevious !== null ? (
            <span
              className={cn(
                "font-mono text-[11px]",
                getDropRateColor(step.pctFromPrevious)
              )}
            >
              {T.fromPreviousTemplate.replace("{value}", String(step.pctFromPrevious))}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="font-display text-base text-text-main">{step.count}</span>
          <span className="w-10 text-right font-mono text-[11px] text-text-sec">
            {step.pctFromTotal}%
          </span>
        </div>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-input">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </li>
  );
}

function getDropRateColor(pct: number): string {
  if (pct >= 80) return "text-emerald-700 dark:text-emerald-300";
  if (pct >= 50) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

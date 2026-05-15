import { cn } from "@/lib/cn";

export type ReviewsKpiTone = "ok" | "warn" | "danger" | "neutral";

type Props = {
  label: string;
  value: string;
  sublabel?: string | null;
  tone: ReviewsKpiTone;
};

const SUBLABEL_TONE: Record<ReviewsKpiTone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  neutral: "text-text-sec",
};

const DOT_TONE: Record<ReviewsKpiTone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-text-sec/40",
};

/** Single KPI tile for the reviews dashboard. Same visual contract
 * as `billing-kpi-card` (mono caption + huge value + tone-coloured
 * sublabel + status dot) but kept separate so each domain owns its
 * own KPI conventions without leaking shared abstractions. */
export function ReviewsKpiCard({ label, value, sublabel, tone }: Props) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
          {label}
        </span>
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", DOT_TONE[tone])}
        />
      </div>
      <div className="font-display text-2xl font-semibold tabular-nums tracking-tight text-text-main md:text-3xl">
        {value}
      </div>
      {sublabel ? (
        <p className={cn("mt-1 font-mono text-[11px]", SUBLABEL_TONE[tone])}>
          {sublabel}
        </p>
      ) : (
        <p className="mt-1 font-mono text-[11px] text-text-sec/60">—</p>
      )}
    </article>
  );
}

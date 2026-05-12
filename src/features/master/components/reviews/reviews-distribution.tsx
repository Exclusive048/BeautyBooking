import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReviewDistribution } from "@/lib/master/reviews-stats";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.reviews.distribution;

type Props = {
  distribution: ReviewDistribution;
  totalCount: number;
};

/**
 * 5-row horizontal bar chart, ordered top-down 5★ → 1★. Bar colour
 * follows tone rules: positive ratings (4–5★) lean rose to match the
 * brand accent, neutral 3★ sits in amber, and dissatisfied ratings
 * (1–2★) drop to slate so they read as "needs attention" without
 * shouting.
 */
export function ReviewsDistribution({ distribution, totalCount }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <p className="mb-4 text-sm font-medium text-text-main">{T.heading}</p>
      <ul className="space-y-2">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = distribution[star] ?? 0;
          const percent = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
          const tone =
            star >= 4
              ? "bg-rose-500"
              : star === 3
                ? "bg-amber-500"
                : "bg-slate-400";
          return (
            <li key={star} className="flex items-center gap-3">
              <span className="flex w-7 shrink-0 items-center gap-0.5 text-xs text-text-sec">
                {star}
                <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
              </span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-bg-input"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${star} звёзд: ${count} (${percent}%)`}
              >
                <div
                  className={cn("h-full rounded-full transition-[width]", tone)}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-xs text-text-sec tabular-nums">
                {T.rowTemplate
                  .replace("{count}", String(count))
                  .replace("{percent}", String(percent))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

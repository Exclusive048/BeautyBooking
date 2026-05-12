import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReviewStats } from "@/lib/master/reviews-stats";
import { UI_TEXT } from "@/lib/ui/text";
import { pluralize } from "@/features/master/components/clients/lib/format";
import { StarsDisplay } from "./stars-display";

const T = UI_TEXT.cabinetMaster.reviews;

type Props = {
  stats: ReviewStats;
};

/**
 * Top-left hero card for the reviews surface. Large numeric rating with
 * stars below, a one-line meta describing the review count and response
 * rate, and (optionally) a trend chip when the month-over-month delta is
 * statistically meaningful (≥ 2 reviews per side).
 *
 * The brand gradient lifts the card visually without overpowering — the
 * actual ratings sit on a tinted overlay rather than on raw burgundy so
 * the numbers stay legible in both themes.
 */
export function ReviewsHeroCard({ stats }: Props) {
  const word = pluralize(
    stats.totalCount,
    T.hero.wordOne,
    T.hero.wordFew,
    T.hero.wordMany
  );
  const meta = T.hero.basedOnTemplate
    .replace("{count}", String(stats.totalCount))
    .replace("{word}", word)
    .replace("{rate}", String(stats.responseRate));

  const trend = stats.trendValue;
  const trendUp = trend !== null && trend > 0;
  const trendDown = trend !== null && trend < 0;
  const trendLabel =
    trend === null
      ? null
      : trend > 0
        ? T.hero.trendUpTemplate.replace("{value}", trend.toFixed(1))
        : T.hero.trendDownTemplate.replace("{value}", trend.toFixed(1));

  return (
    <article className="flex h-full flex-col justify-between rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold text-primary">
            {stats.avgRating.toFixed(1)}
          </span>
          <span className="text-lg text-text-sec">{T.hero.outOfFive}</span>
        </div>

        <div className="mt-3">
          <StarsDisplay rating={stats.avgRating} size="lg" />
        </div>

        <p className="mt-3 text-sm text-text-sec">{meta}</p>
      </div>

      {trendLabel ? (
        <p
          className={cn(
            "mt-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em]",
            trendUp && "text-emerald-700 dark:text-emerald-300",
            trendDown && "text-rose-700 dark:text-rose-300"
          )}
        >
          {trendUp ? (
            <TrendingUp className="h-3 w-3" aria-hidden />
          ) : trendDown ? (
            <TrendingDown className="h-3 w-3" aria-hidden />
          ) : null}
          {trendLabel}
        </p>
      ) : null}
    </article>
  );
}

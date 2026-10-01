import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioReviewsStarBucket } from "../lib/types";

const T = UI_TEXT.studioCabinet.reviewsV2.stats;

type Props = {
  distribution: StudioReviewsStarBucket[];
};

const BAR_TONE: Record<number, string> = {
  5: "bg-success/80",
  4: "bg-success/70",
  3: "bg-warning/70",
  2: "bg-destructive/50",
  1: "bg-destructive/70",
};

/**
 * 5..1★ horizontal bars with count + percent. Tone tracks rating —
 * green for 5/4, amber for 3, orange/rose for 2/1 — so an admin can
 * eyeball "lots of low ratings" without parsing numbers.
 */
export function RatingDistributionCard({ distribution }: Props) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <p className="eyebrow">
        {T.distributionTitle}
      </p>
      <ul className="mt-3 space-y-2">
        {distribution.map((bucket) => (
          <li key={bucket.stars} className="flex items-center gap-2 text-sm">
            <span className="w-6 shrink-0 text-text-sec">{bucket.stars}★</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-input">
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-[width]",
                  BAR_TONE[bucket.stars] ?? "bg-text-sec/40",
                )}
                style={{ width: `${bucket.percent}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-text-sec">
              {bucket.count}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-text-sec">
              {bucket.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

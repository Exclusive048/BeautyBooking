import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  rating: number;
  /** Compact 13px (display next to author name) vs default 16px. */
  size?: "sm" | "md";
};

/** 5-star display. Filled stars get the amber rating colour; empty
 * use the subtle border colour. Always non-interactive — admin
 * doesn't change ratings, only sees them. */
export function ReviewRatingStars({ rating, size = "sm" }: Props) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  const dim = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} из 5`}
    >
      {Array.from({ length: 5 }).map((_, idx) => (
        <Star
          key={idx}
          className={cn(
            dim,
            idx < filled
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-border-subtle",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  value: number; // 0..5 (can be non-integer for averages)
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

/**
 * Filled-star count is `Math.round(value)`. Fractional averages are
 * shown as the nearest whole — the numeric label (e.g. «4.85») carries
 * the precision. Keeps the visual scannable in lists.
 */
export function RatingStars({ value, size = "md" }: Props) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} из 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            SIZE_CLASS[size],
            star <= filled
              ? "fill-amber-400 stroke-amber-400"
              : "fill-transparent stroke-text-sec/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

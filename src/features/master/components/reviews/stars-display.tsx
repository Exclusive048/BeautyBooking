import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const GAP_CLASS: Record<Size, string> = {
  sm: "gap-0.5",
  md: "gap-1",
  lg: "gap-1.5",
};

type Props = {
  rating: number;
  size?: Size;
  /** Optional accessible label override; defaults to numeric rating. */
  ariaLabel?: string;
};

/**
 * Five-star rating display. Shows fully filled, half-filled, and empty
 * stars based on the numeric rating (rounded to nearest 0.5 for the
 * half-fill threshold). Pure presentation — no interactivity.
 */
export function StarsDisplay({ rating, size = "md", ariaLabel }: Props) {
  const safeRating = Math.max(0, Math.min(5, rating));
  const fullStars = Math.floor(safeRating);
  const hasHalfStar = safeRating - fullStars >= 0.5;

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `Рейтинг ${safeRating.toFixed(1)} из 5`}
      className={cn("inline-flex items-center", GAP_CLASS[size])}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const isFull = index < fullStars;
        const isHalf = !isFull && index === fullStars && hasHalfStar;
        return (
          <span key={index} className="relative inline-flex">
            <Star
              className={cn(
                SIZE_CLASS[size],
                isFull ? "fill-amber-500 text-amber-500" : "text-text-sec/40"
              )}
              aria-hidden
            />
            {isHalf ? (
              <Star
                className={cn(
                  "absolute inset-0 fill-amber-500 text-amber-500",
                  SIZE_CLASS[size]
                )}
                style={{ clipPath: "inset(0 50% 0 0)" }}
                aria-hidden
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

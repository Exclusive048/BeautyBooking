import { cn } from "@/lib/cn";

type Props = {
  tag: string;
  /** Highlights the tag with the duplicate-warning tone — used in the
   * table when a row is part of a duplicate group. */
  isDuplicate?: boolean;
  className?: string;
};

/**
 * Square mono-typeface badge with the city's 3-letter code (MSK / SPB / etc).
 * Display-only — the `tag` is computed by `getCityTag(slug)`, never persisted.
 */
export function CityTagBadge({ tag, isDuplicate, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-semibold tracking-tight",
        isDuplicate
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-bg-input text-text-sec",
        className,
      )}
      aria-hidden
    >
      {tag}
    </span>
  );
}

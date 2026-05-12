import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReviewsFilterId } from "@/lib/master/reviews-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.reviews.filters;

const FILTERS: Array<{ id: ReviewsFilterId; label: string }> = [
  { id: "all", label: T.all },
  { id: "unanswered", label: T.unanswered },
  { id: "good", label: T.good },
  { id: "bad", label: T.bad },
];

type Props = {
  filterCounts: Record<ReviewsFilterId, number>;
  activeFilter: ReviewsFilterId;
};

/**
 * URL-driven filter chips. Each chip is a `<Link>` that swaps `?filter=`;
 * the server orchestrator re-runs `getMasterReviewsView` and hands back
 * the new feed. Active chip turns into the brand pill so it reads as a
 * decisive selection rather than just a button.
 */
export function ReviewsFilterChips({ filterCounts, activeFilter }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((filter) => {
        const active = filter.id === activeFilter;
        const count = filterCounts[filter.id] ?? 0;
        const href = filter.id === "all" ? "?" : `?filter=${filter.id}`;
        return (
          <Link
            key={filter.id}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              active
                ? "bg-primary text-white shadow-card"
                : "border border-border-subtle bg-bg-card text-text-main hover:border-primary/40 hover:text-primary"
            )}
          >
            <span>{filter.label}</span>
            {count > 0 ? (
              <span
                className={cn(
                  "font-mono text-[10px]",
                  active ? "opacity-80" : "text-text-sec"
                )}
              >
                · {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

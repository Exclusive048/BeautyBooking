import Link from "next/link";
import { cn } from "@/lib/cn";
import type {
  PortfolioCategoryOption,
  PortfolioFilterId,
} from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.filters;

type Props = {
  filterCounts: Record<PortfolioFilterId, number>;
  activeFilter: PortfolioFilterId;
  categories: PortfolioCategoryOption[];
  activeCategoryId: string | null;
};

const ROWS: Array<{ id: PortfolioFilterId; label: string }> = [
  { id: "all", label: T.all },
  { id: "public", label: T.public },
  { id: "hidden", label: T.hidden },
];

/**
 * Two rows of pills — visibility on top, category on the bottom.
 * Both URL-driven (`?filter=` and `?cat=`); links preserve the other's
 * value so switching one filter doesn't drop the other.
 */
export function PortfolioFilterChips({
  filterCounts,
  activeFilter,
  categories,
  activeCategoryId,
}: Props) {
  const buildHref = (next: { filter?: PortfolioFilterId; cat?: string | null }) => {
    const params = new URLSearchParams();
    const filter = next.filter ?? activeFilter;
    const categoryId = next.cat === undefined ? activeCategoryId : next.cat;
    if (filter !== "all") params.set("filter", filter);
    if (categoryId) params.set("cat", categoryId);
    const search = params.toString();
    return search ? `?${search}` : "?";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ROWS.map((row) => {
          const count = filterCounts[row.id] ?? 0;
          const isActive = row.id === activeFilter;
          return (
            <Link
              key={row.id}
              href={buildHref({ filter: row.id })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                  ? "bg-primary text-white shadow-card"
                  : "border border-border-subtle bg-bg-card text-text-main hover:border-primary/40 hover:text-primary"
              )}
            >
              <span>{row.label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    isActive ? "opacity-80" : "text-text-sec"
                  )}
                >
                  · {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.byCategoryLabel}
          </span>
          <CategoryChip
            href={buildHref({ cat: null })}
            active={activeCategoryId === null}
            label={T.allCategories}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              href={buildHref({ cat: category.id })}
              active={activeCategoryId === category.id}
              label={category.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CategoryChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border-subtle bg-bg-card text-text-sec hover:border-primary/30 hover:text-text-main"
      )}
    >
      {label}
    </Link>
  );
}

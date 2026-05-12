import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ServicesFilterId } from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.servicesPage.filters;

type Props = {
  filterCounts: Record<ServicesFilterId, number>;
  activeFilter: ServicesFilterId;
};

const ROWS: Array<{ id: ServicesFilterId; label: string }> = [
  { id: "all", label: T.all },
  { id: "services", label: T.services },
  { id: "bundles", label: T.bundles },
  { id: "disabled", label: T.disabled },
];

/** URL-driven `?filter=` chips. Same shape as portfolio (31b). */
export function ServicesFilterChips({ filterCounts, activeFilter }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ROWS.map((row) => {
        const count = filterCounts[row.id] ?? 0;
        const isActive = row.id === activeFilter;
        const href = row.id === "all" ? "?" : `?filter=${row.id}`;
        return (
          <Link
            key={row.id}
            href={href}
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
  );
}

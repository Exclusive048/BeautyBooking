import Link from "next/link";
import { cn } from "@/lib/cn";
import type { OfferFilterOption } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatOfferDateShort } from "./lib/format";

const T = UI_TEXT.cabinetMaster.modelOffers.pendingSection;

type Props = {
  options: OfferFilterOption[];
  activeOfferId: string | null;
};

/**
 * URL-driven filter chips for the pending applications section. Each chip
 * is a `<Link>` that swaps `?filterOffer=<id>`; the orchestrator re-runs
 * with the new value and trims the feed. Hidden when there is at most one
 * offer with pending applications — chips would be a one-button decoration.
 */
export function ApplicationOfferFilter({ options, activeOfferId }: Props) {
  if (options.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.filterLabel}
      </span>
      <Chip href="#applications" active={!activeOfferId}>
        {T.filterAll}
      </Chip>
      {options.map((option) => {
        const isActive = option.id === activeOfferId;
        const [date, time] = option.label.split(" · ");
        const label = `${date ? formatOfferDateShort(date) : ""}${time ? ` · ${time}` : ""}`;
        return (
          <Chip
            key={option.id}
            href={`?filterOffer=${option.id}#applications`}
            active={isActive}
          >
            {label.trim()}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-primary text-white shadow-card"
          : "border border-border-subtle bg-bg-card text-text-main hover:border-primary/40 hover:text-primary"
      )}
    >
      {children}
    </Link>
  );
}

import { CheckCircle2, ChevronRight, Clock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type {
  ActiveOfferItem,
  AvailableServiceForOffer,
} from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatOfferDateHeading, formatRubles, pluralize } from "./lib/format";
import { OfferActionsRow } from "./offer-actions-row";

const T = UI_TEXT.cabinetMaster.modelOffers.offerCard;
const STATUS_T = T.status;

type Props = {
  offer: ActiveOfferItem;
  /** When true, renders compact archive-card variant — smaller paddings,
   * no actions, status badge muted. Active variant keeps the brand-accent
   * border and surfaces the action row. */
  variant?: "active" | "archive";
  /** Master's services list — passed into the action row's edit modal.
   * Optional in archive variant since edit isn't available there. */
  services?: AvailableServiceForOffer[];
  now?: Date;
};

/**
 * One offer card. Renders date+time heading, price (with regular price
 * struck through when discounted), services, requirements, applications
 * stats, and disabled "Edit / Close" actions (29b). Anchor id allows
 * `#applications` scrolling from the pending section's "К офферу" links.
 */
export function OfferCard({ offer, variant = "active", services, now }: Props) {
  const isArchive = variant === "archive";
  const heading = formatOfferDateHeading(offer.dateLocal, now);
  const timeRange = `${offer.timeRangeStartLocal}–${offer.timeRangeEndLocal}`;
  const statsWord = pluralize(offer.counts.total, T.wordOne, T.wordFew, T.wordMany);
  const statsLabel =
    offer.counts.total > 0
      ? T.statsTemplate
          .replace("{total}", String(offer.counts.total))
          .replace("{word}", statsWord)
          .replace("{confirmed}", String(offer.counts.confirmed))
      : T.statsEmpty;

  return (
    <article
      id={isArchive ? undefined : `offer-${offer.id}`}
      className={cn(
        "rounded-2xl border bg-bg-card p-5",
        isArchive
          ? "border-border-subtle"
          : offer.discountPct !== null
            ? "border-primary/30 shadow-card"
            : "border-border-subtle"
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-text-main">{heading}</h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-text-sec">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span>{timeRange}</span>
            <span aria-hidden>·</span>
            <span>{T.durationTemplate.replace("{minutes}", String(offer.durationMin))}</span>
          </div>
        </div>
        <Badge variant={isArchive ? "muted" : offer.status === "ACTIVE" ? "success" : "warning"}>
          {offer.status === "ACTIVE"
            ? STATUS_T.active
            : offer.status === "CLOSED"
              ? STATUS_T.closed
              : STATUS_T.archived}
        </Badge>
      </header>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-2xl text-text-main">{formatRubles(offer.offerPrice)}</span>
        {offer.discountPct !== null && offer.regularPrice !== null ? (
          <>
            <span className="text-sm text-text-sec line-through">
              {T.regularPriceTemplate.replace("{price}", formatRubles(offer.regularPrice))}
            </span>
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
              {T.discountBadgeTemplate.replace("{percent}", String(offer.discountPct))}
            </span>
          </>
        ) : null}
        {offer.extraBusyMin > 0 ? (
          <span className="text-xs text-text-sec">
            {T.extraBusyTemplate.replace("{minutes}", String(offer.extraBusyMin))}
          </span>
        ) : null}
      </div>

      {offer.primaryService ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-input/70 px-3 py-1 text-sm text-text-main">
          <Sparkles className="h-3.5 w-3.5 text-text-sec" aria-hidden />
          <span>{offer.primaryService.title}</span>
        </div>
      ) : null}

      <div className="mt-4 space-y-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.requirementsHeading}
        </p>
        {offer.requirements.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {offer.requirements.map((requirement) => (
              <li
                key={requirement}
                className="rounded-full border border-border-subtle bg-bg-card px-2.5 py-0.5 text-xs text-text-main"
              >
                {requirement}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-sec">{T.requirementsEmpty}</p>
        )}
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle/70 pt-4">
        <div className="flex items-center gap-2 text-sm text-text-sec">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          <span>{statsLabel}</span>
          {offer.counts.approvedWaitingClient > 0 ? (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              ·{" "}
              {T.approvedWaitingClientTemplate.replace(
                "{count}",
                String(offer.counts.approvedWaitingClient)
              )}
            </span>
          ) : null}
        </div>
        {!isArchive && offer.counts.pending > 0 ? (
          <a
            href={`#applications`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <span>{offer.counts.pending}</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </footer>

      {!isArchive ? (
        <OfferActionsRow offer={offer} services={services ?? []} />
      ) : null}
    </article>
  );
}

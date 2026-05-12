import type { ActiveOfferItem } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { OfferCard } from "./offer-card";
import { pluralize } from "./lib/format";

const T = UI_TEXT.cabinetMaster.modelOffers.archiveSection;

type Props = {
  offers: ActiveOfferItem[];
  now?: Date;
};

/**
 * Closed/archived offers — grouped at the bottom of the page so the
 * historical record is visible without dominating the live offers above.
 * Hidden when empty (master sees nothing instead of a "0 архивных" tile).
 */
export function ArchiveSection({ offers, now }: Props) {
  if (offers.length === 0) return null;

  const word = pluralize(
    offers.length,
    T.countTemplateOne,
    T.countTemplateFew,
    T.countTemplateMany
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-text-main">{T.heading}</h2>
        <span className="text-sm text-text-sec">
          {word.replace("{count}", String(offers.length))}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {offers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} variant="archive" now={now} />
        ))}
      </div>
    </section>
  );
}

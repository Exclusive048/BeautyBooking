import type {
  ActiveOfferItem,
  AvailableServiceForOffer,
} from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { CreateOfferTrigger } from "./create-offer-trigger";
import { OfferCard } from "./offer-card";
import { OfferEmptyState } from "./offer-empty-state";

const T = UI_TEXT.cabinetMaster.modelOffers.activeSection;

type Props = {
  offers: ActiveOfferItem[];
  services: AvailableServiceForOffer[];
  now?: Date;
};

/**
 * The hero section of the page: active offers grid + "Создать оффер"
 * action (client island that owns the create-modal state). Renders the
 * empty state when nothing has been published.
 */
export function ActiveOffersSection({ offers, services, now }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-text-main">{T.heading}</h2>
        <CreateOfferTrigger services={services} />
      </div>
      {offers.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              variant="active"
              services={services}
              now={now}
            />
          ))}
        </div>
      ) : (
        <OfferEmptyState />
      )}
    </section>
  );
}

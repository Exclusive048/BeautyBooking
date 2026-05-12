import type {
  ApplicationItem,
  OfferFilterOption,
} from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ApplicationCard } from "./application-card";
import { ApplicationEmptyState } from "./application-empty-state";
import { ApplicationOfferFilter } from "./application-offer-filter";
import { pluralize } from "./lib/format";

const T = UI_TEXT.cabinetMaster.modelOffers.pendingSection;

type Props = {
  applications: ApplicationItem[];
  filterOptions: OfferFilterOption[];
  activeFilterOfferId: string | null;
  totalBeforeFilter: number;
};

/**
 * Pending applications section. Anchor `#applications` lets the offer
 * cards' "К заявкам" links scroll here. Filter chips are shown when there
 * is more than one offer with pending applications.
 */
export function PendingApplicationsSection({
  applications,
  filterOptions,
  activeFilterOfferId,
  totalBeforeFilter,
}: Props) {
  const word = pluralize(
    totalBeforeFilter,
    T.countTemplateOne,
    T.countTemplateFew,
    T.countTemplateMany
  );

  return (
    <section id="applications" className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-text-main">{T.heading}</h2>
        {totalBeforeFilter > 0 ? (
          <span className="text-sm text-text-sec">
            {word.replace("{count}", String(totalBeforeFilter))}
          </span>
        ) : null}
      </div>

      <ApplicationOfferFilter
        options={filterOptions}
        activeOfferId={activeFilterOfferId}
      />

      {applications.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {applications.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </div>
      ) : (
        <ApplicationEmptyState isFiltered={Boolean(activeFilterOfferId)} />
      )}
    </section>
  );
}

import Link from "next/link";
import { Inbox } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.empty;
const PT = UI_TEXT.cabinetMaster.modelOffers.pendingSection;

type Props = {
  /** True when the empty state is the result of an active `?filterOffer`
   * — surfaces a "Сбросить фильтр" link so the master can recover. */
  isFiltered: boolean;
};

export function ApplicationEmptyState({ isFiltered }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-input text-text-sec">
        <Inbox className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-lg text-text-main">{T.applicationsTitle}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-sec">
        {isFiltered ? T.applicationsBodyFiltered : T.applicationsBody}
      </p>
      {isFiltered ? (
        <Link
          href="?#applications"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          {PT.filterReset}
        </Link>
      ) : null}
    </div>
  );
}

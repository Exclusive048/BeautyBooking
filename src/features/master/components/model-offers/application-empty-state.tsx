import Link from "next/link";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.empty;
const PT = UI_TEXT.cabinetMaster.modelOffers.pendingSection;

type Props = {
  /** True when the empty state is the result of an active `?filterOffer`
   * — surfaces a "Сбросить фильтр" link so the master can recover. */
  isFiltered: boolean;
};

export function ApplicationEmptyState({ isFiltered }: Props) {
  return (
    <EmptyState
      variant="card"
      iconSize="lg"
      icon={Inbox}
      title={T.applicationsTitle}
      description={isFiltered ? T.applicationsBodyFiltered : T.applicationsBody}
    >
      {isFiltered ? (
        <Link
          href="?#applications"
          className="mt-3 inline-block text-sm font-medium text-accent-text hover:underline"
        >
          {PT.filterReset}
        </Link>
      ) : null}
    </EmptyState>
  );
}

import { StackedDetailAnchor } from "../../components/stacked-detail-anchor";
import { MastersFilters } from "./masters-filters";
import { MastersHeader } from "./masters-header";
import { MastersList } from "./masters-list";
import {
  MasterDetailEmpty,
  MasterDetailPanel,
} from "./master-detail-panel";
import type {
  StudioMasterDetail,
  StudioMasterFilter,
  StudioMastersListData,
} from "../server/types";

// UX-PASS-01: ниже xl карточка мастера стоит под списком — выбор строки
// прокручивает к ней (`StackedDetailAnchor`).
const STACKED_DETAIL_QUERY = "(max-width: 1279.98px)";

type Props = {
  studioId: string;
  filter: StudioMasterFilter;
  search: string;
  selectedMasterId: string | null;
  list: StudioMastersListData;
  detail: StudioMasterDetail | null;
};

export function StudioMastersPage({
  studioId,
  filter,
  search,
  selectedMasterId,
  list,
  detail,
}: Props) {
  return (
    <div className="space-y-3 lg:space-y-5">
      <MastersHeader studioId={studioId} />

      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[1fr_1.5fr]">
        <div className="space-y-3 lg:space-y-4">
          <MastersFilters
            filter={filter}
            search={search}
            counts={list.counts}
          />
          <MastersList
            items={list.items}
            selectedId={selectedMasterId}
            totalCount={list.counts.total}
          />
        </div>

        <StackedDetailAnchor
          selectionKey={detail?.id ?? null}
          stackedQuery={STACKED_DETAIL_QUERY}
        >
          {detail ? (
            <MasterDetailPanel studioId={studioId} detail={detail} />
          ) : (
            <MasterDetailEmpty />
          )}
        </StackedDetailAnchor>
      </div>
    </div>
  );
}

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
    <div className="space-y-5">
      <MastersHeader studioId={studioId} counts={list.counts} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.5fr]">
        <div className="space-y-4">
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

        <div>
          {detail ? (
            <MasterDetailPanel studioId={studioId} detail={detail} />
          ) : (
            <MasterDetailEmpty />
          )}
        </div>
      </div>
    </div>
  );
}

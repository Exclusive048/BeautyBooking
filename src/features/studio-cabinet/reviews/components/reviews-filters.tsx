"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  StudioReviewFilter,
  StudioReviewMasterChip,
  StudioReviewsFilterCounts,
} from "../lib/types";
import { Tabs } from "@/components/ui/tabs";

const T = UI_TEXT.studioCabinet.reviewsV2.filters;

type Props = {
  filter: StudioReviewFilter;
  masterId: string;
  masters: StudioReviewMasterChip[];
  counts: StudioReviewsFilterCounts;
};

const CHIPS: Array<{ key: StudioReviewFilter; labelKey: keyof typeof T }> = [
  { key: "all", labelKey: "all" },
  { key: "no_reply", labelKey: "noReply" },
  { key: "low_rating", labelKey: "lowRating" },
  { key: "five_star", labelKey: "fiveStar" },
];

export function ReviewsFilters({ filter, masterId, masters, counts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectFilter = (key: StudioReviewFilter) => {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "all") next.delete("filter");
    else next.set("filter", key);
    next.delete("cursor");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const handleMasterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams.toString());
    if (event.target.value === "all") next.delete("master");
    else next.set("master", event.target.value);
    next.delete("cursor");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        ariaLabel={T.aria}
        items={CHIPS.map((chip) => ({ id: chip.key, label: T[chip.labelKey], badge: counts[chip.key] }))}
        value={filter}
        onChange={(id) => selectFilter(id as StudioReviewFilter)}
      />
      <div className="ml-auto">
        <Select
          value={masterId}
          onChange={handleMasterChange}
          className="min-w-[160px]"
          aria-label={T.masterAll}
        >
          <option value="all">{T.masterAll}</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

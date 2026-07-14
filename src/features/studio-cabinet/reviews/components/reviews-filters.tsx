"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  StudioReviewFilter,
  StudioReviewMasterChip,
  StudioReviewsFilterCounts,
} from "../lib/types";

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
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const active = filter === chip.key;
          const count = counts[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => selectFilter(chip.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-accent-text"
                  : "border-border-subtle bg-bg-card text-text-sec hover:text-text-main",
              )}
            >
              <span>{T[chip.labelKey]}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                  active ? "bg-primary/20 text-accent-text" : "bg-bg-input text-text-sec",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
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

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import {
  STATUS_BADGE_CLASS,
  getStatusTone,
} from "../lib/status-display";
import type { StudioMasterListItem } from "../server/types";

const T = UI_TEXT.studioCabinet.mastersV2;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function statusLabel(status: StudioMasterListItem["status"]): string {
  if (status === "ACTIVE") return T.status.active;
  if (status === "INVITED") return T.status.invited;
  return T.status.disabled;
}

export function MasterListItem({
  master,
  isSelected,
}: {
  master: StudioMasterListItem;
  isSelected: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = () => {
    const next = new URLSearchParams(searchParams.toString());
    // STUDIO-POLISH-A #4: prefer the public username so the URL exposes a
    // human-readable handle (e.g. `?master=anna-sokolova`) instead of the
    // raw cuid. Falls back to id when the master has no publicUsername.
    next.set("master", master.urlHandle);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const tone = getStatusTone(master.status);

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border bg-bg-card p-3 text-left transition-all",
        isSelected
          ? "border-primary/40 ring-2 ring-primary/20"
          : "border-border-subtle hover:border-border-subtle/80 hover:bg-bg-input/30",
      )}
      aria-pressed={isSelected}
    >
      {master.avatarUrl ? (
        <ResilientImage
          src={master.avatarUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-input text-xs font-semibold text-text-sec ring-1 ring-border-subtle"
        >
          {initialsOf(master.displayName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text-main">
            {master.displayName}
          </span>
          {master.isCurrentUser ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-primary">
              {T.listItem.youChip}
            </span>
          ) : null}
        </div>
        {master.servicesSummary ? (
          <p className="mt-0.5 truncate text-xs text-text-sec">
            {master.servicesSummary}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-sec">
          <span>
            {T.listItem.bookingsTemplate.replace(
              "{count}",
              String(master.metrics.bookings30d),
            )}
          </span>
          <span aria-hidden>·</span>
          <span>
            {T.listItem.occupancyTemplate.replace(
              "{percent}",
              String(master.metrics.occupancy30dPercent),
            )}
          </span>
          {master.metrics.reviewsCount > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>
                ★ {master.metrics.rating.toFixed(1)}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-display text-sm font-semibold tabular-nums text-text-main">
          {UI_FMT.priceLabel(master.metrics.revenue30dKopeks)}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            STATUS_BADGE_CLASS[tone],
          )}
        >
          {statusLabel(master.status)}
        </span>
      </div>
    </button>
  );
}

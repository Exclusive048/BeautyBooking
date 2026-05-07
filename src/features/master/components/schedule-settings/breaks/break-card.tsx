"use client";

import { Minus, X } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { formatDaysOfWeek, type RecurringBreakGroup } from "../lib/format-helpers";

const T = UI_TEXT.cabinetMaster.scheduleSettings.breaks.recurring;

type Props = {
  group: RecurringBreakGroup;
  onDelete: () => void;
};

/**
 * Compact row for one recurring-break group. Uses the existing day badge
 * (e.g. "Пн-Пт"), break title, and time range. Delete uses native confirm
 * to keep the list dense.
 */
export function BreakCard({ group, onDelete }: Props) {
  const title = group.title?.trim() || T.fallbackTitle;
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <Minus className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
      <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-bg-input px-2.5 py-0.5 text-[11px] font-medium text-text-main">
        {formatDaysOfWeek(group.daysOfWeek)}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-main">{title}</p>
      <span className="shrink-0 font-mono text-xs tabular-nums text-text-sec">
        {group.startLocal}–{group.endLocal}
      </span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(T.deleteConfirm)) onDelete();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-rose-600"
        aria-label={T.deleteAria}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

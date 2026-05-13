"use client";

import { cn } from "@/lib/cn";

type Props = {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
};

/** Single tile in the 5-tile role-filter strip. Renders as a button so
 * keyboard users get it for free; the active state pulls in a subtle
 * primary ring + bg-input background to match the catalog tabs. */
export function UsersRoleTile({ label, count, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-2xl border bg-bg-card px-4 py-3 text-left transition-colors",
        active
          ? "border-primary/40 bg-bg-input/80 shadow-card"
          : "border-border-subtle hover:border-primary/20 hover:bg-bg-input/40",
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
        {label}
      </span>
      <span className="font-display text-xl tabular-nums text-text-main">
        {count}
      </span>
    </button>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedTabOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Optional `data-testid` for QA locators. */
  testId?: string;
};

type SegmentedTabsProps<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedTabOption<T>[];
  ariaLabel?: string;
  className?: string;
};

/**
 * Shared segmented control — a pill track with a spring-loaded thumb that
 * slides to the active option (LOGIN-REDESIGN-01).
 *
 * The track is a gap-less grid so column boundaries are contiguous; the thumb
 * is one column wide and translates by `index × 100%` of its own width, which
 * lands it exactly over the active button. Works for any option count (the
 * login uses 2 — phone / email). Rendered as `role="tablist"` with plain
 * `<button role="tab">` children, so it never introduces a checkbox/radio that
 * could collide with other `getByRole` locators on the page.
 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedTabsProps<T>) {
  const count = options.length;
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("relative grid rounded-2xl bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-xl bg-bg-card shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.44,1)]"
        style={{
          width: `calc((100% - 0.5rem) / ${count})`,
          transform: `translateX(calc(${activeIndex} * 100%))`,
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-[1] inline-flex h-9 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200",
              active ? "text-text-main" : "text-text-sec hover:text-text-main",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { cn } from "@/lib/cn";

type Option<T> = {
  value: T;
  label: string;
};

type Props<T> = {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
  size?: "sm" | "md";
  disabled?: boolean;
};

/**
 * Pill-style segmented control. Used for finite enum-like settings
 * across the Rules and Visibility tabs (booking-window choices, slot
 * precision, cancellation hours, etc.). Supports any value type — keys
 * the buttons by `String(value)`, so values must serialise unambiguously.
 */
export function ChipGroup<T>({ value, onChange, options, size = "md", disabled = false }: Props<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => {
              if (disabled || active) return;
              onChange(option.value);
            }}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center justify-center rounded-full font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
              active
                ? "bg-primary text-white shadow-card"
                : "border border-border-subtle bg-bg-card text-text-main hover:border-primary/40 hover:text-primary",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

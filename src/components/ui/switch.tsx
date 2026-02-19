"use client";

import { cn } from "@/lib/cn";

type SwitchSize = "sm" | "md";

type Props = {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: SwitchSize;
  className?: string;
};

const SIZE_STYLES: Record<SwitchSize, { track: string; thumb: string; on: string; off: string }> = {
  sm: { track: "h-5 w-9", thumb: "h-4 w-4", on: "translate-x-4", off: "translate-x-1" },
  md: { track: "h-6 w-11", thumb: "h-5 w-5", on: "translate-x-5", off: "translate-x-1" },
};

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  size = "md",
  className,
}: Props) {
  const styles = SIZE_STYLES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onCheckedChange?.(!checked);
      }}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
        styles.track,
        checked ? "bg-primary" : "bg-border-subtle",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block rounded-full bg-white shadow transition-transform",
          styles.thumb,
          checked ? styles.on : styles.off
        )}
      />
    </button>
  );
}

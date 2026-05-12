"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

/**
 * Single-line capsule chip used by date / time / preset selectors. The active
 * style is a flat brand-primary fill — distinct from the legacy `<Chip>`
 * gradient variant which is reserved for "marketing" emphasis surfaces.
 *
 * `forwardRef` so this can serve as a popover-trigger when nested inside a
 * positioned wrapper.
 */
export const ChipButton = forwardRef<HTMLButtonElement, Props>(
  ({ active = false, className, children, type = "button", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={active}
        className={cn(
          "inline-flex h-8 items-center rounded-full px-3.5 text-xs font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          active
            ? "bg-primary text-white shadow-sm"
            : "border border-border-subtle bg-bg-page text-text-main hover:bg-bg-input/70",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
ChipButton.displayName = "ChipButton";

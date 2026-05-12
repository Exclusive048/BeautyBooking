"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: string;
  control: ReactNode;
  className?: string;
};

/**
 * Generic two-column row used across the Rules and Visibility tabs:
 * title + optional helper text on the left, the active control (chip group,
 * switch, etc.) on the right. Wraps onto two lines on narrow viewports.
 */
export function SettingRow({ title, subtitle, control, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-main">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-text-sec">{subtitle}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  id: string;
  label: string;
  badge?: string | number;
  /** When true the button is rendered but ignores clicks. Visualised as muted + cursor-not-allowed. */
  disabled?: boolean;
  /** Optional native title attribute — shown as tooltip on hover, useful for "Скоро" hints on disabled tabs. */
  title?: string;
};

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-2xl border border-border-subtle bg-bg-input p-1.5 shadow-card",
        className
      )}
    >
      {items.map((t) => {
        const active = value === t.id;
        const disabled = t.disabled === true;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (disabled) return;
              onChange(t.id);
            }}
            aria-disabled={disabled}
            title={t.title}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition-all duration-300",
              disabled
                ? "cursor-not-allowed text-text-sec/40"
                : active
                ? "bg-bg-card text-text-main shadow-[0_8px_18px_rgb(20_20_20/0.12)]"
                : "text-text-sec hover:bg-bg-card/80 hover:text-text-main"
            )}
          >
            <span>{t.label}</span>
            {t.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-xl px-2 py-0.5 text-xs",
                  active
                    ? "bg-primary/15 text-text-main"
                    : "bg-bg-page text-text-sec"
                )}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

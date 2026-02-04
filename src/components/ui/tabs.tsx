"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  id: string;
  label: string;
  badge?: string | number;
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
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition-all duration-300",
              active
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

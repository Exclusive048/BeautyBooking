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
        "inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-soft",
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
              "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-text text-bg"
                : "text-text-muted hover:bg-muted"
            )}
          >
            <span>{t.label}</span>
            {t.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-xl px-2 py-0.5 text-xs",
                  active
                    ? "bg-bg/15 text-bg"
                    : "bg-muted text-text-muted"
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
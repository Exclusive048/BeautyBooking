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
        "inline-flex flex-wrap gap-1 rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm",
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
                ? "bg-neutral-900 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            )}
          >
            <span>{t.label}</span>
            {t.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-xl px-2 py-0.5 text-xs",
                  active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"
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

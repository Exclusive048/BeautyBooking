"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  active: boolean;
  title: string;
  description: string;
  icon?: LucideIcon;
  onClick: () => void;
};

/**
 * Two-up choice card used by the Rules tab's "Подтверждение записи"
 * pair (Auto vs Manual). Shares the same active/inactive treatment as
 * the Hours-tab mode toggle so brand grammar stays consistent.
 */
export function ModeCard({ active, title, description, icon: Icon, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border-subtle bg-bg-card hover:border-primary/40"
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full",
              active ? "bg-primary text-white" : "bg-bg-input text-text-sec"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
        <span className="font-medium text-text-main">{title}</span>
      </div>
      <p className="text-xs text-text-sec">{description}</p>
    </button>
  );
}

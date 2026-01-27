"use client";

import { cn } from "@/lib/cn";
import type { SlotGroup } from "../model/types";
import { useEffect, useMemo, useState } from "react";

export function SlotPicker({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: SlotGroup[];
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const defaultOpen = useMemo(() => {
    const hasDefault = groups.some((g) => g.defaultOpen);
    const firstId = groups[0]?.id ?? "";
    return groups.reduce<Record<string, boolean>>((acc, g) => {
      acc[g.id] = g.defaultOpen ?? false;
      return acc;
    }, hasDefault || !firstId ? {} : { [firstId]: true });
  }, [groups]);

  const [openById, setOpenById] = useState<Record<string, boolean>>(defaultOpen);

  useEffect(() => {
    setOpenById(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className={cn("space-y-4", disabled && "opacity-50 pointer-events-none")}>
      {groups.map((g) => (
        <div key={g.id} className="space-y-2">
          <button
            type="button"
            onClick={() => setOpenById((prev) => ({ ...prev, [g.id]: !prev[g.id] }))}
            className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left"
            aria-expanded={openById[g.id] ?? false}
          >
            <span className="text-xs font-semibold text-neutral-600">{g.label}</span>
            <span className="text-xs text-neutral-400">{g.items.length}</span>
          </button>
          {openById[g.id] ? (
            <div className="flex flex-wrap gap-2">
              {g.items.map((label) => {
                const time = label.split(" ")[1] ?? label;
                const active = value === label;
                return (
                  <button
                    key={label}
                    onClick={() => onChange?.(label)}
                    className={cn(
                      "rounded-2xl border px-3 py-2 text-sm transition",
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
                    )}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

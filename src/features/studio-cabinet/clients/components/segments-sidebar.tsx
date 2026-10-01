"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Crown, Moon, Sparkles, Star, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioClientSegmentKey, StudioClientsSegmentCounts } from "../lib/types";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.studioCabinet.clientsV2.segments;

type Props = {
  selected: StudioClientSegmentKey;
  counts: StudioClientsSegmentCounts;
};

const ENTRIES: Array<{
  key: StudioClientSegmentKey;
  labelKey: keyof typeof T;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  { key: "all", labelKey: "all", icon: Users },
  { key: "vip", labelKey: "vip", icon: Crown },
  { key: "regular", labelKey: "regular", icon: Star },
  { key: "new", labelKey: "new", icon: Sparkles },
  { key: "sleeping", labelKey: "sleeping", icon: Moon },
];

export function SegmentsSidebar({ selected, counts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const select = (key: StudioClientSegmentKey) => {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "all") next.delete("segment");
    else next.set("segment", key);
    next.delete("cursor");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="space-y-2 rounded-2xl border border-border-subtle bg-bg-card p-4 lg:sticky lg:top-[calc(var(--topbar-h)+1rem)]">
      <h2 className="px-1 eyebrow">
        {T.title}
      </h2>
      <ul className="space-y-1">
        {ENTRIES.map((entry) => {
          const Icon = entry.icon;
          const active = selected === entry.key;
          return (
            <li key={entry.key}>
              <Button variant="wrapper"
                onClick={() => select(entry.key)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                  active
                    ? "bg-primary/10 text-accent-text"
                    : "text-text-main hover:bg-bg-input/60",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate text-sm font-medium">{T[entry.labelKey]}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs tabular-nums",
                    active ? "bg-primary/20 text-accent-text" : "bg-bg-input text-text-sec",
                  )}
                >
                  {counts[entry.key]}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

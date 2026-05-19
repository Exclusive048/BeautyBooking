"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  NotificationSort,
  StudioNotificationChip,
  StudioNotificationsChipCounts,
} from "../lib/types";

const T = UI_TEXT.studioCabinet.notificationsV2.filters;

type Props = {
  activeChip: StudioNotificationChip;
  sort: NotificationSort;
  counts: StudioNotificationsChipCounts;
};

const CHIPS: Array<{ key: StudioNotificationChip; labelKey: keyof typeof T }> = [
  { key: "all", labelKey: "all" },
  { key: "unread", labelKey: "unread" },
  { key: "bookings", labelKey: "bookings" },
  { key: "cancellations", labelKey: "cancellations" },
  { key: "reschedules", labelKey: "reschedules" },
  { key: "reviews", labelKey: "reviews" },
  { key: "messages", labelKey: "messages" },
  { key: "team", labelKey: "team" },
  { key: "finance", labelKey: "finance" },
  { key: "system", labelKey: "system" },
];

export function NotificationsFilters({ activeChip, sort, counts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const selectChip = (key: StudioNotificationChip) => {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "all") next.delete("chip");
    else next.set("chip", key);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams.toString());
    if (event.target.value === "newest") next.delete("sort");
    else next.set("sort", event.target.value);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const handleMarkAllRead = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Reuse existing bulk endpoint — `context=all` covers every channel
      // the studio admin sees (STUDIO + any spillover like SYSTEM).
      await fetch("/api/notifications/read-all?context=all", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const active = activeChip === chip.key;
          const count = counts[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => selectChip(chip.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-subtle bg-bg-card text-text-sec hover:text-text-main",
              )}
            >
              <span>{T[chip.labelKey]}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                  active ? "bg-primary/20 text-primary" : "bg-bg-input text-text-sec",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Select
          value={sort}
          onChange={handleSortChange}
          className="min-w-[140px]"
          aria-label={T.sortNewest}
        >
          <option value="newest">{T.sortNewest}</option>
          <option value="oldest">{T.sortOldest}</option>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={busy || counts.unread === 0}
        >
          {T.markAllRead}
        </Button>
      </div>
    </div>
  );
}

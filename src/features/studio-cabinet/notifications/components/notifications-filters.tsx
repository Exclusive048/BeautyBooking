"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Select } from "@/components/ui/select";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  NotificationSort,
  StudioNotificationChip,
  StudioNotificationsChipCounts,
} from "../lib/types";
import { Tabs } from "@/components/ui/tabs";

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
  const toast = useToast();
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
      // MOBILE-STUDIO-C (ops): только канал студии — эта страница его и
      // показывает. Прежний `/api/notifications/read-all?context=all` гасил
      // заодно личные уведомления и уведомления мастера, которых здесь не видно.
      await fetchJsonWithAuth<unknown>("/api/cabinet/studio/notifications/read-all", { method: "POST" });
      startTransition(() => router.refresh());
    } catch (error) {
      // 29.09 · 11: раньше отказ не проверялся вовсе — тихий отказ.
      toast.error(serverMessageOr(error, T.markAllReadFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        ariaLabel={T.aria}
        items={CHIPS.map((chip) => ({ id: chip.key, label: T[chip.labelKey], badge: counts[chip.key] }))}
        value={activeChip}
        onChange={(id) => selectChip(id as StudioNotificationChip)}
      />
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

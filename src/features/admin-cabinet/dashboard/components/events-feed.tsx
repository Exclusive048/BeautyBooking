"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EventsFeedItem } from "@/features/admin-cabinet/dashboard/components/events-feed-item";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminEventItem,
  AdminEventsResponse,
} from "@/features/admin-cabinet/dashboard/types";

const POLL_MS = 5_000;
const MAX_ITEMS = 30;

type Props = {
  initial: AdminEventItem[];
};

const T = UI_TEXT.adminPanel.dashboard.feed;

/** Live event feed. Initial set comes from the server (SSR), then a
 * 5-second polling loop pulls anything newer than the latest `timeMs`
 * we've already shown. New items animate in at the top, the list is
 * capped at `MAX_ITEMS` so the DOM doesn't grow unbounded during a
 * long session. Polling pauses when the tab is hidden — there's no
 * point burning rate-limit budget for a tab no admin is looking at. */
export function EventsFeed({ initial }: Props) {
  const [items, setItems] = useState<AdminEventItem[]>(initial);
  const seenIds = useRef<Set<string>>(new Set(initial.map((e) => e.id)));
  const isVisible = useRef(true);

  const latestMs = items.length > 0 ? items[0]!.timeMs : 0;

  const poll = useCallback(async (since: number) => {
    try {
      const url = since
        ? `/api/admin/dashboard/events?since=${since}`
        : "/api/admin/dashboard/events";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok: boolean;
        data?: AdminEventsResponse;
      };
      if (!json.ok || !json.data) return;

      const fresh = json.data.items.filter((it) => !seenIds.current.has(it.id));
      if (fresh.length === 0) return;
      for (const it of fresh) seenIds.current.add(it.id);

      setItems((prev) => {
        const merged = [...fresh, ...prev]
          .sort((a, b) => b.timeMs - a.timeMs)
          .slice(0, MAX_ITEMS);
        // Trim seenIds to match — never let it grow unbounded either.
        if (seenIds.current.size > MAX_ITEMS * 2) {
          seenIds.current = new Set(merged.map((e) => e.id));
        }
        return merged;
      });
    } catch {
      // Silent — next poll will retry. Avoids surfacing transient
      // network blips as user-visible errors in a live dashboard.
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      isVisible.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isVisible.current) return;
      void poll(latestMs);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [latestMs, poll]);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-text-main">
          {T.title}
        </h3>
        <LiveBadge />
      </header>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-sec">{T.empty}</p>
      ) : (
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {items.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <EventsFeedItem event={event} />
              </motion.div>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
      <span
        aria-hidden
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
      />
      {T.liveBadge}
    </span>
  );
}

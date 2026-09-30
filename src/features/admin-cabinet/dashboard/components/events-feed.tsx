"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { EventsFeedItem } from "@/features/admin-cabinet/dashboard/components/events-feed-item";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminEventItem,
  AdminEventsResponse,
} from "@/features/admin-cabinet/dashboard/types";

// PERF-27 (AUDIT-CAMPAIGN-02 п.4, ратифицировано владельцем): 5с → 30с — как у
// соседнего system-health.tsx. 720 запросов/час на вкладку → 120; SSE-канал ради
// одной админской ленты не строится (ратифицировано там же). Подпись бейджа
// берёт интервал ОТСЮДА (POLL_MS/1000) — цифра в UI не может разойтись с кодом.
const POLL_MS = 30_000;
const MAX_ITEMS = 30;

type Props = {
  initial: AdminEventItem[];
};

const T = UI_TEXT.adminPanel.dashboard.feed;

/** Event feed. Initial set comes from the server (SSR), then a polling
 * loop (POLL_MS) pulls anything newer than the latest `timeMs` we've
 * already shown. New items animate in at the top, the list is capped at
 * `MAX_ITEMS` so the DOM doesn't grow unbounded during a long session.
 * Polling pauses when the tab is hidden — there's no point burning
 * rate-limit budget for a tab no admin is looking at. */
export function EventsFeed({ initial }: Props) {
  const [items, setItems] = useState<AdminEventItem[]>(initial);
  const seenIds = useRef<Set<string>>(new Set(initial.map((e) => e.id)));
  const isVisible = useRef(true);
  // PERF-27: тик, пришедший поверх незавершённого запроса, ПРОПУСКАЕТСЯ.
  // Раньше `setInterval` стрелял безусловно, и медленный ответ (админский
  // запрос по событиям — не самый дешёвый) складывал запросы стопкой: чем
  // тяжелее серверу, тем больше их в полёте одновременно. `useSerialTask`
  // здесь не подходит намеренно — он ОТКЛАДЫВАЕТ вытесненный вход и
  // выполняет его следом, а у опроса значение — «сейчас», и отложенный тик
  // сразу после предыдущего это тот же лишний запрос.
  const inFlight = useRef(false);

  const latestMs = items.length > 0 ? items[0]!.timeMs : 0;

  const poll = useCallback(async (since: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
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
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      isVisible.current = document.visibilityState === "visible";
    };
    // PERF-27: начальное значение читается с документа, а не принимается за
    // «видно». Вкладка, открытая в фоне (Ctrl+click по ссылке на дашборд),
    // до первого переключения фокуса опрашивала API как активная — то есть
    // ровно в том случае, ради которого пауза и сделана.
    onVisibility();
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
              <m.div
                key={event.id}
                initial={{ opacity: 0, y: -DISTANCE.nudge }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={MOTION.base}
              >
                <EventsFeedItem event={event} />
              </m.div>
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
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-success"
      />
      {T.liveBadge(POLL_MS / 1000)}
    </span>
  );
}

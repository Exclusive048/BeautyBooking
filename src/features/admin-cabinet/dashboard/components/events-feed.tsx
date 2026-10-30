"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import {
  AMOUNT_CLASS,
  EventDot,
  EventPerson,
  EventTime,
  LiveBadge,
} from "@/features/admin-cabinet/dashboard/components/event-parts";
import { ADMIN_DASHBOARD_EVENTS } from "@/features/admin-cabinet/dashboard/lib/event-categories";
import { useAdminEventsPoll } from "@/features/admin-cabinet/dashboard/lib/use-admin-events-poll";
import type { AdminEventItem, AdminEventsResponse } from "@/features/admin-cabinet/dashboard/types";
import { cn } from "@/lib/cn";

const T = UI_TEXT.adminPanel.dashboard.feed;

type Props = {
  initial: AdminEventItem[];
  /** `asOfMs` серверного рендера — точка отсчёта опроса новых. */
  initialAsOfMs: number;
};

/**
 * ADMIN-EVENTS-02 — последние события на дашборде: что произошло, кто и с
 * кем, время и сумма. Свежие события приходят опросом раз в 30 с; вся история
 * с разделами, подробностями и выгрузкой — `/admin/events`.
 */
export function EventsFeed({ initial, initialAsOfMs }: Props) {
  const [items, setItems] = useState<AdminEventItem[]>(initial);
  const seenIds = useRef<Set<string>>(new Set(initial.map((item) => item.id)));

  const onFresh = useCallback((incoming: AdminEventItem[]) => {
    const fresh = incoming.filter((item) => !seenIds.current.has(item.id));
    if (fresh.length === 0) return;
    for (const item of fresh) seenIds.current.add(item.id);
    setItems((prev) => [...fresh, ...prev].slice(0, ADMIN_DASHBOARD_EVENTS));
  }, []);

  const onReset = useCallback((page: AdminEventsResponse) => {
    seenIds.current = new Set(page.items.map((item) => item.id));
    setItems(page.items.slice(0, ADMIN_DASHBOARD_EVENTS));
  }, []);

  useAdminEventsPoll({
    category: "all",
    initialAsOfMs,
    pageSize: ADMIN_DASHBOARD_EVENTS,
    onEvents: onFresh,
    onReset,
  });

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-text-main">{T.title}</h3>
        <LiveBadge />
      </header>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-sec">{T.empty}</p>
      ) : (
        <ol className="flex-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 border-b border-border-subtle py-2.5 last:border-b-0"
            >
              <span className="pt-2">
                <EventDot tone={item.dotTone} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-text-main">{item.action}</p>
                {item.actor || item.subject ? (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                    {item.actor ? <EventPerson person={item.actor} compact /> : null}
                    {item.actor && item.subject ? (
                      <ArrowRight className="h-3 w-3 shrink-0 text-text-sec" aria-hidden />
                    ) : null}
                    {item.subject ? <EventPerson person={item.subject} compact /> : null}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <EventTime timeIso={item.timeIso} timeMs={item.timeMs} className="block" />
                {item.amountText ? (
                  <span className={cn("text-xs font-semibold tabular-nums", AMOUNT_CLASS[item.amountTone])}>
                    {item.amountText}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex justify-center">
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/events">{T.viewAll}</Link>
        </Button>
      </div>
    </section>
  );
}

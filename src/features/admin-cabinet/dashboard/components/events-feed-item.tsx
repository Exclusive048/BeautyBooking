"use client";

import { cn } from "@/lib/cn";
import type {
  AdminEventDotTone,
  AdminEventItem,
} from "@/features/admin-cabinet/dashboard/types";
import { UI_FMT, VIEWER_TZ } from "@/lib/ui/fmt";
import { useIsHydrated } from "@/hooks/use-is-hydrated";

const DOT_CLASS: Record<AdminEventDotTone, string> = {
  ok: "bg-success",
  new: "bg-primary",
  sub: "bg-warning",
  cancel: "bg-destructive",
  alert: "bg-destructive",
};

const AMOUNT_CLASS = {
  neutral: "text-text-main",
  positive: "text-success-text",
  negative: "text-danger-text",
} as const;

type Props = {
  event: AdminEventItem;
};

export function EventsFeedItem({ event }: Props) {
  const date = new Date(event.timeMs);
  // Часы зрителя — только после гидратации: сервер считает их в поясе
  // контейнера, и первый клиентский рендер обязан совпасть с серверным
  // (иначе «Hydration failed», 29.09 доработки · 24).
  const hydrated = useIsHydrated();
  return (
    <li className="grid grid-cols-[44px_8px_1fr_auto] items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
      <time
        dateTime={event.timeIso}
        className="font-mono text-[11px] tabular-nums text-text-sec"
      >
        {hydrated ? UI_FMT.timeShort(date, { timeZone: VIEWER_TZ }) : null}
      </time>
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          DOT_CLASS[event.dotTone],
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-main">
          {event.primary}
        </p>
        <p className="truncate text-xs text-text-sec">{event.secondary}</p>
      </div>
      {event.amountText ? (
        <span
          className={cn(
            "shrink-0 text-right text-sm font-semibold tabular-nums",
            AMOUNT_CLASS[event.amountTone],
          )}
        >
          {event.amountText}
        </span>
      ) : null}
    </li>
  );
}

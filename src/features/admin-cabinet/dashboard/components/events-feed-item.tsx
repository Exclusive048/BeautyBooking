import { cn } from "@/lib/cn";
import type {
  AdminEventDotTone,
  AdminEventItem,
} from "@/features/admin-cabinet/dashboard/types";

const TIME_FMT = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

const DOT_CLASS: Record<AdminEventDotTone, string> = {
  ok: "bg-emerald-500",
  new: "bg-primary",
  sub: "bg-amber-500",
  cancel: "bg-red-500",
  alert: "bg-red-500",
};

const AMOUNT_CLASS = {
  neutral: "text-text-main",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
} as const;

type Props = {
  event: AdminEventItem;
};

export function EventsFeedItem({ event }: Props) {
  const date = new Date(event.timeMs);
  return (
    <li className="grid grid-cols-[44px_8px_1fr_auto] items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
      <time
        dateTime={event.timeIso}
        className="font-mono text-[11px] tabular-nums text-text-sec"
      >
        {TIME_FMT.format(date)}
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

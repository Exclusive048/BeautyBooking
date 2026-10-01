"use client";

import { cn } from "@/lib/cn";
import type {
  AdminEventDotTone,
  AdminEventItem,
} from "@/features/admin-cabinet/dashboard/types";
import { adminEventColumns } from "@/features/admin-cabinet/dashboard/lib/event-columns";
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

/** ADMIN-EVENTS-TABLE — строка таблицы «История событий». */
export function EventsFeedItem({ event }: Props) {
  // Часы зрителя — только после гидратации: сервер считает их в поясе
  // контейнера, и первый клиентский рендер обязан совпасть с серверным
  // (иначе «Hydration failed», 29.09 доработки · 24).
  const hydrated = useIsHydrated();
  const columns = adminEventColumns(event);
  return (
    <tr className="border-b border-border-subtle last:border-b-0 hover:bg-bg-input/40">
      <td className="whitespace-nowrap py-1.5 pr-3 align-top">
        <time dateTime={event.timeIso} className="font-mono text-2xs tabular-nums text-text-sec">
          {hydrated ? UI_FMT.date(event.timeMs, "dayMonthNumericTime", { timeZone: VIEWER_TZ }) : null}
        </time>
      </td>
      <td className="whitespace-nowrap py-1.5 pr-3 align-top text-xs text-text-main">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[event.dotTone])} />
          {columns.typeLabel}
        </span>
      </td>
      <td className="max-w-[16rem] truncate py-1.5 pr-3 align-top text-xs font-medium text-text-main" title={columns.description}>
        {columns.description}
      </td>
      <td className="max-w-[12rem] truncate py-1.5 pr-3 align-top text-xs text-text-sec" title={columns.detail}>
        {columns.detail}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-1.5 text-right align-top text-xs font-semibold tabular-nums",
          AMOUNT_CLASS[event.amountTone],
        )}
      >
        {event.amountText ?? ""}
      </td>
    </tr>
  );
}

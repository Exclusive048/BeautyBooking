"use client";

import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ClientListItemView } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatNumberShort,
  formatRelativeDate,
  getInitials,
  pickAvatarColor,
  pluralize,
} from "./lib/format";

const T = UI_TEXT.cabinetMaster.clients.list;

type Props = {
  client: ClientListItemView;
  selected: boolean;
  onSelect: (clientKey: string) => void;
  /** Reference time used by the relative-date formatter. */
  now: Date;
};

/**
 * Single row in the left list pane. Click selects the client via the
 * parent's state holder — selection is no longer in the URL (27a-FIX-URL)
 * so the row is a `<button>` rather than a `<Link href="?id=…">`. The
 * selected style and a11y `aria-pressed` are driven by the parent prop.
 */
export function ClientListItem({ client, selected, onSelect, now }: Props) {
  const isVip = client.statuses.includes("vip");
  const visitWord = pluralize(
    client.visitsCount,
    T.visitWordOne,
    T.visitWordFew,
    T.visitWordMany
  );
  const subtitle =
    client.visitsCount > 0
      ? T.visitsTemplate
          .replace("{n}", String(client.visitsCount))
          .replace("{word}", visitWord)
          .replace("{when}", formatRelativeDate(client.lastVisitAt, now))
      : T.noVisits;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(client.key)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary/30 bg-primary/5"
          : "border-transparent hover:border-border-subtle hover:bg-bg-card"
      )}
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium",
          pickAvatarColor(client.key)
        )}
        aria-hidden
      >
        {getInitials(client.displayName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-text-main">{client.displayName}</p>
          {isVip ? <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-hidden /> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-sec">{subtitle}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-medium tabular-nums text-text-main">
          {formatNumberShort(client.totalAmount)}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-sec">{T.rowRevenueLabel}</p>
      </div>
    </button>
  );
}

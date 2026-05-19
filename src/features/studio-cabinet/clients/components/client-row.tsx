import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioClientRow } from "../lib/types";
import { formatDaysAgo, initialsOf } from "../lib/format";
import { ClientSegmentBadge } from "./client-segment-badge";

const T = UI_TEXT.studioCabinet.clientsV2;

export function ClientTableRow({ row }: { row: StudioClientRow }) {
  return (
    <tr className="border-t border-border-subtle hover:bg-bg-input/30">
      <td className="px-3 py-3 align-top">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-input text-xs font-semibold text-text-sec ring-1 ring-border-subtle"
          >
            {initialsOf(row.displayName)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-text-main">
                {row.displayName}
              </span>
              <ClientSegmentBadge segment={row.primarySegment} />
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-top text-sm text-text-sec">{row.phone || "—"}</td>
      <td className="px-3 py-3 align-top">
        <div className="text-sm font-semibold tabular-nums text-text-main">{row.visitsCount}</div>
        {row.mastersCount > 0 ? (
          <div className="text-[11px] text-text-sec">
            {T.table.mastersCountTemplate.replace("{count}", String(row.mastersCount))}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="font-display text-sm font-semibold tabular-nums text-text-main">
          {UI_FMT.priceLabel(row.lifetimeKopeks)}
        </div>
        {row.avgCheckKopeks > 0 ? (
          <div className="text-[11px] text-text-sec">
            {T.table.avgCheckTemplate.replace("{amount}", UI_FMT.priceLabel(row.avgCheckKopeks))}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top text-sm text-text-sec">
        {formatDaysAgo(row.lastVisitDaysAgo)}
      </td>
      <td className="px-3 py-3 align-top">
        {row.mainMaster ? (
          <div className="flex items-center gap-2">
            {row.mainMaster.avatarUrl ? (
              <FocalImage
                src={row.mainMaster.avatarUrl}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-input text-[10px] font-semibold text-text-sec ring-1 ring-border-subtle"
              >
                {initialsOf(row.mainMaster.displayName)}
              </span>
            )}
            <span className="truncate text-sm text-text-main">
              {row.mainMaster.displayName}
            </span>
          </div>
        ) : (
          <span className="text-sm text-text-sec">—</span>
        )}
      </td>
      <td className="px-2 py-3 align-top">
        <Link
          href="/cabinet/studio/calendar"
          className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
          aria-label={T.actions.book}
          title={T.actions.book}
        >
          <CalendarPlus className="h-4 w-4" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

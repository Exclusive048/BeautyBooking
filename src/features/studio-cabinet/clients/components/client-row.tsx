import { ResilientImage } from "@/components/ui/resilient-image";
import type {
  StudioCabinetServiceOption,
  StudioCabinetShellExtras,
} from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioClientRow } from "../lib/types";
import { formatDaysAgo, initialsOf } from "../lib/format";
import { ClientBookButton } from "./client-book-button";
import { ClientSegmentBadge } from "./client-segment-badge";

const T = UI_TEXT.studioCabinet.clientsV2;

type RowProps = {
  row: StudioClientRow;
  /** STUDIO-CLIENT-WRITE-DIALOG-A: shell-extras drive the dialog
   *  opened by the row's «Записать» button (was a redirect-to-
   *  calendar Link pre-fix). */
  studioId: string;
  scheduleMasters: StudioCabinetShellExtras["scheduleMasters"];
  services: StudioCabinetServiceOption[];
  /** TZ-DISPLAY-SALON-PARITY-01: salon tz for the «Записать» dialog. */
  timezone: string;
};

export function ClientTableRow({ row, studioId, scheduleMasters, services, timezone }: RowProps) {
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
          <div className="text-2xs text-text-sec">
            {T.table.mastersCountTemplate.replace("{count}", String(row.mastersCount))}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="font-display text-sm font-semibold tabular-nums text-text-main">
          {UI_FMT.priceLabel(row.lifetimeKopeks)}
        </div>
        {row.avgCheckKopeks > 0 ? (
          <div className="text-2xs text-text-sec">
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
              <ResilientImage
                src={row.mainMaster.avatarUrl}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec ring-1 ring-border-subtle"
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
        {/* STUDIO-CLIENT-WRITE-DIALOG-A: in-context dialog
            (CreateBookingDialog with prefilled client name + phone)
            replaces the previous `<Link href="/cabinet/studio/calendar">`
            that lost the client context completely. */}
        <ClientBookButton
          studioId={studioId}
          client={{ name: row.displayName, phone: row.phone ?? "" }}
          masters={scheduleMasters}
          services={services}
          timezone={timezone}
        />
      </td>
    </tr>
  );
}

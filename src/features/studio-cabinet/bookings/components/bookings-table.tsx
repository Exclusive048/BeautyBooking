import { Calendar } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import type { StudioBookingRow } from "../server/types";
import { BookingRow } from "./booking-row";

const T = UI_TEXT.studioCabinet.bookingsV2.table;
const E = UI_TEXT.studioCabinet.bookingsV2.empty;

type Props = {
  studioId: string;
  rows: StudioBookingRow[];
  masters: ScheduleMasterColumn[];
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for the "when" column. */
  timezone: string;
};

export function BookingsTable({ studioId, rows, masters, timezone }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card p-12 text-center">
        <Calendar className="h-10 w-10 text-text-sec/30" aria-hidden />
        <p className="text-base font-semibold text-text-main">{E.title}</p>
        <p className="max-w-sm text-sm text-text-sec">{E.hint}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="bg-bg-input/40">
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colWhen}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colMaster}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colClient}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colService}
              </th>
              <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colPrice}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colSource}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-text-sec">
                {T.colStatus}
              </th>
              <th className="w-10 px-2 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BookingRow
                key={row.id}
                studioId={studioId}
                row={row}
                masters={masters}
                timezone={timezone}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

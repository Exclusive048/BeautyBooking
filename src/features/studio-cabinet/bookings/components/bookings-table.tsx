import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import type { StudioBookingRow } from "../server/types";
import { BookingRow } from "./booking-row";

const T = UI_TEXT.studioCabinet.bookingsV2.table;
const E = UI_TEXT.studioCabinet.bookingsV2.empty;
/** Сброс фильтров = тот же путь без query-параметров. */
const PAGE_PATH = "/cabinet/studio/bookings";

type Props = {
  studioId: string;
  rows: StudioBookingRow[];
  masters: ScheduleMasterColumn[];
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for the "when" column. */
  timezone: string;
  /** RES-28: применён ли хоть один фильтр — от этого зависит, есть ли у пустого
   * состояния действие. Считает страница: только она знает значения по умолчанию. */
  isFiltered: boolean;
};

export function BookingsTable({ studioId, rows, masters, timezone, isFiltered }: Props) {
  if (rows.length === 0) {
    // RES-28: общий примитив. Действие — сброс фильтров, и только когда они
    // применены: кнопку «создать запись» сюда не дублируем, она уже стоит в
    // шапке страницы прямо над таблицей (один primary CTA на экран).
    return (
      <EmptyState
        variant="card"
        icon={Calendar}
        title={isFiltered ? E.filteredTitle : E.title}
        description={isFiltered ? E.filteredHint : E.hint}
        action={isFiltered ? { label: E.resetCta, href: PAGE_PATH } : undefined}
      />
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

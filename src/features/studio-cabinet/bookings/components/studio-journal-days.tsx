"use client";

import { JournalDaySection } from "@/features/bookings-journal/components/journal-sections";
import type { JournalStatusKey } from "@/features/bookings-journal/lib/journal-status";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import type { StudioBookingRow } from "../server/types";
import { StudioJournalRow } from "./studio-journal-row";

export type StudioJournalDay = {
  dateKey: string | null;
  revenueKopeks: number;
  rows: Array<{ row: StudioBookingRow; statusKey: JournalStatusKey }>;
};

/**
 * BOOKINGS-JOURNAL — записи журнала студии по дням салона. Клиентский список
 * одним островом: мастера для меню действий (перенос к другому мастеру)
 * передаются один раз, а не в каждую строку.
 */
export function StudioJournalDays({
  studioId,
  days,
  todayKey,
  masters,
  timezone,
}: {
  studioId: string;
  days: StudioJournalDay[];
  todayKey: string;
  masters: ScheduleMasterColumn[];
  timezone: string;
}) {
  return (
    <div className="space-y-5">
      {days.map((day) => (
        <JournalDaySection
          key={day.dateKey ?? "none"}
          dateKey={day.dateKey}
          todayKey={todayKey}
          count={day.rows.length}
          revenueKopeks={day.revenueKopeks}
        >
          {day.rows.map(({ row, statusKey }) => (
            <StudioJournalRow
              key={row.id}
              studioId={studioId}
              row={row}
              statusKey={statusKey}
              masters={masters}
              timezone={timezone}
            />
          ))}
        </JournalDaySection>
      ))}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.bookingWidget;
const WEEKDAYS_SHORT = T.weekdaysShort;
const MONTHS_GENITIVE = T.monthsGenitive;
const DAYS_BATCH_SIZE = 28;
const PAGE_SIZE = 7;

type Props = {
  providerId: string;
  selectedDateKey: string | null;
  onSelect: (dateKey: string) => void;
};

type DayCell = {
  dateKey: string;
  weekdayShort: string;
  dayOfMonth: number;
  monthShort: string;
  isWorkingDay: boolean;
};

function decomposeDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
  weekdayIdx: number;
} {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const jsDay = date.getUTCDay();
  return {
    year: y ?? 2000,
    month: (m ?? 1) - 1,
    day: d ?? 1,
    weekdayIdx: jsDay === 0 ? 6 : jsDay - 1,
  };
}

function buildCells(
  workingDays: Set<string>,
  baseFromDate: Date,
  count: number,
): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(baseFromDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateKey = [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const parts = decomposeDateKey(dateKey);
    cells.push({
      dateKey,
      weekdayShort: WEEKDAYS_SHORT[parts.weekdayIdx] ?? "",
      dayOfMonth: parts.day,
      monthShort: MONTHS_GENITIVE[parts.month]?.slice(0, 3) ?? "",
      isWorkingDay: workingDays.has(dateKey),
    });
  }
  return cells;
}

/**
 * Compact 7-day horizontal date strip with chevron pagination (32b).
 *
 * Loads up to 28 booking-days upfront from `/booking-days` (which
 * accounts for the 32a slot-fix horizon + schedule overrides + the
 * 60-day max scan), then renders pages of 7 cells. Cells that fall
 * on non-working dates render as disabled greys — the master has
 * those days off, so the user can't book them but still gets full
 * calendar continuity.
 */
export function DateGrid({ providerId, selectedDateKey, onSelect }: Props) {
  const [workingDays, setWorkingDays] = useState<Set<string>>(new Set());
  const [baseFromDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  });
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromKey = [
        baseFromDate.getUTCFullYear(),
        String(baseFromDate.getUTCMonth() + 1).padStart(2, "0"),
        String(baseFromDate.getUTCDate()).padStart(2, "0"),
      ].join("-");
      const url = new URL(
        `/api/public/providers/${providerId}/booking-days`,
        window.location.origin,
      );
      url.searchParams.set("from", fromKey);
      url.searchParams.set("limit", String(14));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { days: Array<{ date: string }> } }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError(T.daysLoadFailed);
        return;
      }
      const set = new Set<string>();
      for (const day of json.data.days) set.add(day.date);
      setWorkingDays(set);
    } catch {
      setError(T.daysLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [baseFromDate, providerId]);

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  const cells = buildCells(workingDays, baseFromDate, DAYS_BATCH_SIZE);
  const totalPages = Math.max(1, Math.ceil(cells.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const visibleCells = cells.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-text-sec">
          {T.dateLabel}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-subtle text-text-sec transition",
              page === 0 || loading
                ? "cursor-not-allowed opacity-40"
                : "hover:border-primary hover:text-primary",
            )}
            aria-label={T.prevWeek}
          >
            <ChevronLeft className="h-3 w-3" aria-hidden strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-subtle text-text-sec transition",
              page >= totalPages - 1 || loading
                ? "cursor-not-allowed opacity-40"
                : "hover:border-primary hover:text-primary",
            )}
            aria-label={T.nextWeek}
          >
            <ChevronRight className="h-3 w-3" aria-hidden strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {visibleCells.map((cell) => {
          const isSelected = cell.dateKey === selectedDateKey;
          const isDisabled = !cell.isWorkingDay;
          return (
            <button
              key={cell.dateKey}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(cell.dateKey)}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-lg border font-mono text-sm transition-all",
                isSelected
                  ? "border-primary bg-brand-gradient text-white shadow-brand"
                  : isDisabled
                    ? "cursor-not-allowed border-border-subtle bg-bg-page text-text-sec/40"
                    : "border-border-subtle bg-bg-card text-text-main hover:border-primary hover:bg-primary/5",
              )}
            >
              <span className={cn("text-[10px] uppercase tracking-wide", isSelected ? "opacity-95" : "opacity-75")}>
                {cell.weekdayShort}
              </span>
              <span className="text-base font-semibold">{cell.dayOfMonth}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-text-sec">{error}</p>
      ) : null}
    </div>
  );
}

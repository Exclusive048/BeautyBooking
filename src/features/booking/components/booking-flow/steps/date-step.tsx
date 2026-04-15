"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.publicProfile.bookingFlow;

// Months in genitive case for header display
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const DAYS_BATCH_SIZE = 14;

type BookingDay = { date: string }; // YYYY-MM-DD

type Props = {
  providerId: string;
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string) => void;
};

function dateKeyToObj(dateKey: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { year: y ?? 2000, month: (m ?? 1) - 1, day: d ?? 1 };
}

function objToDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Returns 0=Mon ... 6=Sun (ISO weekday - 1)
function getFirstDayOffset(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function todayKey(): string {
  const now = new Date();
  return objToDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

export function DateStep({ providerId, selectedDateKey, onSelectDate }: Props) {
  const today = todayKey();
  const todayObj = dateKeyToObj(today);

  const [viewYear, setViewYear] = useState(todayObj.year);
  const [viewMonth, setViewMonth] = useState(todayObj.month);

  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [nextFrom, setNextFrom] = useState<string>(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadedThroughRef = useRef<string>("");

  const loadDays = useCallback(
    async (from: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(`/api/public/providers/${providerId}/booking-days`, window.location.origin);
        url.searchParams.set("from", from);
        url.searchParams.set("limit", String(DAYS_BATCH_SIZE));

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { days: BookingDay[]; nextFrom: string } }
          | { ok: false; error: { message: string } }
          | null;

        if (!res.ok || !json || !json.ok) {
          setError(t.slotsLoadFailed);
          return;
        }

        const { days, nextFrom: next } = json.data;
        setAvailableDays((prev) => {
          const updated = new Set(prev);
          for (const d of days) updated.add(d.date);
          return updated;
        });
        setNextFrom(next);
        loadedThroughRef.current = next;

        // If we got fewer than the batch size, there may be no more
        setHasMore(days.length >= DAYS_BATCH_SIZE);
      } catch {
        setError(t.slotsLoadFailed);
      } finally {
        setLoading(false);
      }
    },
    [providerId]
  );

  // Initial load
  useEffect(() => {
    void loadDays(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // When navigating to a future month, pre-load more days
  function handleNextMonth() {
    goToNextMonth();
    const nextMonthStart = objToDateKey(
      viewMonth === 11 ? viewYear + 1 : viewYear,
      viewMonth === 11 ? 0 : viewMonth + 1,
      1
    );
    if (hasMore && nextMonthStart > loadedThroughRef.current) {
      void loadDays(nextFrom);
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOffset = getFirstDayOffset(viewYear, viewMonth);
  const cells = Array.from({ length: firstDayOffset + daysInMonth }, (_, i) =>
    i < firstDayOffset ? null : i - firstDayOffset + 1
  );
  // Pad to complete the last row
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) cells.push(null);
  }

  const monthLabel = `${t.months[viewMonth] ?? ""} ${viewYear}`;
  const prevMonthIsBeforeToday =
    viewYear < todayObj.year || (viewYear === todayObj.year && viewMonth <= todayObj.month);

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="icon"
          onClick={goToPrevMonth}
          disabled={prevMonthIsBeforeToday}
          aria-label={UI_TEXT.publicProfile.slots.prevWeek}
          className="rounded-xl"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-text-main capitalize">{monthLabel}</span>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleNextMonth}
          aria-label={UI_TEXT.publicProfile.slots.nextWeek}
          className="rounded-xl"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1">
        {t.daysOfWeek.map((day) => (
          <div key={day} className="py-1 text-center text-[11px] font-medium text-text-sec">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }
          const dateKey = objToDateKey(viewYear, viewMonth, day);
          const isPast = dateKey < today;
          const isAvailable = availableDays.has(dateKey);
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === today;
          const isDisabled = isPast || !isAvailable;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => !isDisabled && onSelectDate(dateKey)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              aria-label={`${day} ${MONTHS_GENITIVE[viewMonth] ?? ""}`}
              className={cn(
                "relative flex h-9 w-full items-center justify-center rounded-xl text-sm transition-colors",
                isSelected
                  ? "bg-gradient-to-br from-primary via-primary-hover to-primary-magenta font-semibold text-[rgb(var(--accent-foreground))] shadow-sm"
                  : isAvailable && !isPast
                    ? "bg-bg-input text-text-main hover:bg-primary/15 hover:text-primary font-medium cursor-pointer"
                    : isPast
                      ? "text-text-muted/40 cursor-not-allowed"
                      : "text-text-muted/30 cursor-not-allowed"
              )}
            >
              {day}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Load more / loading state */}
      {loading && (
        <p className="text-center text-xs text-text-sec">{t.calendarLoading}</p>
      )}
      {error && !loading && (
        <p className="text-center text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
      {!loading && hasMore && availableDays.size > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full rounded-xl text-xs"
          onClick={() => void loadDays(nextFrom)}
        >
          {t.calendarLoadMore}
        </Button>
      )}
      {!loading && !error && availableDays.size === 0 && (
        <p className="py-4 text-center text-sm text-text-sec">{t.calendarNoAvailable}</p>
      )}
    </div>
  );
}

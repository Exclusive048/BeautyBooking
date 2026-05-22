"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  EditorExceptionInput,
  ScheduleEditorSnapshot,
} from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleSettings.exceptions;
const E = UI_TEXT.studioCabinet.scheduleSettings.errors;

type Props = {
  studioId: string;
  masterId: string;
  initialSnapshot: ScheduleEditorSnapshot;
};

type DraftException = EditorExceptionInput;

function toInput(
  row: ScheduleEditorSnapshot["exceptions"][number],
): DraftException {
  return {
    date: row.date,
    isWorkday: row.isWorkday,
    scheduleMode: row.scheduleMode,
    startTime: row.startTime,
    endTime: row.endTime,
    breaks: row.breaks,
    fixedSlotTimes: row.fixedSlotTimes,
    note: row.note,
  };
}

function todayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase B — Exceptions tab.
 *
 * Simplified vs master cabinet's version: flat list (no
 * consecutive-day grouping), inline add form (no separate modal),
 * direct delete buttons. Same backend contract — PATCHes the
 * `{ bookingExceptions: [...] }` slice through the existing
 * `/api/cabinet/master/schedule?studioId&masterId` endpoint, which
 * normalises and replaces the full exception list per call.
 *
 * UX:
 *   - List shows only future + today's exceptions (past hidden —
 *     they've already happened, not actionable).
 *   - «Add exception» reveals an inline form (date + workday toggle
 *     + custom hours if workday + optional note).
 *   - Delete is per-row, with an immediate save on confirm.
 *
 * Save is debounced via explicit «Сохранить» button (Phase A
 * convention) — the form's add/delete actions update local state
 * and a single save commits the full list.
 */
export function ExceptionsTab({ studioId, masterId, initialSnapshot }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<DraftException[]>(() =>
    initialSnapshot.exceptions.map(toInput),
  );
  const [adding, setAdding] = useState(false);
  const [newException, setNewException] = useState<DraftException>(() => ({
    date: todayDateKey(),
    isWorkday: false,
    scheduleMode: "FLEXIBLE",
    startTime: null,
    endTime: null,
    breaks: [],
    fixedSlotTimes: [],
    note: null,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const today = todayDateKey();

  // Hide past exceptions — they've already happened. Sort upcoming
  // ascending so the nearest exception surfaces first.
  const visibleItems = useMemo(
    () =>
      [...items]
        .filter((row) => row.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [items, today],
  );

  const handleAddClick = () => {
    setError(null);
    setAdding(true);
  };

  const handleCancelAdd = () => {
    setAdding(false);
    setNewException({
      date: todayDateKey(),
      isWorkday: false,
      scheduleMode: "FLEXIBLE",
      startTime: null,
      endTime: null,
      breaks: [],
      fixedSlotTimes: [],
      note: null,
    });
    setError(null);
  };

  // Append the staged exception to the list AND save the full list
  // in one go — single PATCH simplifies error handling.
  const handleConfirmAdd = async () => {
    if (newException.date < today) {
      setError(E.exceptionDatePast);
      return;
    }
    if (
      newException.isWorkday &&
      newException.startTime &&
      newException.endTime &&
      newException.endTime <= newException.startTime
    ) {
      setError(E.exceptionEndBeforeStart);
      return;
    }
    if (items.some((row) => row.date === newException.date)) {
      setError(E.exceptionDuplicateDate);
      return;
    }
    const next = [...items, newException];
    await saveAll(next, () => {
      setItems(next);
      handleCancelAdd();
    });
  };

  const handleDelete = async (date: string) => {
    const next = items.filter((row) => row.date !== date);
    await saveAll(next, () => setItems(next));
  };

  const saveAll = async (
    next: DraftException[],
    onSuccess: () => void,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId, masterId });
      const response = await fetch(
        `/api/cabinet/master/schedule?${params.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingExceptions: next }),
        },
      );
      const json = (await response.json().catch(() => null)) as
        | ApiResponse<unknown>
        | null;
      if (!response.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : E.save;
        setError(message);
        return;
      }
      onSuccess();
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError(E.save);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {visibleItems.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
          <Calendar className="h-8 w-8 text-text-sec/40" aria-hidden />
          <p className="text-base font-semibold text-text-main">
            {T.emptyTitle}
          </p>
          <p className="max-w-md text-sm text-text-sec">{T.emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((row) => (
            <div
              key={row.date}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-main">{row.date}</p>
                <p className="mt-0.5 text-xs text-text-sec">
                  {row.isWorkday
                    ? T.cardWorkingHoursTemplate
                        .replace("{from}", row.startTime ?? "—")
                        .replace("{to}", row.endTime ?? "—")
                    : T.cardDayOff}
                </p>
                {row.note ? (
                  <p className="mt-0.5 text-xs italic text-text-sec">
                    {row.note}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(row.date)}
                disabled={saving}
                aria-label={T.deleteAria}
                className="shrink-0 rounded-lg p-2 text-text-sec transition-colors hover:bg-bg-input hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-5">
          <p className="text-sm font-medium text-text-main">{T.addFormTitle}</p>
          <label className="block">
            <span className="mb-1 block text-xs text-text-sec">
              {T.dateLabel}
            </span>
            <Input
              type="date"
              value={newException.date}
              min={today}
              onChange={(e) =>
                setNewException((prev) => ({ ...prev, date: e.target.value }))
              }
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-text-main">{T.workdayToggle}</span>
            <Switch
              size="sm"
              checked={newException.isWorkday}
              onCheckedChange={(next) =>
                setNewException((prev) => ({
                  ...prev,
                  isWorkday: next,
                  startTime: next ? "10:00" : null,
                  endTime: next ? "19:00" : null,
                }))
              }
            />
          </div>
          {newException.isWorkday ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-text-sec">{T.fromLabel}</span>
                <Input
                  type="time"
                  value={newException.startTime ?? ""}
                  onChange={(e) =>
                    setNewException((prev) => ({
                      ...prev,
                      startTime: e.target.value || null,
                    }))
                  }
                  className="w-28"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-text-sec">{T.toLabel}</span>
                <Input
                  type="time"
                  value={newException.endTime ?? ""}
                  onChange={(e) =>
                    setNewException((prev) => ({
                      ...prev,
                      endTime: e.target.value || null,
                    }))
                  }
                  className="w-28"
                />
              </label>
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs text-text-sec">
              {T.noteLabel}
            </span>
            <Input
              type="text"
              value={newException.note ?? ""}
              onChange={(e) =>
                setNewException((prev) => ({
                  ...prev,
                  note: e.target.value || null,
                }))
              }
              placeholder={T.notePlaceholder}
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={handleCancelAdd}
              disabled={saving}
              size="sm"
            >
              {T.cancelLabel}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirmAdd()}
              disabled={saving}
              size="sm"
            >
              {saving ? T.savingLabel : T.confirmAddLabel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={handleAddClick}
          disabled={saving}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {T.addLabel}
        </Button>
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {savedAt && !error ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          {T.savedHint}
        </p>
      ) : null}
    </div>
  );
}

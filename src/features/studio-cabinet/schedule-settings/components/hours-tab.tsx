"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  DayScheduleDto,
  ScheduleEditorSnapshot,
} from "@/lib/schedule/editor-shared";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleSettings.hours;
const E = UI_TEXT.studioCabinet.scheduleSettings.errors;

// Russian weekday labels — Sunday at index 0 to match `DayScheduleDto.dayOfWeek`
// from the editor-shared types.
const WEEKDAY_LABELS: Record<number, string> = {
  0: "Воскресенье",
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
};

type Props = {
  studioId: string;
  masterId: string;
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase A — Hours tab.
 *
 * Per-day workday toggle + start/end time inputs. Save calls the
 * existing master schedule endpoint with `?studioId&masterId` query
 * params — `resolveScheduleActor` (`lib/schedule/schedule-actor.ts`) handles the
 * `STUDIO_ADMIN` actor mode. NO new backend endpoint.
 *
 * Simplified vs the master cabinet version: no per-day action menu
 * (copy-from-day, duplicate, etc.) — those are UX polish for Phase B
 * if the studio admin asks for them.
 *
 * Save model: explicit «Сохранить» button (Phase A) instead of the
 * debounced auto-save the master cabinet uses. Studio admin works
 * across multiple masters in one session — explicit save keeps
 * intent clearer and aligns with `MoveBookingDialog` /
 * `CreateBookingDialog` UX precedent from earlier studio fixes.
 * Phase B may switch to auto-save if QA prefers it.
 */
export function HoursTab({ studioId, masterId, initialSnapshot }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<DayScheduleDto[]>(
    initialSnapshot.weekSchedule,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const updateDay = (dayOfWeek: number, patch: Partial<DayScheduleDto>) => {
    setDraft((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day,
      ),
    );
    setSavedAt(null);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId, masterId });
      await fetchJsonWithAuth<unknown>(
        `/api/cabinet/master/schedule?${params.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekSchedule: draft }),
        },
      );
      setSavedAt(Date.now());
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.save));
    } finally {
      setSaving(false);
    }
  };

  // Sort: Mon-Sun reading order (1..6, then 0=Sunday at end).
  const sortedDays = [...draft].sort((a, b) => {
    const ax = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
    const bx = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
    return ax - bx;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-bg-card">
        <div className="divide-y divide-border-subtle">
          {sortedDays.map((day) => (
            <div
              key={day.dayOfWeek}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="flex min-w-[140px] items-center gap-3">
                <Switch
                  size="sm"
                  checked={day.isWorkday}
                  onCheckedChange={(next) =>
                    updateDay(day.dayOfWeek, { isWorkday: next })
                  }
                  aria-label={T.workdayAriaTemplate.replace(
                    "{day}",
                    WEEKDAY_LABELS[day.dayOfWeek] ?? "",
                  )}
                />
                <span className="text-sm font-medium text-text-main">
                  {WEEKDAY_LABELS[day.dayOfWeek] ?? ""}
                </span>
              </div>

              {day.isWorkday ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs text-text-sec">{T.fromLabel}</span>
                    <Input
                      type="time"
                      value={day.startTime}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, { startTime: e.target.value })
                      }
                      className="w-28"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs text-text-sec">{T.toLabel}</span>
                    <Input
                      type="time"
                      value={day.endTime}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, { endTime: e.target.value })
                      }
                      className="w-28"
                    />
                  </label>
                </div>
              ) : (
                <span className="text-sm italic text-text-sec">
                  {T.dayOffLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {savedAt ? (
          <p className="text-xs text-success-text">
            {T.savedHint}
          </p>
        ) : (
          <span aria-hidden />
        )}
        <Button variant="primary" onClick={() => void onSave()} disabled={saving}>
          {saving ? T.savingLabel : T.saveLabel}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Coffee } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleSettings.breaks;
const E = UI_TEXT.studioCabinet.scheduleSettings.errors;

type Props = {
  studioId: string;
  masterId: string;
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase B — Breaks tab.
 *
 * Mirrors the master cabinet's Breaks tab (post-25-FIX-A): just the
 * buffer-between-bookings setting + hint that per-day breaks are
 * managed via the schedule editor itself. The «recurring breaks»
 * editor was rolled back in master cabinet — single source of truth
 * on `ScheduleTemplateBreak` is the schedule editor. Same decision
 * applies to studio.
 *
 * Save: explicit «Сохранить» (consistent with Phase A Hours/Rules) →
 * PATCH endpoint with `{ bufferBetweenBookingsMin: N }` slice.
 */
export function BreaksTab({ studioId, masterId, initialSnapshot }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<number>(
    initialSnapshot.bufferBetweenBookingsMin,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId, masterId });
      const response = await fetch(
        `/api/cabinet/master/schedule?${params.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bufferBetweenBookingsMin: draft }),
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
      <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-main">
              {T.bufferTitle}
            </p>
            <p className="mt-0.5 text-xs text-text-sec">{T.bufferHint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              type="number"
              min={0}
              max={120}
              value={draft}
              onChange={(e) => {
                setDraft(Math.max(0, Number(e.target.value) || 0));
                setSavedAt(null);
              }}
              className="w-24"
            />
            <span className="text-sm text-text-sec">{T.minutesSuffix}</span>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-border-subtle bg-bg-input/40 p-4 text-xs text-text-sec">
        <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-text-sec/70" aria-hidden />
        <p>{T.recurringBreaksHint}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {savedAt ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
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

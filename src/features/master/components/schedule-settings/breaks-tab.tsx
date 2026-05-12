"use client";

import { useState } from "react";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { BreaksFooterHint } from "./breaks/breaks-footer-hint";
import { BufferSection } from "./breaks/buffer-section";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * Breaks tab — buffer between bookings + footer hint about click-to-block
 * in the week view.
 *
 * The recurring-breaks UI was rolled back in 25-FIX-A: per-day breaks are
 * already managed from the Hours tab (single source of truth on
 * `ScheduleTemplateBreak`), and a second surface for the same data was
 * disorienting. The orchestration helpers (`appendRecurringBreak`,
 * `groupRecurringBreaks`, etc.) and the section/modal components remain on
 * disk for a future activation if we decide to re-introduce a multi-day
 * shortcut. They are simply not mounted today.
 */
export function BreaksTab({ initialSnapshot }: Props) {
  const [draft, setDraft] = useState<number>(() => initialSnapshot.bufferBetweenBookingsMin);
  const [baseline, setBaseline] = useState<number>(
    () => initialSnapshot.bufferBetweenBookingsMin
  );

  const { setStatus, setErrorMessage } = useSaveStatus();

  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      const response = await fetch("/api/cabinet/master/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bufferBetweenBookingsMin: value }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : T.errors.save;
        return { ok: false, message };
      }
      return { ok: true };
    },
    setStatus,
    setErrorMessage,
    onSaved: (value) => setBaseline(value),
  });

  return (
    <div className="space-y-6">
      <BufferSection value={draft} onChange={setDraft} />
      <BreaksFooterHint />
    </div>
  );
}

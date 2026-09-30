"use client";

import { useState } from "react";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { BufferSection } from "./breaks/buffer-section";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";
import { useScheduleEndpoint } from "./schedule-endpoint-context";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * Breaks tab — buffer between bookings.
 *
 * PWA-UX-BATCH-01 (2026-09-15): подсказка «Нажмите в календаре, чтобы закрыть
 * одно окошко» снята по решению владельца — она отправляла на другой экран и
 * описывала жест, который на телефоне не очевиден; вкладка держит только
 * настройку паузы между записями.
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

  // STUDIO-MASTER-PROFILES: личное расписание или профиля в студии.
  const endpoint = useScheduleEndpoint();
  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      try {
        await fetchJsonWithAuth<unknown>(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bufferBetweenBookingsMin: value }),
        });
      } catch (error) {
        return { ok: false, message: serverMessageOr(error, T.errors.save) };
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
    </div>
  );
}

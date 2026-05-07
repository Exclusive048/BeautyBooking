"use client";

import { useState } from "react";
import type { ScheduleEditorSnapshot, VisibilityDto } from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";
import { NewClientsSection } from "./visibility/new-clients-section";
import { SlotVisibilitySection } from "./visibility/slot-visibility-section";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * Visibility tab — public catalog + slot precision + accept-new-clients.
 * Auto-saves through the same PATCH endpoint as Hours / Rules; status
 * chip is shared via SaveStatusProvider.
 */
export function VisibilityTab({ initialSnapshot }: Props) {
  const [draft, setDraft] = useState<VisibilityDto>(() => initialSnapshot.visibility);
  const [baseline, setBaseline] = useState<VisibilityDto>(() => initialSnapshot.visibility);

  const { setStatus, setErrorMessage } = useSaveStatus();

  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      const response = await fetch("/api/cabinet/master/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: value }),
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
      <SlotVisibilitySection visibility={draft} onChange={setDraft} />
      <NewClientsSection
        acceptNewClients={draft.acceptNewClients}
        onChange={(next) => setDraft((prev) => ({ ...prev, acceptNewClients: next }))}
      />
    </div>
  );
}

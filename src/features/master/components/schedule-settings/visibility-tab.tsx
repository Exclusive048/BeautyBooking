"use client";

import { useState } from "react";
import type { ScheduleEditorSnapshot, VisibilityDto } from "@/lib/schedule/editor-shared";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";
import { useIsStudioProfileSchedule, useScheduleEndpoint } from "./schedule-endpoint-context";
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

  // STUDIO-MASTER-PROFILES: личное расписание или профиля в студии.
  const endpoint = useScheduleEndpoint();
  const studioProfile = useIsStudioProfileSchedule();
  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      try {
        await fetchJsonWithAuth<unknown>(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: value }),
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
      <SlotVisibilitySection visibility={draft} onChange={setDraft} showPublished={!studioProfile} />
      <NewClientsSection
        acceptNewClients={draft.acceptNewClients}
        onChange={(next) => setDraft((prev) => ({ ...prev, acceptNewClients: next }))}
      />
    </div>
  );
}

"use client";

import { Users } from "lucide-react";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleSettings.masterPicker;

type MasterOption = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type Props = {
  masters: MasterOption[];
  selectedMasterId: string | null;
  onChange: (nextMasterId: string) => void;
};

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase A — master picker for the studio
 * cabinet schedule settings. Per-master schema → studio admin must
 * pick which master's settings to edit. Mirrors the picker pattern
 * from `MoveBookingDialog` (STUDIO-RESCHEDULE-VALIDATION-A) but
 * standalone (not embedded inside another dialog).
 *
 * Active-master-only — the route filters via `isStudioMasterActive`
 * before passing the list here, so INVITED / DISABLED masters never
 * appear (invariant #24 enforced at the data layer).
 */
export function MasterPicker({ masters, selectedMasterId, onChange }: Props) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-main">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {T.label}
        </span>
        <Select
          value={selectedMasterId ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {masters.map((master) => (
            <option key={master.id} value={master.id}>
              {master.name}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-text-sec">{T.hint}</p>
      </label>
    </div>
  );
}

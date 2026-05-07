"use client";

import { useState } from "react";
import type {
  BookingRulesDto,
  HotSlotsDto,
  ScheduleEditorSnapshot,
} from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { BookingWindowSection } from "./rules/booking-window-section";
import { CancellationSection } from "./rules/cancellation-section";
import { ConfirmationSection } from "./rules/confirmation-section";
import { HotSlotsSection } from "./rules/hot-slots-section";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Draft = {
  bookingRules: BookingRulesDto;
  hotSlots: HotSlotsDto | null;
};

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
  /** From `getCurrentPlan().features.hotSlots` — false → render locked card. */
  hotSlotsAllowed: boolean;
};

/**
 * Rules tab — booking window, confirmation mode, cancellation, hot slots.
 * Auto-saves to /api/cabinet/master/schedule (same endpoint as Hours tab).
 *
 * On a feature-gate failure (non-PRO trying to enable hotSlots), the
 * server returns 403 with code FEATURE_GATE; we surface the localised
 * message via the shared save-status chip.
 */
export function RulesTab({ initialSnapshot, hotSlotsAllowed }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({
    bookingRules: initialSnapshot.bookingRules,
    hotSlots: initialSnapshot.hotSlots,
  }));
  const [baseline, setBaseline] = useState<Draft>(() => ({
    bookingRules: initialSnapshot.bookingRules,
    hotSlots: initialSnapshot.hotSlots,
  }));

  const { setStatus, setErrorMessage } = useSaveStatus();

  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      const response = await fetch("/api/cabinet/master/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRules: value.bookingRules,
          hotSlots: value.hotSlots,
        }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        const isGated = json && !json.ok && json.error.code === "FEATURE_GATE";
        const message = isGated
          ? T.errors.hotSlotsLocked
          : json && !json.ok
          ? json.error.message
          : T.errors.save;
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
      <BookingWindowSection
        rules={draft.bookingRules}
        onChange={(rules) => setDraft((prev) => ({ ...prev, bookingRules: rules }))}
      />
      <ConfirmationSection
        autoConfirm={draft.bookingRules.autoConfirm}
        onChange={(autoConfirm) =>
          setDraft((prev) => ({
            ...prev,
            bookingRules: { ...prev.bookingRules, autoConfirm },
          }))
        }
      />
      <CancellationSection
        rules={draft.bookingRules}
        onChange={(rules) => setDraft((prev) => ({ ...prev, bookingRules: rules }))}
      />
      <HotSlotsSection
        hotSlots={draft.hotSlots}
        onChange={(hotSlots) => setDraft((prev) => ({ ...prev, hotSlots }))}
        isLocked={!hotSlotsAllowed}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  normalizeSlotStepMin,
  type BookingRulesDto,
  type HotSlotsDto,
  type ScheduleEditorSnapshot,
  type SlotStepMin,
} from "@/lib/schedule/editor-shared";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { BookingWindowSection } from "./rules/booking-window-section";
import { CancellationSection } from "./rules/cancellation-section";
import { ConfirmationSection } from "./rules/confirmation-section";
import { HotSlotsSection } from "./rules/hot-slots-section";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";
import { useScheduleEndpoint } from "./schedule-endpoint-context";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Draft = {
  bookingRules: BookingRulesDto;
  hotSlots: HotSlotsDto | null;
  slotStepMin: SlotStepMin;
};

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
  /** From `getCurrentPlan().features.hotSlots` — false → render locked card. */
  hotSlotsAllowed: boolean;
};

/**
 * Rules tab — booking window (with slot step), confirmation mode,
 * cancellation, hot slots. Auto-saves to /api/cabinet/master/schedule.
 *
 * On a feature-gate failure (non-PRO trying to enable hotSlots), the
 * server returns 403 with code FEATURE_GATE; we surface the localised
 * message via the shared save-status chip.
 */
export function RulesTab({ initialSnapshot, hotSlotsAllowed }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({
    bookingRules: initialSnapshot.bookingRules,
    hotSlots: initialSnapshot.hotSlots,
    slotStepMin: normalizeSlotStepMin(initialSnapshot.slotStepMin),
  }));
  const [baseline, setBaseline] = useState<Draft>(() => ({
    bookingRules: initialSnapshot.bookingRules,
    hotSlots: initialSnapshot.hotSlots,
    slotStepMin: normalizeSlotStepMin(initialSnapshot.slotStepMin),
  }));

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
          body: JSON.stringify({
            bookingRules: value.bookingRules,
            hotSlots: value.hotSlots,
            slotStepMin: value.slotStepMin,
          }),
        });
      } catch (error) {
        // Горящие окошки закрыты тарифом — своя строка поверхности (с
        // подсказкой про тариф) точнее серверной.
        const message =
          error instanceof ApiClientError && error.code === "FEATURE_GATE"
            ? T.errors.hotSlotsLocked
            : serverMessageOr(error, T.errors.save);
        return { ok: false, message };
      }
      return { ok: true };
    },
    setStatus,
    setErrorMessage,
    onSaved: (value) => setBaseline(value),
  });

  return (
    <div className="space-y-6" data-guide="rules">
      <BookingWindowSection
        rules={draft.bookingRules}
        onChange={(rules) => setDraft((prev) => ({ ...prev, bookingRules: rules }))}
        slotStepMin={draft.slotStepMin}
        onSlotStepChange={(slotStepMin) => setDraft((prev) => ({ ...prev, slotStepMin }))}
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

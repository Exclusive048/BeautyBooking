"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import {
  OperatorSlotPicker,
  type OperatorSlot,
} from "@/features/booking/components/operator-slot-picker";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.moveDialog;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type Props = {
  studioId: string;
  bookingId: string;
  currentMasterId: string;
  currentStartAtUtc: string;
  /**
   * STUDIO-RESCHEDULE-VALIDATION-A #1а: the booking's serviceId is
   * used to gate (disabled + tooltip) masters who don't perform this
   * service. Defense-in-depth — backend's
   * `assertMasterPerformsService` still rejects server-side.
   */
  bookingServiceId: string;
  masters: ScheduleMasterColumn[];
  mode: "master" | "time";
  /**
   * TZ-DISPLAY-SALON-PARITY-01: salon (provider) tz — the day strip and slot
   * times render in it, matching the grid a cross-tz admin is looking at.
   */
  timezone: string;
  open: boolean;
  onClose: () => void;
};

export function MoveBookingDialog({
  studioId,
  bookingId,
  currentMasterId,
  currentStartAtUtc,
  bookingServiceId,
  masters,
  mode,
  timezone,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [masterId, setMasterId] = useState(currentMasterId);
  // MOVE-BOOKING-SLOTS-01: новое время — свободное окошко исполнителя (тот же
  // `OperatorSlotPicker`, что у ручной записи), а не `datetime-local`. Раньше
  // администратор вбивал любое время и узнавал о занятости отказом сервера.
  const [slot, setSlot] = useState<OperatorSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMasterId(currentMasterId);
    setSlot(null);
    setError(null);
  }, [open, currentMasterId, currentStartAtUtc]);

  const targetMasterId = mode === "master" ? masterId : currentMasterId;

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    if (!slot) {
      setError(UI_TEXT.schedule.operatorSlots.required);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(
        `/api/studio/bookings/${bookingId}/move`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            studioId,
            targetMasterId,
            // Окошко пришло с сервера инстантом UTC — конвертировать нечего.
            targetStartAt: slot.startAtUtc,
            strategy: "KEEP_SERVICE",
            pricing: "KEEP_PRICE",
          }),
        },
      );
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.move));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "master" ? T.titleToMaster : T.titleTime;

  return (
    <ModalSurface open={open} onClose={handleClose} title={title}>
      <div className="space-y-4">
        {mode === "master" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.masterLabel}
            </span>
            {/* STUDIO-RESCHEDULE-VALIDATION-A #1а: gate masters who
                don't perform this service. Per spec visibility-over-
                hiding — render the option but `disabled` so the
                studio admin understands why it's locked. Backend
                still validates with `assertMasterPerformsService`
                in case a stale UI sends a forbidden value. */}
            <Select
              value={masterId}
              onChange={(e) => {
                setMasterId(e.target.value);
                setSlot(null);
              }}
              disabled={submitting}
            >
              {masters
                .filter((m) => m.isAvailable)
                .map((m) => {
                  const performsService = m.serviceIds.includes(bookingServiceId);
                  return (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={!performsService}
                    >
                      {performsService
                        ? m.name
                        : `${m.name} · ${T.masterIncompatibleSuffix}`}
                    </option>
                  );
                })}
            </Select>
            {!masters
              .find((m) => m.id === masterId)
              ?.serviceIds.includes(bookingServiceId) ? (
              <p className="mt-1 text-xs text-warning-text">
                {T.masterIncompatibleHint}
              </p>
            ) : null}
          </label>
        ) : null}

        {open ? (
          <OperatorSlotPicker
            providerId={targetMasterId || null}
            serviceId={bookingServiceId || null}
            timeZone={timezone}
            value={slot}
            onChange={setSlot}
            // Текущее время записи предвыбрано: при переносе к другому мастеру
            // «в то же время» ничего больше выбирать не нужно, если он свободен.
            prefillIso={currentStartAtUtc}
            // MOVE-PICKER-DURATION: окошки — той длины, которую проверит
            // перенос к выбранному мастеру (все услуги записи, его
            // длительности); у того же мастера окно самой записи не занято.
            moveBookingId={bookingId}
            missingHint={UI_TEXT.schedule.operatorSlots.chooseMasterFirst}
            disabled={submitting}
          />
        ) : null}

        {error ? (
          <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting || !slot}>
            {submitting ? T.submitting : T.confirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
